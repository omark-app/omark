import { AuthRequiredError, OfflineError } from './errors.ts';

export interface Auth {
  /** Without a provider: the one last seen signed in, else the default. */
  signIn(provider?: string): Promise<void>;
  /** `fresh` skips the access token kept in memory (Graph rejected it). */
  getToken(opts?: { fresh?: boolean }): Promise<string>;
  isSignedIn(): boolean;
  /** The provider of the session the hint cookie speaks of, or null when signed out. */
  signedInProvider(): string | null;
  /** The providers the helper has set up, in order; just the default when it cannot be asked. */
  availableProviders(): Promise<string[]>;
  handleRedirect(): Promise<void>;
}

/** The sign-in helper's endpoints (`packages/signin`), on the app's own origin. */
const BASE = '/api/auth';
/** Must match `CSRF_HEADER` in `packages/signin`. */
const CSRF_HEADER = 'X-TaskApp-Auth';
/** An access token is renewed this long before it expires. */
const RENEW_BEFORE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;

/** What `/api/auth/callback` sends back as `?signin_error=`. */
const signinErrors = (provider: string): Record<string, string> => ({
  scope: `Sign in again and allow access to your files in ${provider} Drive`,
  cancelled: 'Sign-in was cancelled',
  expired: 'The sign-in took too long or was started in another window; sign in again',
  failed: `${provider} did not accept the sign-in`,
  unavailable: `${provider} could not be reached; check the connection and sign in again`,
});

export interface AuthOptions {
  /** The app's cookie prefix in the sign-in helper; this reads `<cookiePrefix>_signed_in`. */
  cookiePrefix: string;
  /** The sign-in providers: id in the helper → name for error texts. The first is the default. */
  providers: Record<string, string>;
  fetch?: typeof fetch;
  /** Leaves the page for the sign-in (a top-level navigation). */
  navigate?: (url: string) => void;
  /** `document.cookie`. */
  cookies?: () => string;
  now?: () => number;
  /** Per token call; a call that takes longer fails with `OfflineError`. Default 15 s. */
  timeoutMs?: number;
}

/**
 * Sign-in through the app's own sign-in helper. The refresh token lives in an HttpOnly cookie that only
 * `/api/auth/token` receives, so it lasts as long as the provider allows (Microsoft: 90 days, rolling)
 * instead of an SPA's 24 hours, and needs no hidden iframe. The access token is kept in memory until a
 * minute before it expires. A 401 from the helper means sign in again (`AuthRequiredError`); no network,
 * a timeout or a 503 means offline (`OfflineError`), and the caller retries later.
 */
export function createAuth(opts: AuthOptions): Auth {
  /** Set (readable, no secret in it) alongside the HttpOnly session cookie; cleared when the session is. */
  const signedInCookie = `${opts.cookiePrefix}_signed_in`;
  const [defaultProvider = 'microsoft'] = Object.keys(opts.providers);
  const fetchFn = opts.fetch ?? ((...args) => globalThis.fetch(...args));
  const navigate = opts.navigate ?? ((url: string) => window.location.assign(url));
  const cookies = opts.cookies ?? (() => document.cookie);
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let cached: { accessToken: string; expiresAt: number } | null = null;
  /** One refresh at a time: concurrent callers share it, so the rotated refresh token is not raced. */
  let pending: Promise<string> | null = null;

  async function refresh(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${BASE}/token`, {
        method: 'POST',
        headers: { [CSRF_HEADER]: '1' },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.status === 401) {
        cached = null;
        throw new AuthRequiredError('Sign in needed');
      }
      if (!res.ok) throw new OfflineError(`Sign-in helper answered ${res.status}`);
      const body = (await res.json()) as { accessToken?: unknown; expiresAt?: unknown };
      if (typeof body.accessToken !== 'string' || typeof body.expiresAt !== 'number') {
        throw new OfflineError('Sign-in helper sent no token');
      }
      cached = { accessToken: body.accessToken, expiresAt: body.expiresAt };
      return body.accessToken;
    } catch (e) {
      if (e instanceof AuthRequiredError || e instanceof OfflineError) throw e;
      // A fetch TypeError (no network), the abort on timeout, or a body that is not JSON.
      throw new OfflineError(controller.signal.aborted ? 'Sign-in helper timed out' : 'Sign-in helper unreachable');
    } finally {
      clearTimeout(timer);
    }
  }

  function signedInProvider(): string | null {
    const cookie = cookies()
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${signedInCookie}=`));
    if (cookie === undefined) return null;
    const value = cookie.slice(signedInCookie.length + 1);
    // Sessions from before there were providers have `1`: the default.
    return value === '' ? null : value === '1' ? defaultProvider : value;
  }

  return {
    async handleRedirect() {
      const url = new URL(window.location.href);
      const reason = url.searchParams.get('signin_error');
      if (reason === null) return;
      // Drop it from the address bar first, so "Try again" (a reload) starts clean.
      const provider = url.searchParams.get('provider');
      url.searchParams.delete('signin_error');
      url.searchParams.delete('provider');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      const name = (provider !== null && opts.providers[provider]) || opts.providers[defaultProvider] || '';
      throw new Error(signinErrors(name)[reason] ?? 'Sign-in failed');
    },
    async signIn(provider) {
      // A top-level navigation: the helper redirects to the provider and back to /api/auth/callback, which
      // returns to / (in an iOS home-screen app's scope). The helper adds the last account as login_hint.
      const id = provider ?? signedInProvider() ?? defaultProvider;
      // Without a choice, the default keeps the plain URL.
      navigate(provider === undefined && id === defaultProvider ? `${BASE}/login` : `${BASE}/login?provider=${encodeURIComponent(id)}`);
    },
    async getToken(o) {
      if (!o?.fresh && cached && cached.expiresAt - RENEW_BEFORE_MS > now()) return cached.accessToken;
      if (o?.fresh) cached = null;
      pending ??= refresh().finally(() => {
        pending = null;
      });
      return pending;
    },
    signedInProvider,
    async availableProviders() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchFn(`${BASE}/providers`, { credentials: 'same-origin', signal: controller.signal });
        if (!res.ok) return [defaultProvider];
        const body = (await res.json()) as { providers?: unknown };
        const list = Array.isArray(body.providers) ? body.providers.filter((p): p is string => typeof p === 'string') : [];
        return list.length > 0 ? list : [defaultProvider];
      } catch {
        return [defaultProvider];
      } finally {
        clearTimeout(timer);
      }
    },
    isSignedIn() {
      // The hint cookie can outlive a revoked session; then the first token call answers 401.
      return signedInProvider() !== null;
    },
  };
}
