import { chunkedCookies, clearChunkedCookies, parseCookies, readChunkedCookie, serializeCookie } from './cookies.ts';
import { fromBase64Url, importCookieKey, pkceChallenge, randomToken, seal, unseal } from './crypto.ts';

/** The Pages project's secrets (`wrangler pages secret put`). */
export interface Env {
  MSAL_CLIENT_ID?: string;
  MSAL_CLIENT_SECRET?: string;
  COOKIE_KEY?: string;
}

export interface Deps {
  /** The token endpoint is called through this (tests mock it). */
  fetch?: typeof fetch;
  now?: () => number;
}

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'Files.ReadWrite offline_access';
/** The sign-in also asks for an ID token, only to read the account name for the next `login_hint`. */
const SIGNIN_SCOPE = `openid profile ${SCOPE}`;
/** What the client sends with every POST; a cross-origin page cannot set it without a CORS preflight, which is never allowed. */
export const CSRF_HEADER = 'X-TaskApp-Auth';
const UPSTREAM_TIMEOUT_MS = 10_000;

const DAY = 24 * 60 * 60;
/** Rolling: every token refresh sets it again. Microsoft's refresh tokens for web apps last 90 days and are replaced on use. */
const SESSION_MAX_AGE = 90 * DAY;
const LOGIN_MAX_AGE = 10 * 60;
/** Chrome's cap on cookie lifetime; the account name outlives a session so the next sign-in can name it. */
const HINT_MAX_AGE = 400 * DAY;

/** The refresh token, sealed and split across `taskapp_session0..3`; only the token endpoint receives it. */
const SESSION = { name: 'taskapp_session', path: '/api/auth/token' };
/** State and PKCE verifier between the sign-in redirect and its return. */
const LOGIN = { name: 'taskapp_login', path: '/api/auth/callback' };
/** The account name, sealed, for `login_hint`. */
const HINT = { name: 'taskapp_hint', path: '/api/auth/login' };
/** Readable by the app (no secret in it): a session cookie probably exists, so boot skips the sign-in screen. */
const SIGNED_IN = { name: 'taskapp_signed_in', path: '/' };

/** Token endpoint errors that only a fresh sign-in fixes (the refresh token expired or was revoked, consent withdrawn). */
const SIGN_IN_ERRORS: readonly string[] = ['invalid_grant', 'interaction_required', 'consent_required', 'login_required'];

interface LoginState {
  state: string;
  verifier: string;
  /** ms since the epoch */
  exp: number;
}
interface Session {
  rt: string;
  exp: number;
}
interface Hint {
  username: string;
}

interface Tokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}
type Redeemed = { kind: 'ok'; tokens: Tokens } | { kind: 'signin' } | { kind: 'unavailable' };

interface Context {
  request: Request;
  url: URL;
  cookies: Map<string, string>;
  clientId: string;
  clientSecret: string;
  key: CryptoKey;
  fetch: typeof fetch;
  now: number;
}

/**
 * The sign-in helper behind `/api/auth/*`, a token broker that keeps the refresh token out of the browser's
 * JavaScript. `login` and `callback` run Microsoft's authorization code flow with PKCE as a confidential web
 * app, so the refresh token lasts 90 days instead of an SPA's 24 hours; it lives only in an encrypted
 * HttpOnly cookie. `token` trades it for a Graph access token, the only token the app ever sees, and
 * stores the new refresh token. `logout` deletes the cookies. Nothing is kept on the server, and tokens
 * are never logged.
 */
export async function handleAuth(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
  const method = route === 'login' || route === 'callback' ? 'GET' : route === 'token' || route === 'logout' ? 'POST' : null;
  if (method === null) return json(404, { error: 'not_found' });
  if (request.method !== method) return json(405, { error: 'method_not_allowed' }, [], { Allow: method });
  if (!env.MSAL_CLIENT_ID || !env.MSAL_CLIENT_SECRET || !env.COOKIE_KEY) {
    console.error('TaskApp sign-in: MSAL_CLIENT_ID, MSAL_CLIENT_SECRET or COOKIE_KEY is not set');
    return json(500, { error: 'not_configured' });
  }
  let key: CryptoKey;
  try {
    key = await importCookieKey(env.COOKIE_KEY);
  } catch {
    console.error('TaskApp sign-in: COOKIE_KEY is not 32 base64-encoded bytes');
    return json(500, { error: 'not_configured' });
  }
  const ctx: Context = {
    request,
    url,
    cookies: parseCookies(request.headers.get('Cookie')),
    clientId: env.MSAL_CLIENT_ID,
    clientSecret: env.MSAL_CLIENT_SECRET,
    key,
    fetch: deps.fetch ?? ((...args) => globalThis.fetch(...args)),
    now: (deps.now ?? Date.now)(),
  };
  if (route === 'login') return login(ctx);
  if (route === 'callback') return callback(ctx);
  if (!sameOrigin(ctx)) return json(403, { error: 'forbidden' });
  return route === 'token' ? token(ctx) : logout();
}

const redirectUri = (ctx: Context) => `${ctx.url.origin}/api/auth/callback`;

async function login(ctx: Context): Promise<Response> {
  const state = randomToken();
  const verifier = randomToken();
  const params = new URLSearchParams({
    client_id: ctx.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: redirectUri(ctx),
    scope: SIGNIN_SCOPE,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  const hint = await unseal<Hint>(ctx.key, HINT.name, ctx.cookies.get(HINT.name));
  if (hint?.username) params.set('login_hint', hint.username);
  const sealed = await seal(ctx.key, LOGIN.name, { state, verifier, exp: ctx.now + LOGIN_MAX_AGE * 1000 } satisfies LoginState);
  return redirect(`${AUTHORITY}/authorize?${params}`, [
    serializeCookie(LOGIN.name, sealed, { path: LOGIN.path, maxAge: LOGIN_MAX_AGE }),
  ]);
}

/**
 * Microsoft's return. Any failure goes back to the app as `/?signin_error=<reason>`, which it shows:
 * `cancelled`, `expired` (no or stale sign-in state: start again), `failed` or `unavailable`.
 */
async function callback(ctx: Context): Promise<Response> {
  const clearLogin = serializeCookie(LOGIN.name, '', { path: LOGIN.path, maxAge: 0 });
  const back = (reason: string) => redirect(`/?signin_error=${reason}`, [clearLogin]);
  const q = ctx.url.searchParams;
  const error = q.get('error');
  if (error) {
    console.warn(`TaskApp sign-in: authorize answered ${error}`);
    return back(error === 'access_denied' ? 'cancelled' : 'failed');
  }
  const login = await unseal<LoginState>(ctx.key, LOGIN.name, ctx.cookies.get(LOGIN.name));
  const state = q.get('state');
  if (!login || login.exp < ctx.now || !state || state !== login.state) return back('expired');
  const code = q.get('code');
  if (!code) return back('failed');

  const redeemed = await redeem(ctx, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(ctx),
    code_verifier: login.verifier,
    scope: SIGNIN_SCOPE,
  });
  if (redeemed.kind !== 'ok') return back(redeemed.kind === 'signin' ? 'failed' : 'unavailable');
  const { refresh_token: rt, id_token } = redeemed.tokens;
  if (!rt) return back('failed');

  let session: string[];
  try {
    session = await sessionCookies(ctx, rt);
  } catch {
    console.error('TaskApp sign-in: the refresh token does not fit in the session cookies');
    return back('failed');
  }
  const cookies = [clearLogin, ...session];
  const username = usernameFrom(id_token);
  if (username) {
    const hint = await seal(ctx.key, HINT.name, { username } satisfies Hint);
    cookies.push(serializeCookie(HINT.name, hint, { path: HINT.path, maxAge: HINT_MAX_AGE }));
  }
  return redirect('/', cookies);
}

/** `{ accessToken, expiresAt }` (ms since the epoch); 401 `{ signin: true }` when only signing in helps; 503 when Microsoft cannot be reached. */
async function token(ctx: Context): Promise<Response> {
  const session = await unseal<Session>(ctx.key, SESSION.name, readChunkedCookie(ctx.cookies, SESSION.name));
  if (!session || typeof session.rt !== 'string' || session.exp < ctx.now) return json(401, { signin: true }, clearSession());
  const redeemed = await redeem(ctx, { grant_type: 'refresh_token', refresh_token: session.rt, scope: SCOPE });
  if (redeemed.kind === 'signin') return json(401, { signin: true }, clearSession());
  if (redeemed.kind === 'unavailable') return json(503, { error: 'unavailable' });
  const { access_token, expires_in, refresh_token } = redeemed.tokens;
  // Microsoft normally sends a new refresh token on every use; keep the old one if it does not.
  return json(
    200,
    { accessToken: access_token, expiresAt: ctx.now + expires_in * 1000 },
    await sessionCookies(ctx, refresh_token ?? session.rt),
  );
}

const logout = (): Response => json(200, { ok: true }, [...clearSession(), serializeCookie(HINT.name, '', { path: HINT.path, maxAge: 0 })]);

async function sessionCookies(ctx: Context, rt: string): Promise<string[]> {
  const sealed = await seal(ctx.key, SESSION.name, { rt, exp: ctx.now + SESSION_MAX_AGE * 1000 } satisfies Session);
  return [
    ...chunkedCookies(SESSION.name, sealed, { path: SESSION.path, maxAge: SESSION_MAX_AGE }),
    serializeCookie(SIGNED_IN.name, '1', { path: SIGNED_IN.path, maxAge: SESSION_MAX_AGE, httpOnly: false }),
  ];
}

const clearSession = (): string[] => [
  ...clearChunkedCookies(SESSION.name, { path: SESSION.path }),
  serializeCookie(SIGNED_IN.name, '', { path: SIGNED_IN.path, maxAge: 0, httpOnly: false }),
];

/**
 * CSRF check for the POST endpoints: the custom header, an `Origin` equal to this origin, and (where the
 * browser sends it) `Sec-Fetch-Site: same-origin`. Browsers send `Origin` on every POST.
 */
function sameOrigin(ctx: Context): boolean {
  const headers = ctx.request.headers;
  if (headers.get(CSRF_HEADER) !== '1') return false;
  if (headers.get('Origin') !== ctx.url.origin) return false;
  const site = headers.get('Sec-Fetch-Site');
  return site === null || site === 'same-origin';
}

/** One token endpoint call within the time limit. Logs Microsoft's error code, never a token. */
async function redeem(ctx: Context, grant: Record<string, string>): Promise<Redeemed> {
  let res: Response;
  let body: Record<string, unknown>;
  try {
    res = await ctx.fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: ctx.clientId, client_secret: ctx.clientSecret, ...grant }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    console.warn('TaskApp sign-in: token endpoint unreachable');
    return { kind: 'unavailable' };
  }
  if (res.ok && typeof body.access_token === 'string' && typeof body.expires_in === 'number') {
    return { kind: 'ok', tokens: body as unknown as Tokens };
  }
  const error = typeof body.error === 'string' ? body.error : 'none';
  console.warn(`TaskApp sign-in: token endpoint answered ${res.status} (${error})`);
  return SIGN_IN_ERRORS.includes(error) ? { kind: 'signin' } : { kind: 'unavailable' };
}

/**
 * The account name from the ID token, for `login_hint`. It came straight from Microsoft's token endpoint
 * over TLS, so its signature need not be checked (OpenID Connect Core 3.1.3.7), and it is only a hint.
 */
function usernameFrom(idToken: string | undefined): string | null {
  try {
    const payload = idToken?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Record<string, unknown>;
    const name = claims.preferred_username ?? claims.email;
    return typeof name === 'string' && name.length <= 320 ? name : null;
  } catch {
    return null;
  }
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

function json(status: number, body: unknown, cookies: string[] = [], extra: Record<string, string> = {}): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}
