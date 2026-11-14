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
const TASKS = { cookiePrefix: 'omarktasks', providers: { microsoft: 'Microsoft' } };
const BOTH = { cookiePrefix: 'omarktasks', providers: { microsoft: 'Microsoft', google: 'Google' } };
const TIME = {
  cookiePrefix: 'omarktime',
  providers: { google: 'Google' },
  appName: 'Omark Time',
  scopeErrors: { '': 'Tick every box', edit: 'Tick the box for editing events' },
};
const mk = (
  timeoutMs?: number,
  app: { cookiePrefix: string; providers: Record<string, string>; appName?: string; scopeErrors?: Record<string, string> } = TASKS,
) =>
  createAuth({ ...app, fetch: api.fetch as typeof fetch, navigate, cookies: () => cookie, now: () => now, timeoutMs });

beforeEach(() => {
  api = helper();
  now = NOW;
  cookie = 'other=1; omarktasks_signed_in=1';
  navigate.mockReset();
});

describe('createAuth (sign-in helper)', () => {
  it('getToken POSTs to /api/auth/token with the CSRF header and returns the access token', async () => {
    api.token('at1');
    expect(await mk().getToken()).toBe('at1');
    const { url, init } = api.calls[0]!;
    expect(url).toBe('/api/auth/token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-Omark-Auth': '1' });
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
    await expect(mk(20).getToken()).rejects.toThrow(new OfflineError('Sign-in helper timed out', 'signin'));
  });

  it.each([
    ['a 503', () => api.status(503)],
    ['no network', () => api.down()],
    ['a body without a token', () => api.status(200, { nope: 1 })],
    ['the time limit', () => api.hang()],
  ])('says the sign-in server is what could not be reached, for %s (#157)', async (_, reply) => {
    reply();
    await expect(mk(20).getToken()).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'signin' });
  });

  it('signIn navigates the whole page to /api/auth/login', async () => {
    await mk().signIn();
    expect(navigate).toHaveBeenCalledWith('/api/auth/login');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('signIn with a provider other than the default navigates to /api/auth/login?provider=<id>', async () => {
    await mk(undefined, BOTH).signIn('google');
    expect(navigate).toHaveBeenCalledWith('/api/auth/login?provider=google');
  });

  it('signIn with the default provider keeps the plain /api/auth/login, as before', async () => {
    await mk(undefined, BOTH).signIn('microsoft');
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login');
    await mk().signIn('microsoft');
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login');
  });

  it('signIn without a provider uses the one last seen signed in, else the default', async () => {
    cookie = 'omarktasks_signed_in=google';
    await mk(undefined, BOTH).signIn();
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=google');
    cookie = 'other=1';
    await mk(undefined, BOTH).signIn();
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login');
    cookie = 'omarktasks_signed_in=1';
    await mk(undefined, BOTH).signIn();
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login');
  });

  it('signIn with { returnTo } asks the helper to come back to that path', async () => {
    await mk(undefined, BOTH).signIn('microsoft', { returnTo: '/time' });
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?return=%2Ftime');
    await mk(undefined, BOTH).signIn('google', { returnTo: '/tasks' });
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=google&return=%2Ftasks');
    await mk(undefined, TIME).signIn('google', { add: 'calendar', returnTo: '/time' });
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=google&add=calendar&return=%2Ftime');
  });

  it('signIn with { add } asks the helper to add that access, naming the provider even when it is the default', async () => {
    await mk(undefined, TIME).signIn('google', { add: 'edit' });
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=google&add=edit');
    await mk(undefined, BOTH).signIn('google', { add: 'drive' });
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=google&add=drive');
    await mk(undefined, TIME).signIn('google');
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login');
  });

  it('signedInProvider reads the provider from the hint cookie; 1 is the default provider', () => {
    cookie = 'omarktasks_signed_in=google';
    expect(mk(undefined, BOTH).signedInProvider()).toBe('google');
    cookie = 'other=1; omarktasks_signed_in=1';
    expect(mk(undefined, BOTH).signedInProvider()).toBe('microsoft');
    cookie = 'omarktasks_signed_in=microsoft';
    expect(mk(undefined, BOTH).signedInProvider()).toBe('microsoft');
    cookie = 'other=1';
    expect(mk(undefined, BOTH).signedInProvider()).toBeNull();
    cookie = 'omarktasks_signed_in=';
    expect(mk(undefined, BOTH).signedInProvider()).toBeNull();
  });

  it.each(['nope', 'constructor', 'toString'])('signedInProvider reads a cookie value that is no provider (%s) as the default', (value) => {
    cookie = `omarktasks_signed_in=${value}`;
    expect(mk(undefined, BOTH).signedInProvider()).toBe('microsoft');
  });

  it('isSignedIn is true for a signed-in Google session too', () => {
    cookie = 'omarktasks_signed_in=google';
    expect(mk(undefined, BOTH).isSignedIn()).toBe(true);
  });

  it('availableProviders asks GET /api/auth/providers', async () => {
    api.status(200, { providers: ['microsoft', 'google'] });
    expect(await mk(undefined, BOTH).availableProviders()).toEqual(['microsoft', 'google']);
    expect(api.calls[0]!.url).toBe('/api/auth/providers');
  });

  it.each([
    ['a 503', () => api.status(503)],
    ['no network', () => api.down()],
    ['a body without a list', () => api.status(200, { nope: 1 })],
    ['an empty list', () => api.status(200, { providers: [] })],
  ])('availableProviders falls back to the default provider on %s', async (_, reply) => {
    reply();
    expect(await mk(undefined, BOTH).availableProviders()).toEqual(['microsoft']);
  });

  it('availableProviders gives up after 3 s, not the token time limit, and falls back to the default', async () => {
    vi.useFakeTimers();
    try {
      api.hang();
      let result: string[] | undefined;
      void mk(undefined, BOTH)
        .availableProviders()
        .then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(2_999);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toEqual(['microsoft']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isSignedIn reads the helper’s readable hint cookie', () => {
    expect(mk().isSignedIn()).toBe(true);
    cookie = 'other=1';
    expect(mk().isSignedIn()).toBe(false);
    cookie = 'not_omarktasks_signed_in=1';
    expect(mk().isSignedIn()).toBe(false);
  });

  it("isSignedIn reads the app's own cookie", () => {
    const time = { cookiePrefix: 'omark_time', providers: { microsoft: 'Microsoft' } };
    expect(mk(undefined, time).isSignedIn()).toBe(false);
    cookie = 'other=1; omark_time_signed_in=1';
    expect(mk(undefined, time).isSignedIn()).toBe(true);
    expect(mk().isSignedIn()).toBe(false);
  });

  describe('handleRedirect', () => {
    const replaceState = vi.fn();

    beforeEach(() => {
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

    it('gives an app its own text for a missing permission, per added access', async () => {
      at('https://time.example/?signin_error=scope&provider=google');
      await expect(mk(undefined, TIME).handleRedirect()).rejects.toThrow('Tick every box');
      at('https://time.example/?signin_error=scope&provider=google&add=edit&x=1');
      await expect(mk(undefined, TIME).handleRedirect()).rejects.toThrow('Tick the box for editing events');
      expect(replaceState).toHaveBeenLastCalledWith(null, '', '/?x=1');
      at('https://time.example/?signin_error=scope&provider=google&add=toString');
      await expect(mk(undefined, TIME).handleRedirect()).rejects.toThrow('Tick every box');
    });

    it("names the app's provider in the error", async () => {
      at('https://tasks.example/?signin_error=failed');
      await expect(mk().handleRedirect()).rejects.toThrow('Microsoft did not accept the sign-in');
      at('https://tasks.example/?signin_error=failed');
      await expect(mk(undefined, { cookiePrefix: 'omark_time', providers: { google: 'Google' } }).handleRedirect()).rejects.toThrow(
        'Google did not accept the sign-in',
      );
      at('https://tasks.example/?signin_error=unavailable');
      await expect(mk(undefined, { cookiePrefix: 'omark_time', providers: { google: 'Google' } }).handleRedirect()).rejects.toThrow(
        'Google could not be reached; check the connection and sign in again',
      );
    });

    it('names the provider from ?provider= in the error and removes it from the address bar', async () => {
      at('https://tasks.example/?signin_error=failed&provider=google&x=1');
      await expect(mk(undefined, BOTH).handleRedirect()).rejects.toThrow('Google did not accept the sign-in');
      expect(replaceState).toHaveBeenCalledWith(null, '', '/?x=1');
    });

    it('uses the default provider when ?provider= is absent or unknown', async () => {
      at('https://tasks.example/?signin_error=unavailable');
      await expect(mk(undefined, BOTH).handleRedirect()).rejects.toThrow('Microsoft could not be reached');
      at('https://tasks.example/?signin_error=unavailable&provider=nope');
      await expect(mk(undefined, BOTH).handleRedirect()).rejects.toThrow('Microsoft could not be reached');
    });

    it.each(['constructor', 'toString', '__proto__'])('uses the default provider for ?provider=%s', async (provider) => {
      at(`https://tasks.example/?signin_error=failed&provider=${provider}`);
      await expect(mk(undefined, BOTH).handleRedirect()).rejects.toThrow(new Error('Microsoft did not accept the sign-in'));
    });

    it.each(['constructor', 'toString', '__proto__', 'nope'])('gives the plain "Sign-in failed" for ?signin_error=%s', async (reason) => {
      at(`https://tasks.example/?signin_error=${reason}`);
      await expect(mk().handleRedirect()).rejects.toThrow(new Error('Sign-in failed'));
    });

    it('explains the scope error: sign in again and tick the Drive box', async () => {
      at('https://tasks.example/?signin_error=scope&provider=google');
      await expect(mk(undefined, { ...BOTH, appName: 'Omark Tasks' }).handleRedirect()).rejects.toThrow(
        new Error(
          "Google didn't give Omark Tasks access to its files. Sign in again and tick the box that lets it see, edit, create and delete its own Google Drive files.",
        ),
      );
    });

    it('calls the app "the app" in the scope error when it has no name', async () => {
      at('https://tasks.example/?signin_error=scope&provider=google');
      await expect(mk(undefined, BOTH).handleRedirect()).rejects.toThrow("Google didn't give the app access to its files.");
    });

    it('does nothing on a normal start', async () => {
      at('https://tasks.example/');
      await expect(mk().handleRedirect()).resolves.toBeUndefined();
      expect(replaceState).not.toHaveBeenCalled();
    });
  });
});

describe('createAuth bound to one provider (the one Omark app, U.4)', () => {
  const OMARK = { cookiePrefix: 'omark', providers: { microsoft: 'Microsoft', google: 'Google', googlecal: 'Google' } };
  const bound = (provider: string) =>
    createAuth({ ...OMARK, provider, fetch: api.fetch as typeof fetch, navigate, cookies: () => cookie, now: () => now });

  it("reads its provider's own signed-in cookie, and its accesses", () => {
    cookie = 'omark_microsoft_signed_in=microsoft; omark_googlecal_signed_in=googlecal:edit';
    expect(bound('microsoft').isSignedIn()).toBe(true);
    expect(bound('microsoft').signedInProvider()).toBe('microsoft');
    expect(bound('microsoft').accesses()).toEqual([]);
    expect(bound('googlecal').accesses()).toEqual(['edit']);
    expect(bound('google').isSignedIn()).toBe(false);
    expect(bound('google').signedInProvider()).toBeNull();
    cookie = 'omark_google_signed_in=google:calendar+edit';
    expect(bound('google').accesses()).toEqual(['calendar', 'edit']);
  });

  it('asks for its own token and signs in with its provider', async () => {
    api.token('t1');
    expect(await bound('googlecal').getToken()).toBe('t1');
    expect(api.calls[0]!.url).toBe('/api/auth/token?provider=googlecal');
    await bound('googlecal').signIn();
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=googlecal');
    await bound('microsoft').signIn(undefined, { returnTo: '/time' });
    expect(navigate).toHaveBeenLastCalledWith('/api/auth/login?provider=microsoft&return=%2Ftime');
  });

  it('signOut posts logout for its provider only', async () => {
    api.status(200, { ok: true });
    await bound('googlecal').signOut();
    expect(api.calls[0]!.url).toBe('/api/auth/logout?provider=googlecal');
    expect(api.calls[0]!.init.method).toBe('POST');
    expect((api.calls[0]!.init.headers as Record<string, string>)['X-Omark-Auth']).toBe('1');
  });

  it('an unbound client has no accesses and signs out of everything', async () => {
    cookie = 'omarktasks_signed_in=microsoft';
    expect(mk().accesses()).toEqual([]);
    api.status(200, { ok: true });
    await mk().signOut();
    expect(api.calls[0]!.url).toBe('/api/auth/logout');
  });
});
