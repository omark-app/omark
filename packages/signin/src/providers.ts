/** The Pages project's variables and secrets (`wrangler pages secret put`). `COOKIE_KEY` is shared; each provider reads its own keys. */
export type Env = Record<string, string | undefined>;

/** Where an app's users sign in. */
export interface Provider {
  /** For logs and errors, e.g. 'Microsoft'. */
  name: string;
  /** Reads this provider's settings; a string is the error to log (the handler returns 500 not_configured). */
  configure(env: Env): ProviderConfig | string;
}

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Asked when redeeming a refresh token. */
  scope: string;
  /** Asked at sign-in. */
  signinScope: string;
  /** Rolling session cookie lifetime, seconds. */
  sessionMaxAge: number;
  /** Extra query parameters on the authorize redirect. */
  authorizeParams?: Record<string, string>;
  /** Scopes that must all be in the `scope` the token endpoint reports as granted; otherwise the sign-in fails. */
  requiredScopes?: readonly string[];
}

const DAY = 24 * 60 * 60;
const DEFAULT_TENANT = 'consumers';
/** A tenant is `consumers`, `common`, `organizations`, a domain or a GUID; nothing that could change the URL's path. */
const TENANT = /^[a-z0-9][a-z0-9.-]*$/i;

/**
 * A Microsoft account, for OneDrive. Reads `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET`, `MSAL_TENANT` (default
 * `consumers`) and `ONEDRIVE_SCOPE` (`full` asks for the whole drive, anything else the app folder).
 */
export const microsoft: Provider = {
  name: 'Microsoft',
  configure(env) {
    if (!env.MSAL_CLIENT_ID || !env.MSAL_CLIENT_SECRET) return 'MSAL_CLIENT_ID or MSAL_CLIENT_SECRET is not set';
    const tenant = env.MSAL_TENANT || DEFAULT_TENANT;
    if (!TENANT.test(tenant)) return 'MSAL_TENANT is not a tenant name';
    const authority = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
    const scope = `${env.ONEDRIVE_SCOPE === 'full' ? 'Files.ReadWrite' : 'Files.ReadWrite.AppFolder'} offline_access`;
    return {
      clientId: env.MSAL_CLIENT_ID,
      clientSecret: env.MSAL_CLIENT_SECRET,
      authorizeUrl: `${authority}/authorize`,
      tokenUrl: `${authority}/token`,
      scope,
      // The ID token is asked for only to read the account name for the next `login_hint`.
      signinScope: `openid profile ${scope}`,
      // Microsoft's refresh tokens for web apps last 90 days and are replaced on use.
      sessionMaxAge: 90 * DAY,
    };
  },
};

/**
 * A Google account, for Drive. Reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `scopes` are the full
 * scope URLs the app needs; the user can untick them on the consent screen, so all are required back.
 */
export const google = ({ scopes }: { scopes: readonly string[] }): Provider => ({
  name: 'Google',
  configure(env) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set';
    const scope = scopes.join(' ');
    return {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope,
      // The ID token is asked for only to read the email for the next `login_hint`.
      signinScope: `openid email ${scope}`,
      // Google does not rotate refresh tokens; this is how long an unused session cookie lasts.
      sessionMaxAge: 180 * DAY,
      // `prompt=consent` because Google sends a refresh token only when the user consents.
      authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      requiredScopes: scopes,
    };
  },
});
