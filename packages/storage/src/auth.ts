import {
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { AuthRequiredError } from './errors.ts';

export interface Auth {
  signIn(): Promise<void>;
  getToken(): Promise<string>;
  isSignedIn(): boolean;
  handleRedirect(): Promise<void>;
}

const SCOPES = ['Files.ReadWrite'];
const AUTHORITY = 'https://login.microsoftonline.com/consumers';

export function createAuth(opts: {
  clientId: string;
  redirectUri: string;
  msal?: IPublicClientApplication;
}): Auth {
  const msal =
    opts.msal ??
    new PublicClientApplication({
      auth: { clientId: opts.clientId, authority: AUTHORITY, redirectUri: opts.redirectUri },
      cache: { cacheLocation: BrowserCacheLocation.LocalStorage },
    });

  let ready: Promise<void> | undefined;
  const init = () => (ready ??= msal.initialize());

  const account = (): AccountInfo | null => msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;

  return {
    async handleRedirect() {
      await init();
      const result = await msal.handleRedirectPromise();
      if (result?.account) msal.setActiveAccount(result.account);
      else if (!msal.getActiveAccount()) {
        const first = msal.getAllAccounts()[0];
        if (first) msal.setActiveAccount(first);
      }
    },
    async signIn() {
      await init();
      await msal.loginRedirect({ scopes: SCOPES });
    },
    async getToken() {
      await init();
      const acct = account();
      if (!acct) throw new AuthRequiredError('Not signed in');
      try {
        const res = await msal.acquireTokenSilent({ scopes: SCOPES, account: acct });
        return res.accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) throw new AuthRequiredError('Sign in needed');
        throw e;
      }
    },
    isSignedIn() {
      return account() !== null;
    },
  };
}
