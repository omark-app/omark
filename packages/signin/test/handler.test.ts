import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_SIZE, MAX_CHUNKS } from '../src/cookies.ts';
import { importCookieKey, pkceChallenge, seal, toBase64Url } from '../src/crypto.ts';
import { handleAuth } from '../src/handler.ts';
import type { AuthOptions, Env } from '../src/handler.ts';
import { google, microsoft } from '../src/providers.ts';

const ORIGIN = 'https://tasks.example';
const KEY = toBase64Url(new Uint8Array(32).fill(7));
const ENV: Env = {
  MSAL_CLIENT_ID: 'cid',
  MSAL_CLIENT_SECRET: 'secret',
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  COOKIE_KEY: KEY,
};
const MS_ONLY: Env = { MSAL_CLIENT_ID: 'cid', MSAL_CLIENT_SECRET: 'secret', COOKIE_KEY: KEY };
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/auth/drive.file';
const NOW = 1_800_000_000_000;
const TASKS: AuthOptions = { providers: { microsoft, google: google({ scopes: [DRIVE] }) }, cookiePrefix: 'taskapp' };

/** A browser's cookies for one origin: Set-Cookie applied, and only path-matching ones sent back. */
class Jar {
  readonly cookies = new Map<string, { value: string; path: string; attrs: string }>();

  take(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split('; ');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq);
      const path = attrs.find((a) => a.startsWith('Path='))!.slice(5);
      if (attrs.includes('Max-Age=0')) this.cookies.delete(name);
      else this.cookies.set(name, { value: pair!.slice(eq + 1), path, attrs: attrs.join('; ') });
    }
  }

  header(pathname: string): string {
    return [...this.cookies]
      .filter(([, c]) => pathname === c.path || pathname.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`))
      .map(([n, c]) => `${n}=${c.value}`)
      .join('; ');
  }
}

/** A provider's token endpoint: answers each call with the next queued reply. */
function tokenEndpoint(tokenUrl: string) {
  const calls: URLSearchParams[] = [];
  const replies: Array<() => Response> = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe(tokenUrl);
    calls.push(new URLSearchParams(init!.body as URLSearchParams));
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected token call');
    return reply();
  });
  const ok = (body: Record<string, unknown>) => replies.push(() => Response.json(body));
  const fail = (status: number, error?: string) => replies.push(() => Response.json(error ? { error } : {}, { status }));
  const down = () =>
    replies.push(() => {
      throw new TypeError('fetch failed');
    });
  return { calls, fetch, ok, fail, down };
}

const idToken = (claims: Record<string, unknown>) =>
  `x.${toBase64Url(new TextEncoder().encode(JSON.stringify(claims)))}.sig`;

let jar: Jar;
let ms: ReturnType<typeof tokenEndpoint>;
let gg: ReturnType<typeof tokenEndpoint>;
let now: number;

beforeEach(() => {
  jar = new Jar();
  ms = tokenEndpoint(TOKEN_URL);
  gg = tokenEndpoint(GOOGLE_TOKEN_URL);
  now = NOW;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function send(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  env: Env = ENV,
  options: AuthOptions = TASKS,
) {
  const url = new URL(path, ORIGIN);
  const cookie = jar.header(url.pathname);
  const req = new Request(url, { ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  const fetch = ((u: string | URL | Request, i?: RequestInit) =>
    String(u) === GOOGLE_TOKEN_URL ? gg.fetch(u, i) : ms.fetch(u, i)) as typeof globalThis.fetch;
  const res = await handleAuth(req, env, options, { fetch, now: () => now });
  jar.take(res);
  return res;
}

const post = (path: string, headers: Record<string, string> = { 'X-TaskApp-Auth': '1', Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' }) =>
  send(path, { method: 'POST', headers });

/** Runs login and callback with the provider's answer to the code (Microsoft unless told). */
async function signIn(
  tokens: Record<string, unknown> = { access_token: 'at0', expires_in: 3600, refresh_token: 'rt1' },
  provider?: 'google',
) {
  const login = await send(provider ? `/api/auth/login?provider=${provider}` : '/api/auth/login');
  const state = new URL(login.headers.get('Location')!).searchParams.get('state')!;
  (provider ? gg : ms).ok(tokens);
  return send(`/api/auth/callback?code=c0de&state=${state}`);
}

describe('GET /api/auth/login', () => {
  it('redirects to the consumers authorize endpoint with PKCE, keeping state and verifier in a short-lived HttpOnly cookie', async () => {
    const res = await send('/api/auth/login');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('Location')!);
    expect(to.origin + to.pathname).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    const q = to.searchParams;
    expect(q.get('client_id')).toBe('cid');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(q.get('scope')).toBe('openid profile Files.ReadWrite.AppFolder offline_access');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state')).toMatch(/^[\w-]{43}$/);
    expect(q.get('login_hint')).toBeNull();
    const cookie = jar.cookies.get('taskapp_login')!;
    expect(cookie.path).toBe('/api/auth/callback');
    expect(cookie.attrs).toBe('Path=/api/auth/callback; Max-Age=600; Secure; SameSite=Lax; HttpOnly');
    expect(cookie.value).not.toContain(q.get('state')!); // encrypted, not just signed
  });

  it('asks for app-folder access by default', async () => {
    const res = await send('/api/auth/login');
    const to = new URL(res.headers.get('Location')!);
    expect(res.headers.get('Location')!.startsWith('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize')).toBe(true);
    expect(to.searchParams.get('scope')).toBe('openid profile Files.ReadWrite.AppFolder offline_access');
  });

  it('asks for whole-drive access when ONEDRIVE_SCOPE is full', async () => {
    const res = await send('/api/auth/login', {}, { ...ENV, ONEDRIVE_SCOPE: 'full' });
    expect(new URL(res.headers.get('Location')!).searchParams.get('scope')).toBe('openid profile Files.ReadWrite offline_access');
  });

  it('uses MSAL_TENANT for the authority', async () => {
    const env = { ...ENV, MSAL_TENANT: 'common' };
    const res = await send('/api/auth/login', {}, env);
    expect(res.headers.get('Location')!.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')).toBe(true);
    const state = new URL(res.headers.get('Location')!).searchParams.get('state')!;
    const fetched: string[] = [];
    ms.fetch.mockImplementationOnce(async (url: string | URL | Request) => {
      fetched.push(String(url));
      return Response.json({ access_token: 'at', expires_in: 3600, refresh_token: 'rt' });
    });
    await send(`/api/auth/callback?code=c0de&state=${state}`, {}, env);
    expect(fetched).toEqual(['https://login.microsoftonline.com/common/oauth2/v2.0/token']);
  });

  it('treats a malformed MSAL_TENANT as missing configuration', async () => {
    const headers = { 'X-TaskApp-Auth': '1', Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };
    await signIn();
    const calls = ms.calls.length;
    const res = await send('/api/auth/token', { method: 'POST', headers }, { ...ENV, MSAL_TENANT: 'a/b' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(ms.calls.length).toBe(calls);
  });

  it('names the account from the last sign-in as login_hint', async () => {
    await signIn({ access_token: 'at0', expires_in: 3600, refresh_token: 'rt1', id_token: idToken({ preferred_username: 'me@example.com' }) });
    const res = await send('/api/auth/login');
    expect(new URL(res.headers.get('Location')!).searchParams.get('login_hint')).toBe('me@example.com');
  });

  it('rejects other methods and unknown routes', async () => {
    expect((await send('/api/auth/login', { method: 'POST' })).status).toBe(405);
    expect((await send('/api/auth/nope')).status).toBe(404);
  });

  it('answers 500 without the secrets or with a malformed COOKIE_KEY', async () => {
    expect((await send('/api/auth/login', {}, { ...ENV, MSAL_CLIENT_SECRET: undefined })).status).toBe(500);
    expect((await send('/api/auth/login', {}, { ...ENV, COOKIE_KEY: 'c2hvcnQ=' })).status).toBe(500);
  });
});

describe('GET /api/auth/callback', () => {
  it('redeems the code with the secret and the PKCE verifier, sets the session cookie and returns to /', async () => {
    const login = await send('/api/auth/login');
    const q = new URL(login.headers.get('Location')!).searchParams;
    ms.ok({ access_token: 'at0', expires_in: 3600, refresh_token: 'rt1' });
    const res = await send(`/api/auth/callback?code=c0de&state=${q.get('state')}`);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    const grant = ms.calls[0]!;
    expect(grant.get('grant_type')).toBe('authorization_code');
    expect(grant.get('code')).toBe('c0de');
    expect(grant.get('client_secret')).toBe('secret');
    expect(grant.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(await pkceChallenge(grant.get('code_verifier')!)).toBe(q.get('code_challenge'));

    expect(jar.cookies.has('taskapp_login')).toBe(false);
    const session = jar.cookies.get('taskapp_session0')!;
    expect(session.attrs).toBe(`Path=/api/auth/token; Max-Age=${90 * 86400}; Secure; SameSite=Lax; HttpOnly`);
    expect(session.value).not.toContain('rt1');
    expect(jar.cookies.get('taskapp_signed_in')).toMatchObject({ value: 'microsoft', path: '/' });
    expect(jar.cookies.get('taskapp_signed_in')!.attrs).not.toContain('HttpOnly');
    expect(await res.text()).toBe(''); // no token in the body
  });

  it.each([
    ['a wrong state', (state: string) => `code=c0de&state=${state}x`],
    ['no state', () => 'code=c0de'],
  ])('rejects %s without redeeming the code', async (_, query) => {
    const login = await send('/api/auth/login');
    const state = new URL(login.headers.get('Location')!).searchParams.get('state')!;
    const res = await send(`/api/auth/callback?${query(state)}`);
    expect(res.headers.get('Location')).toBe('/?signin_error=expired');
    expect(ms.fetch).not.toHaveBeenCalled();
    expect(jar.cookies.has('taskapp_session0')).toBe(false);
  });

  it('rejects a return without the login cookie (another browser, or a forged link)', async () => {
    const res = await send('/api/auth/callback?code=c0de&state=abc');
    expect(res.headers.get('Location')).toBe('/?signin_error=expired');
    expect(ms.fetch).not.toHaveBeenCalled();
  });

  it('rejects a login cookie older than ten minutes', async () => {
    const login = await send('/api/auth/login');
    const state = new URL(login.headers.get('Location')!).searchParams.get('state')!;
    now += 11 * 60_000;
    const res = await send(`/api/auth/callback?code=c0de&state=${state}`);
    expect(res.headers.get('Location')).toBe('/?signin_error=expired');
  });

  it('reports a cancelled sign-in and a failed or unreachable exchange', async () => {
    expect((await send('/api/auth/callback?error=access_denied')).headers.get('Location')).toBe('/?signin_error=cancelled');
    const login = async () => new URL((await send('/api/auth/login')).headers.get('Location')!).searchParams.get('state')!;
    let state = await login();
    ms.fail(400, 'invalid_grant');
    expect((await send(`/api/auth/callback?code=c&state=${state}`)).headers.get('Location')).toBe(
      '/?signin_error=failed&provider=microsoft',
    );
    state = await login();
    ms.down();
    expect((await send(`/api/auth/callback?code=c&state=${state}`)).headers.get('Location')).toBe(
      '/?signin_error=unavailable&provider=microsoft',
    );
  });

  it('splits a long refresh token across several cookies, each under 4 KB', async () => {
    const rt = 'R'.repeat(5000);
    await signIn({ access_token: 'at0', expires_in: 3600, refresh_token: rt });
    expect(jar.cookies.has('taskapp_session1')).toBe(true);
    for (const [name, c] of jar.cookies) expect(`${name}=${c.value}; ${c.attrs}`.length).toBeLessThan(4000);
    ms.ok({ access_token: 'at1', expires_in: 3600, refresh_token: 'short' });
    expect((await post('/api/auth/token')).status).toBe(200);
    expect(ms.calls[1]!.get('refresh_token')).toBe(rt);
    // The shorter rotated token deletes the stale second chunk.
    expect(jar.cookies.has('taskapp_session0')).toBe(true);
    expect(jar.cookies.has('taskapp_session1')).toBe(false);
  });

  it('fails rather than set a cookie past the chunk limit', async () => {
    const res = await signIn({ access_token: 'at0', expires_in: 3600, refresh_token: 'R'.repeat(CHUNK_SIZE * MAX_CHUNKS) });
    expect(res.headers.get('Location')).toBe('/?signin_error=failed&provider=microsoft');
    expect(jar.cookies.has('taskapp_session0')).toBe(false);
  });
});

describe('POST /api/auth/token', () => {
  it('redeems the refresh token, rotates the cookie and returns only the access token', async () => {
    await signIn();
    const before = jar.cookies.get('taskapp_session0')!.value;
    ms.ok({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt2' });
    now += 1000;
    const res = await post('/api/auth/token');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accessToken: 'at1', expiresAt: now + 3_600_000 });
    expect(ms.calls[1]!.get('grant_type')).toBe('refresh_token');
    expect(ms.calls[1]!.get('refresh_token')).toBe('rt1');
    expect(ms.calls[1]!.get('client_secret')).toBe('secret');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(jar.cookies.get('taskapp_session0')!.value).not.toBe(before);

    ms.ok({ access_token: 'at2', expires_in: 3600, refresh_token: 'rt3' });
    await post('/api/auth/token');
    expect(ms.calls[2]!.get('refresh_token')).toBe('rt2');
  });

  it('refreshes with the configured scope', async () => {
    const headers = { 'X-TaskApp-Auth': '1', Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };
    await signIn();
    ms.ok({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt2' });
    await send('/api/auth/token', { method: 'POST', headers });
    expect(ms.calls[1]!.get('scope')).toBe('Files.ReadWrite.AppFolder offline_access');
    ms.ok({ access_token: 'at2', expires_in: 3600, refresh_token: 'rt3' });
    await send('/api/auth/token', { method: 'POST', headers }, { ...ENV, ONEDRIVE_SCOPE: 'full' });
    expect(ms.calls[2]!.get('scope')).toBe('Files.ReadWrite offline_access');
  });

  it('keeps the old refresh token when Microsoft sends no new one', async () => {
    await signIn();
    ms.ok({ access_token: 'at1', expires_in: 3600 });
    await post('/api/auth/token');
    ms.ok({ access_token: 'at2', expires_in: 3600 });
    await post('/api/auth/token');
    expect(ms.calls[2]!.get('refresh_token')).toBe('rt1');
  });

  it('extends the session on use: a cookie refreshed within 90 days keeps working past the first 90', async () => {
    await signIn();
    for (let day = 80; day <= 240; day += 80) {
      now = NOW + day * 86_400_000;
      ms.ok({ access_token: 'at', expires_in: 3600, refresh_token: `rt-${day}` });
      expect((await post('/api/auth/token')).status).toBe(200);
    }
  });

  it('answers 401 { signin: true } without a cookie, and with a tampered one', async () => {
    let res = await post('/api/auth/token');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ signin: true });

    await signIn();
    const c = jar.cookies.get('taskapp_session0')!;
    const flipped = c.value.slice(0, 20) + (c.value[20] === 'A' ? 'B' : 'A') + c.value.slice(21);
    jar.cookies.set('taskapp_session0', { ...c, value: flipped });
    res = await post('/api/auth/token');
    expect(res.status).toBe(401);
    expect(ms.calls).toHaveLength(1); // only the sign-in's exchange
    expect(jar.cookies.has('taskapp_signed_in')).toBe(false);
  });

  it('rejects a cookie sealed under another key, or for another purpose', async () => {
    const other = await importCookieKey(toBase64Url(new Uint8Array(32).fill(9)));
    const session = { rt: 'rt', exp: NOW + 1e9 };
    jar.cookies.set('taskapp_session0', { value: await seal(other, 'taskapp_session', session), path: '/api/auth/token', attrs: '' });
    expect((await post('/api/auth/token')).status).toBe(401);
    const key = await importCookieKey(KEY);
    jar.cookies.set('taskapp_session0', { value: await seal(key, 'taskapp_login', session), path: '/api/auth/token', attrs: '' });
    expect((await post('/api/auth/token')).status).toBe(401);
    jar.cookies.set('taskapp_session0', { value: await seal(key, 'taskapp_session', session), path: '/api/auth/token', attrs: '' });
    ms.ok({ access_token: 'at', expires_in: 3600 });
    expect((await post('/api/auth/token')).status).toBe(200);
  });

  it('answers 401 and clears the session after 90 days unused', async () => {
    await signIn();
    now += 91 * 86_400_000;
    expect((await post('/api/auth/token')).status).toBe(401);
    expect(ms.calls).toHaveLength(1);
  });

  it.each(['invalid_grant', 'interaction_required'])('answers 401 and clears the session when Microsoft says %s', async (error) => {
    await signIn();
    ms.fail(400, error);
    const res = await post('/api/auth/token');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ signin: true });
    expect(jar.cookies.has('taskapp_session0')).toBe(false);
    expect(jar.cookies.has('taskapp_signed_in')).toBe(false);
  });

  it.each([
    ['unreachable', () => ms.down()],
    ['a 500', () => ms.fail(500)],
    ['a 503 with an error code', () => ms.fail(503, 'temporarily_unavailable')],
    ['invalid_client (an expired secret)', () => ms.fail(401, 'invalid_client')],
  ])('answers 503 and keeps the session when Microsoft is %s', async (_, reply) => {
    await signIn();
    reply();
    expect((await post('/api/auth/token')).status).toBe(503);
    expect(jar.cookies.has('taskapp_session0')).toBe(true);
    ms.ok({ access_token: 'at1', expires_in: 3600 });
    expect((await post('/api/auth/token')).status).toBe(200);
  });

  it.each([
    ['no custom header', { Origin: ORIGIN }],
    ['another origin', { 'X-TaskApp-Auth': '1', Origin: 'https://evil.example' }],
    ['no origin', { 'X-TaskApp-Auth': '1' }],
    ['a cross-site fetch', { 'X-TaskApp-Auth': '1', Origin: ORIGIN, 'Sec-Fetch-Site': 'cross-site' }],
  ])('rejects a request with %s (CSRF) before touching the session', async (_, headers) => {
    await signIn();
    const res = await post('/api/auth/token', headers as Record<string, string>);
    expect(res.status).toBe(403);
    expect(ms.calls).toHaveLength(1);
    expect(jar.cookies.has('taskapp_session0')).toBe(true);
  });

  it('rejects GET', async () => {
    expect((await send('/api/auth/token')).status).toBe(405);
  });

  it('never logs a token', async () => {
    await signIn({ access_token: 'at0', expires_in: 3600, refresh_token: 'rt-secret' });
    ms.fail(400, 'invalid_grant');
    await post('/api/auth/token');
    const logged = JSON.stringify([...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls]);
    expect(logged).not.toContain('rt-secret');
    expect(logged).toContain('invalid_grant');
  });
});

describe('per-app cookies', () => {
  it("uses the app's cookie prefix", async () => {
    const time: AuthOptions = { providers: { microsoft }, cookiePrefix: 'omark_time' };
    const login = await send('/api/auth/login', {}, ENV, time);
    expect([...jar.cookies.keys()]).toEqual(['omark_time_login']);
    const state = new URL(login.headers.get('Location')!).searchParams.get('state')!;
    ms.ok({ access_token: 'at0', expires_in: 3600, refresh_token: 'rt1', id_token: idToken({ preferred_username: 'me@example.com' }) });
    await send(`/api/auth/callback?code=c0de&state=${state}`, {}, ENV, time);
    expect([...jar.cookies.keys()].sort()).toEqual(['omark_time_hint', 'omark_time_session0', 'omark_time_signed_in']);
    expect(jar.cookies.get('omark_time_session0')!.path).toBe('/api/auth/token');
    expect(jar.cookies.get('omark_time_signed_in')).toMatchObject({ value: 'microsoft', path: '/' });

    // Another app's prefix does not open these cookies.
    const headers = { 'X-TaskApp-Auth': '1', Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };
    expect((await send('/api/auth/token', { method: 'POST', headers }, ENV, TASKS)).status).toBe(401);
  });

  it('reads a session sealed before the move', async () => {
    // Sealed exactly as the handler did before it had options: purpose and cookie name 'taskapp_session'.
    const key = await importCookieKey(KEY);
    const value = await seal(key, 'taskapp_session', { rt: 'rt-old', exp: NOW + 86_400_000 });
    jar.cookies.set('taskapp_session0', { value, path: '/api/auth/token', attrs: '' });
    ms.ok({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt-new' });
    const res = await post('/api/auth/token');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accessToken: 'at1', expiresAt: NOW + 3_600_000 });
    expect(ms.calls[0]!.get('refresh_token')).toBe('rt-old');
    expect(jar.cookies.has('taskapp_session0')).toBe(true);
    expect(jar.cookies.get('taskapp_signed_in')).toMatchObject({ value: 'microsoft', path: '/' });
  });
});

describe('several providers', () => {
  const headers = { 'X-TaskApp-Auth': '1', Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };
  const GOOGLE_TOKENS = {
    access_token: 'gat0',
    expires_in: 3600,
    refresh_token: 'grt1',
    scope: `https://www.googleapis.com/auth/userinfo.email ${DRIVE} openid`,
  };

  it('sends login?provider=google to Google with its extra parameters and the PKCE ones', async () => {
    const res = await send('/api/auth/login?provider=google');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('Location')!);
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = to.searchParams;
    expect(q.get('client_id')).toBe('gid');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('include_granted_scopes')).toBe('true');
    expect(q.get('scope')).toBe(`openid email ${DRIVE}`);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state')).toMatch(/^[\w-]{43}$/);
  });

  it('answers 400 unknown_provider for a provider the app does not have, without cookies', async () => {
    const res = await send('/api/auth/login?provider=dropbox');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown_provider' });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect((await send('/api/auth/login?provider=constructor')).status).toBe(400);
  });

  it('answers 500 not_configured for Google without its settings while Microsoft still works', async () => {
    const res = await send('/api/auth/login?provider=google', {}, MS_ONLY);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect((await send('/api/auth/login', {}, MS_ONLY)).status).toBe(302);
  });

  it('runs a Google round trip against Google only and records the provider', async () => {
    const res = await signIn(GOOGLE_TOKENS, 'google');
    expect(res.headers.get('Location')).toBe('/');
    expect(ms.fetch).not.toHaveBeenCalled();
    expect(gg.calls).toHaveLength(1);
    expect(gg.calls[0]!.get('client_id')).toBe('gid');
    expect(gg.calls[0]!.get('client_secret')).toBe('gsecret');
    expect(jar.cookies.get('taskapp_signed_in')).toMatchObject({ value: 'google', path: '/' });
    expect(jar.cookies.get('taskapp_session0')!.attrs).toContain(`Max-Age=${180 * 86400}`);

    gg.ok({ access_token: 'gat1', expires_in: 3600 });
    expect((await post('/api/auth/token')).status).toBe(200);
    expect(gg.calls[1]!.get('refresh_token')).toBe('grt1');
    expect(gg.calls[1]!.get('scope')).toBe(DRIVE);
    expect(ms.fetch).not.toHaveBeenCalled();
    expect(jar.cookies.get('taskapp_signed_in')).toMatchObject({ value: 'google' });
  });

  it('fails the sign-in when Google did not grant every required scope', async () => {
    const res = await signIn({ ...GOOGLE_TOKENS, scope: 'https://www.googleapis.com/auth/userinfo.email openid' }, 'google');
    expect(res.headers.get('Location')).toBe('/?signin_error=scope&provider=google');
    expect(jar.cookies.has('taskapp_session0')).toBe(false);
    expect(jar.cookies.has('taskapp_signed_in')).toBe(false);
    expect(jar.cookies.has('taskapp_login')).toBe(false);
  });

  it('refreshes a session sealed without a provider against Microsoft and marks it microsoft', async () => {
    const key = await importCookieKey(KEY);
    const value = await seal(key, 'taskapp_session', { rt: 'rt-old', exp: NOW + 86_400_000 });
    jar.cookies.set('taskapp_session0', { value, path: '/api/auth/token', attrs: '' });
    ms.ok({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt-new' });
    expect((await post('/api/auth/token')).status).toBe(200);
    expect(ms.calls).toHaveLength(1);
    expect(jar.cookies.get('taskapp_signed_in')).toMatchObject({ value: 'microsoft' });
  });

  it('does not send a login_hint sealed for another provider', async () => {
    await signIn({ access_token: 'at0', expires_in: 3600, refresh_token: 'rt1', id_token: idToken({ preferred_username: 'me@example.com' }) });
    const toGoogle = new URL((await send('/api/auth/login?provider=google')).headers.get('Location')!);
    expect(toGoogle.searchParams.get('login_hint')).toBeNull();
    const toMicrosoft = new URL((await send('/api/auth/login')).headers.get('Location')!);
    expect(toMicrosoft.searchParams.get('login_hint')).toBe('me@example.com');
  });

  it('names a Google account from its email as login_hint for Google', async () => {
    await signIn({ ...GOOGLE_TOKENS, id_token: idToken({ email: 'me@gmail.example' }) }, 'google');
    const to = new URL((await send('/api/auth/login?provider=google')).headers.get('Location')!);
    expect(to.searchParams.get('login_hint')).toBe('me@gmail.example');
  });

  it('lists the configured providers in order, with no cookie key needed', async () => {
    let res = await send('/api/auth/providers');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: ['microsoft', 'google'] });
    res = await send('/api/auth/providers', {}, MS_ONLY);
    expect(await res.json()).toEqual({ providers: ['microsoft'] });
    res = await send('/api/auth/providers', {}, { ...ENV, COOKIE_KEY: undefined });
    expect(await res.json()).toEqual({ providers: ['microsoft', 'google'] });
  });

  it('rejects other methods on the providers route', async () => {
    const res = await send('/api/auth/providers', { method: 'POST', headers });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session, the signed-in hint and the account name', async () => {
    await signIn({ access_token: 'at0', expires_in: 3600, refresh_token: 'rt1', id_token: idToken({ preferred_username: 'me@example.com' }) });
    expect(jar.cookies.size).toBeGreaterThan(0);
    expect((await post('/api/auth/logout')).status).toBe(200);
    expect([...jar.cookies.keys()]).toEqual([]);
  });

  it('is CSRF-protected', async () => {
    await signIn();
    expect((await post('/api/auth/logout', { Origin: 'https://evil.example', 'X-TaskApp-Auth': '1' })).status).toBe(403);
    expect(jar.cookies.has('taskapp_session0')).toBe(true);
  });
});
