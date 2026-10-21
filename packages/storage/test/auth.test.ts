import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { AuthRequiredError, OfflineError } from '../src/errors.ts';

const NOW = 1_800_000_000_000;

/** The sign-in helper's `/api/auth/token`: answers each call with the next queued reply. */
function helper() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const replies: Array<(signal: AbortSignal) => Promise<Response>> = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected token call');
    return reply(init!.signal!);
  });
  const token = (accessToken: string, expiresAt = NOW + 3_600_000) =>
    replies.push(async () => Response.json({ accessToken, expiresAt }));
  const status = (code: number, body: unknown = {}) => replies.push(async () => Response.json(body, { status: code }));
  const down = () =>
    replies.push(async () => {
      throw new TypeError('Failed to fetch');
    });
  /** Never answers until aborted. */
  const hang = () =>
    replies.push(
      (signal) =>
        new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
  return { calls, fetch, token, status, down, hang };
}

let api: ReturnType<typeof helper>;
let now: number;
let cookie: string;
const navigate = vi.fn();
const mk = (timeoutMs?: number) =>
  createAuth({ fetch: api.fetch as typeof fetch, navigate, cookies: () => cookie, now: () => now, timeoutMs });

beforeEach(() => {
  api = helper();
  now = NOW;
  cookie = 'other=1; taskapp_signed_in=1';
  navigate.mockReset();
});

describe('createAuth (sign-in helper)', () => {
  it('getToken POSTs to /api/auth/token with the CSRF header and returns the access token', async () => {
    api.token('at1');
    expect(await mk().getToken()).toBe('at1');
    const { url, init } = api.calls[0]!;
    expect(url).toBe('/api/auth/token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-TaskApp-Auth': '1' });
    expect(init.credentials).toBe('same-origin');
  });

  it('keeps the access token in memory until a minute before it expires', async () => {
    const auth = mk();
    api.token('at1', NOW + 10 * 60_000);
    expect(await auth.getToken()).toBe('at1');
    now = NOW + 8 * 60_000;
    expect(await auth.getToken()).toBe('at1');
    expect(api.calls).toHaveLength(1);
    now = NOW + 9 * 60_000 + 1;
    api.token('at2');
    expect(await auth.getToken()).toBe('at2');
    expect(api.calls).toHaveLength(2);
  });

  it('fetches a new token when asked for a fresh one (Graph rejected the kept one)', async () => {
    const auth = mk();
    api.token('at1');
    await auth.getToken();
    api.token('at2');
    expect(await auth.getToken({ fresh: true })).toBe('at2');
  });

  it('shares one refresh between concurrent callers', async () => {
    const auth = mk();
    api.token('at1');
    expect(await Promise.all([auth.getToken(), auth.getToken(), auth.getToken()])).toEqual(['at1', 'at1', 'at1']);
    expect(api.calls).toHaveLength(1);
  });

  it('maps 401 to AuthRequiredError and forgets the kept token', async () => {
    const auth = mk();
    api.token('at1', NOW + 2 * 60_000);
    await auth.getToken();
    now += 90_000;
    api.status(401, { signin: true });
    await expect(auth.getToken()).rejects.toBeInstanceOf(AuthRequiredError);
    api.status(401, { signin: true });
    await expect(auth.getToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it.each([
    ['a 503', () => api.status(503)],
    ['a 500', () => api.status(500)],
    ['no network', () => api.down()],
    ['a body without a token', () => api.status(200, { nope: 1 })],
  ])('maps %s to OfflineError (retried later, not "sign in needed")', async (_, reply) => {
    const auth = mk();
    reply();
    await expect(auth.getToken()).rejects.toBeInstanceOf(OfflineError);
    api.token('at1');
    expect(await auth.getToken()).toBe('at1');
  });

  it('gives up on a token call after the time limit, as offline', async () => {
    api.hang();
    await expect(mk(20).getToken()).rejects.toThrow(new OfflineError('Sign-in helper timed out'));
  });

  it('signIn navigates the whole page to /api/auth/login', async () => {
    await mk().signIn();
    expect(navigate).toHaveBeenCalledWith('/api/auth/login');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('isSignedIn reads the helper’s readable hint cookie', () => {
    expect(mk().isSignedIn()).toBe(true);
    cookie = 'other=1';
    expect(mk().isSignedIn()).toBe(false);
    cookie = 'not_taskapp_signed_in=1';
    expect(mk().isSignedIn()).toBe(false);
  });

  describe('handleRedirect', () => {
    let store: Map<string, string>;
    const replaceState = vi.fn();

    beforeEach(() => {
      store = new Map([
        ['taskapp:cache-migrated', '1'],
      ]);
      vi.stubGlobal('localStorage', {
        get length() {
          return store.size;
        },
        key: (i: number) => [...store.keys()][i] ?? null,
        removeItem: (k: string) => store.delete(k),
      });
      replaceState.mockReset();
    });
    afterEach(() => vi.unstubAllGlobals());

    const at = (href: string) =>
      vi.stubGlobal('window', { location: { href }, history: { state: null, replaceState } });

    it('throws the helper’s sign-in error and removes it from the address bar', async () => {
      at('https://tasks.example/?signin_error=cancelled&x=1#h');
      await expect(mk().handleRedirect()).rejects.toThrow('Sign-in was cancelled');
      expect(replaceState).toHaveBeenCalledWith(null, '', '/?x=1#h');
    });

    it('survives a localStorage that throws', async () => {
      vi.stubGlobal('localStorage', {
        get length(): number {
          throw new Error('denied');
        },
      });
      at('https://tasks.example/');
      await expect(mk().handleRedirect()).resolves.toBeUndefined();
    });
  });
});
