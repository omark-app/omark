import { chunkedCookies, clearChunkedCookies, parseCookies, readChunkedCookie, serializeCookie } from './cookies.ts';
import { fromBase64Url, importCookieKey, pkceChallenge, randomToken, seal, unseal } from './crypto.ts';
import type { Env, Provider, ProviderConfig } from './providers.ts';

export type { Env } from './providers.ts';

/** What differs between apps. */
export interface AuthOptions {
  /** Where users can sign in, by id (the `?provider=` value). The first is the default: it is used when `login` names none, and for sessions sealed before there were several. */
  providers: Record<string, Provider>;
  /** Every cookie is named `<cookiePrefix>_…`. The name is sealed into the cookie's value, so changing it signs everyone out. */
  cookiePrefix: string;
  /**
   * Paths a sign-in can return to (`login?return=/time`), so the one Omark app comes back to the part it left;
   * any other return, or none, goes back to `/`.
   */
  returnPaths?: readonly string[];
}

export interface Deps {
  /** The token endpoint is called through this (tests mock it). */
  fetch?: typeof fetch;
  now?: () => number;
}

/** What the client sends with every POST; a cross-origin page cannot set it without a CORS preflight, which is never allowed. */
export const CSRF_HEADER = 'X-TaskApp-Auth';
const UPSTREAM_TIMEOUT_MS = 10_000;

const DAY = 24 * 60 * 60;
const LOGIN_MAX_AGE = 10 * 60;
/** Chrome's cap on cookie lifetime; the account name outlives a session so the next sign-in can name it. */
const HINT_MAX_AGE = 400 * DAY;

interface Cookie {
  name: string;
  path: string;
}
interface Cookies {
  /** The refresh token, sealed and split across `<prefix>_session0..3`; only the token endpoint receives it. */
  session: Cookie;
  /** State and PKCE verifier between the sign-in redirect and its return. */
  login: Cookie;
  /** The account name, sealed, for `login_hint`. */
  hint: Cookie;
  /** Readable by the app (no secret in it): holds the provider's id, so a session cookie probably exists and boot skips the sign-in screen. */
  signedIn: Cookie;
}

const cookieNames = (prefix: string): Cookies => ({
  session: { name: `${prefix}_session`, path: '/api/auth/token' },
  login: { name: `${prefix}_login`, path: '/api/auth/callback' },
  hint: { name: `${prefix}_hint`, path: '/api/auth/login' },
  signedIn: { name: `${prefix}_signed_in`, path: '/' },
});

/** Token endpoint errors that only a fresh sign-in fixes (the refresh token expired or was revoked, consent withdrawn). */
const SIGN_IN_ERRORS: readonly string[] = ['invalid_grant', 'interaction_required', 'consent_required', 'login_required'];

/** `p` is the provider's id; absent means the default one (cookies sealed before there were several). */
interface LoginState {
  state: string;
  verifier: string;
  /** ms since the epoch */
  exp: number;
  p?: string;
  /** The access added by this sign-in (`login?add=`). */
  a?: string;
  /** Where the app returns to (`login?return=`), one of the app's `returnPaths`. */
  r?: string;
}
interface Session {
  rt: string;
  exp: number;
  p?: string;
  /** The scopes to ask for on each token call, when the provider has extra scopes: the granted ones it knows. */
  sc?: string;
}
interface Hint {
  username: string;
  p?: string;
}

interface Tokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  /** Space-separated granted scopes (Google sends it on every grant). */
  scope?: string;
}
/** `error` is the provider's error code, when it sent one. */
type Redeemed = { kind: 'ok'; tokens: Tokens } | { kind: 'signin' } | { kind: 'unavailable'; error?: string };

interface Base {
  request: Request;
  url: URL;
  env: Env;
  options: AuthOptions;
  cookies: Map<string, string>;
  names: Cookies;
  key: CryptoKey;
  fetch: typeof fetch;
  now: number;
}
/** A request once it is known which provider it is for. */
interface Context extends Base {
  providerId: string;
  provider: ProviderConfig;
}

/**
 * The sign-in helper behind `/api/auth/*`, a token broker that keeps the refresh token out of the browser's
 * JavaScript. `login` and `callback` run the provider's authorization code flow with PKCE as a confidential
 * web app, so the refresh token lasts longer than an SPA's (Microsoft: 90 days instead of 24 hours); it
 * lives only in an encrypted HttpOnly cookie. `token` trades it for an access token, the only token the app
 * ever sees, and stores the new refresh token. `logout` deletes the cookies. `providers` lists the sign-in
 * choices that are configured. Nothing is kept on the server, and tokens are never logged.
 */
export async function handleAuth(request: Request, env: Env, options: AuthOptions, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');
  const method =
    route === 'login' || route === 'callback' || route === 'providers' ? 'GET' : route === 'token' || route === 'logout' ? 'POST' : null;
  if (method === null) return json(404, { error: 'not_found' });
  if (request.method !== method) return json(405, { error: 'method_not_allowed' }, [], { Allow: method });
  if (route === 'providers') return json(200, { providers: configured(env, options) });
  if (!env.COOKIE_KEY) {
    console.error('Omark sign-in: COOKIE_KEY is not set');
    return json(500, { error: 'not_configured' });
  }
  let key: CryptoKey;
  try {
    key = await importCookieKey(env.COOKIE_KEY);
  } catch {
    console.error('Omark sign-in: COOKIE_KEY is not 32 base64-encoded bytes');
    return json(500, { error: 'not_configured' });
  }
  const base: Base = {
    request,
    url,
    env,
    options,
    cookies: parseCookies(request.headers.get('Cookie')),
    names: cookieNames(options.cookiePrefix),
    key,
    fetch: deps.fetch ?? ((...args) => globalThis.fetch(...args)),
    now: (deps.now ?? Date.now)(),
  };
  if (route === 'login') return login(base);
  if (route === 'callback') return callback(base);
  if (!sameOrigin(base)) return json(403, { error: 'forbidden' });
  return route === 'token' ? token(base) : logout(base);
}

const defaultProvider = (options: AuthOptions): string => Object.keys(options.providers)[0]!;
/** Only a path the app named, compared whole, so nothing can send the user to another site or path. */
const returnsTo = (options: AuthOptions, path: string): boolean => options.returnPaths?.includes(path) ?? false;
/** The scopes of an access the app can add (`login?add=`); null when it has no such access. hasOwn, so `toString` is none. */
const extraFor = (provider: ProviderConfig, name: string): readonly string[] | null =>
  provider.extraScopes && Object.hasOwn(provider.extraScopes, name) ? provider.extraScopes[name]! : null;
/** hasOwn, so `constructor` or `toString` are not providers. */
const hasProvider = (options: AuthOptions, id: string): boolean => Object.hasOwn(options.providers, id);

/** The ids of the providers whose settings are all there, in the app's order. */
const configured = (env: Env, options: AuthOptions): string[] =>
  Object.keys(options.providers).filter((id) => typeof options.providers[id]!.configure(env) !== 'string');

/** Reads the provider's settings; a response (500 not_configured) when they are missing. The id must exist. */
function withProvider(base: Base, id: string): Context | Response {
  const provider = base.options.providers[id]!.configure(base.env);
  if (typeof provider === 'string') {
    console.error(`Omark sign-in: ${provider}`);
    return json(500, { error: 'not_configured' });
  }
  return { ...base, providerId: id, provider };
}

const redirectUri = (ctx: Context) => `${ctx.url.origin}/api/auth/callback`;

async function login(base: Base): Promise<Response> {
  const id = base.url.searchParams.get('provider') ?? defaultProvider(base.options);
  if (!hasProvider(base.options, id)) return json(400, { error: 'unknown_provider' });
  const ctx = withProvider(base, id);
  if (ctx instanceof Response) return ctx;
  const add = base.url.searchParams.get('add');
  const extra = add === null ? [] : extraFor(ctx.provider, add);
  if (extra === null) return json(400, { error: 'unknown_access' });
  const state = randomToken();
  const verifier = randomToken();
  const params = new URLSearchParams({
    client_id: ctx.provider.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: redirectUri(ctx),
    scope: [ctx.provider.signinScope, ...extra].join(' '),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    ...ctx.provider.authorizeParams,
  });
  const { hint: HINT, login: LOGIN } = ctx.names;
  const hint = await unseal<Hint>(ctx.key, HINT.name, ctx.cookies.get(HINT.name));
  // An account name only means something to the provider that gave it.
  if (hint?.username && (hint.p ?? defaultProvider(ctx.options)) === id) params.set('login_hint', hint.username);
  const ret = base.url.searchParams.get('return');
  const login: LoginState = {
    state,
    verifier,
    exp: ctx.now + LOGIN_MAX_AGE * 1000,
    p: id,
    ...(add === null ? {} : { a: add }),
    ...(ret !== null && returnsTo(base.options, ret) ? { r: ret } : {}),
  };
  const sealed = await seal(ctx.key, LOGIN.name, login);
  return redirect(`${ctx.provider.authorizeUrl}?${params}`, [
    serializeCookie(LOGIN.name, sealed, { path: LOGIN.path, maxAge: LOGIN_MAX_AGE }),
  ]);
}

/**
 * The provider's return. Any failure goes back to the app as `/?signin_error=<reason>`, which it shows:
 * `cancelled`, `expired` (no or stale sign-in state: start again), `scope` (not every permission was granted),
 * `failed` or `unavailable`. Once the provider is known from the sign-in state, `&provider=<id>` names it.
 */
async function callback(base: Base): Promise<Response> {
  const { hint: HINT, login: LOGIN } = base.names;
  const clearLogin = serializeCookie(LOGIN.name, '', { path: LOGIN.path, maxAge: 0 });
  const q = base.url.searchParams;
  const login = await unseal<LoginState>(base.key, LOGIN.name, base.cookies.get(LOGIN.name));
  // Sealed by `login`, so it can be trusted even when stale; checked again in case the app's paths changed.
  const home = login?.r !== undefined && returnsTo(base.options, login.r) ? login.r : '/';
  const back = (reason: string, id?: string, add?: string) =>
    redirect(`${home}?signin_error=${reason}${id ? `&provider=${id}` : ''}${add ? `&add=${add}` : ''}`, [clearLogin]);
  const id = login?.p ?? defaultProvider(base.options);
  const known = login && login.exp >= base.now && hasProvider(base.options, id) ? id : undefined;
  const error = q.get('error');
  if (error) {
    console.warn(`Omark sign-in: authorize answered ${error}`);
    return back(error === 'access_denied' ? 'cancelled' : 'failed', known);
  }
  const state = q.get('state');
  if (!login || !known || !state || state !== login.state) return back('expired');
  const ctx = withProvider(base, id);
  if (ctx instanceof Response) return ctx;
  const code = q.get('code');
  if (!code) return back('failed', id);

  const added = login.a === undefined ? [] : (extraFor(ctx.provider, login.a) ?? []);
  const redeemed = await redeem(ctx, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(ctx),
    code_verifier: login.verifier,
    scope: [ctx.provider.signinScope, ...added].join(' '),
  });
  if (redeemed.kind !== 'ok') return back(redeemed.kind === 'signin' ? 'failed' : 'unavailable', id);
  const { refresh_token: rt, id_token, scope } = redeemed.tokens;
  // The user can untick permissions on the consent screen; a session without them would only fail later.
  const granted = typeof scope === 'string' ? scope.split(' ') : [];
  if ([...(ctx.provider.requiredScopes ?? []), ...added].some((required) => !granted.includes(required))) {
    console.warn('Omark sign-in: the grant lacks a required scope');
    // Named when the missing one was an access being added, so the app can say which.
    return back('scope', id, added.length > 0 ? login.a : undefined);
  }
  if (!rt) return back('failed', id);

  let session: string[];
  try {
    session = await sessionCookies(ctx, rt, grantedScope(ctx.provider, granted));
  } catch {
    console.error('Omark sign-in: the refresh token does not fit in the session cookies');
    return back('failed', id);
  }
  const cookies = [clearLogin, ...session];
  const username = usernameFrom(id_token);
  if (username) {
    const hint = await seal(ctx.key, HINT.name, { username, p: id } satisfies Hint);
    cookies.push(serializeCookie(HINT.name, hint, { path: HINT.path, maxAge: HINT_MAX_AGE }));
  }
  return redirect(home, cookies);
}

/** `{ accessToken, expiresAt }` (ms since the epoch); 401 `{ signin: true }` when only signing in helps; 503 when the provider cannot be reached. */
async function token(base: Base): Promise<Response> {
  const SESSION = base.names.session;
  const session = await unseal<Session>(base.key, SESSION.name, readChunkedCookie(base.cookies, SESSION.name));
  if (!session || typeof session.rt !== 'string' || session.exp < base.now) return json(401, { signin: true }, clearSession(base));
  const id = session.p ?? defaultProvider(base.options);
  // A provider the app no longer offers: only a new sign-in helps.
  if (!hasProvider(base.options, id)) return json(401, { signin: true }, clearSession(base));
  const ctx = withProvider(base, id);
  if (ctx instanceof Response) return ctx;
  // Re-filtered on each call, so a scope the app no longer has is not asked for.
  const sc = session.sc === undefined ? undefined : grantedScope(ctx.provider, session.sc.split(' '));
  const redeemed = await redeem(ctx, { grant_type: 'refresh_token', refresh_token: session.rt, scope: sc ?? ctx.provider.scope });
  // Asking a refresh token for more than it was granted is `invalid_scope` (Time spec 15.1): only a new sign-in helps.
  const stale = sc !== undefined && redeemed.kind === 'unavailable' && redeemed.error === 'invalid_scope';
  if (redeemed.kind === 'signin' || stale) return json(401, { signin: true }, clearSession(ctx));
  if (redeemed.kind === 'unavailable') return json(503, { error: 'unavailable' });
  const { access_token, expires_in, refresh_token } = redeemed.tokens;
  // Microsoft sends a new refresh token on every use; keep the old one if a provider does not.
  return json(
    200,
    { accessToken: access_token, expiresAt: ctx.now + expires_in * 1000 },
    await sessionCookies(ctx, refresh_token ?? session.rt, sc),
  );
}

const logout = (ctx: Base): Response => {
  const HINT = ctx.names.hint;
  return json(200, { ok: true }, [...clearSession(ctx), serializeCookie(HINT.name, '', { path: HINT.path, maxAge: 0 })]);
};

/**
 * For a provider with extra scopes, the granted ones it knows (its own and every extra), in its order: what each
 * token call asks for, so an access token carries what was added. Undefined for the others, which keep asking
 * for their fixed `scope`.
 */
function grantedScope(provider: ProviderConfig, granted: string[]): string | undefined {
  if (!provider.extraScopes) return undefined;
  const known = [...provider.scope.split(' '), ...Object.values(provider.extraScopes).flat()];
  return [...new Set(known)].filter((s) => granted.includes(s)).join(' ');
}

/** Rolling: every token refresh sets them again. */
async function sessionCookies(ctx: Context, rt: string, sc?: string): Promise<string[]> {
  const { session: SESSION, signedIn: SIGNED_IN } = ctx.names;
  const maxAge = ctx.provider.sessionMaxAge;
  const session: Session = { rt, exp: ctx.now + maxAge * 1000, p: ctx.providerId, ...(sc === undefined ? {} : { sc }) };
  const sealed = await seal(ctx.key, SESSION.name, session);
  return [
    ...chunkedCookies(SESSION.name, sealed, { path: SESSION.path, maxAge }),
    serializeCookie(SIGNED_IN.name, ctx.providerId, { path: SIGNED_IN.path, maxAge, httpOnly: false }),
  ];
}

const clearSession = (ctx: Base): string[] => {
  const { session: SESSION, signedIn: SIGNED_IN } = ctx.names;
  return [
    ...clearChunkedCookies(SESSION.name, { path: SESSION.path }),
    serializeCookie(SIGNED_IN.name, '', { path: SIGNED_IN.path, maxAge: 0, httpOnly: false }),
  ];
};

/**
 * CSRF check for the POST endpoints: the custom header, an `Origin` equal to this origin, and (where the
 * browser sends it) `Sec-Fetch-Site: same-origin`. Browsers send `Origin` on every POST.
 */
function sameOrigin(ctx: Base): boolean {
  const headers = ctx.request.headers;
  if (headers.get(CSRF_HEADER) !== '1') return false;
  if (headers.get('Origin') !== ctx.url.origin) return false;
  const site = headers.get('Sec-Fetch-Site');
  return site === null || site === 'same-origin';
}

/** One token endpoint call within the time limit. Logs the provider's error code, never a token. */
async function redeem(ctx: Context, grant: Record<string, string>): Promise<Redeemed> {
  let res: Response;
  let body: Record<string, unknown>;
  try {
    res = await ctx.fetch(ctx.provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: ctx.provider.clientId, client_secret: ctx.provider.clientSecret, ...grant }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    console.warn('Omark sign-in: token endpoint unreachable');
    return { kind: 'unavailable' };
  }
  if (res.ok && typeof body.access_token === 'string' && typeof body.expires_in === 'number') {
    return { kind: 'ok', tokens: body as unknown as Tokens };
  }
  const error = typeof body.error === 'string' ? body.error : 'none';
  console.warn(`Omark sign-in: token endpoint answered ${res.status} (${error})`);
  return SIGN_IN_ERRORS.includes(error) ? { kind: 'signin' } : { kind: 'unavailable', error };
}

/**
 * The account name from the ID token, for `login_hint`. It came straight from the provider's token endpoint
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
