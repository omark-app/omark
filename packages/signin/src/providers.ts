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
