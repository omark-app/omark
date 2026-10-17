import { AuthRequiredError } from '@taskapp/storage';
import type { Auth, FileName, StorageAdapter } from '@taskapp/storage';

/**
 * The Microsoft account an e2e test pretends to have, set as `window.__TASKAPP_AUTH_STUB__` before the
 * app loads. Only the fake-storage build reads it (see `boot`):
 * - `signed-out`: no account, so the sign-in screen shows;
 * - `expired`: signed in, but every token refresh needs a fresh sign-in;
 * - `redirect-error`: returning from the sign-in page fails, so the app cannot start.
 */
export type AuthStubState = 'signed-out' | 'expired' | 'redirect-error';

/** A stand-in for MSAL. `signIns` counts sign-in attempts (the real one would leave the page). */
export interface AuthStub extends Auth {
  readonly signIns: number;
}

export function createAuthStub(state: AuthStubState): AuthStub {
  let signIns = 0;
  return {
    get signIns() {
      return signIns;
    },
    async handleRedirect() {
      if (state === 'redirect-error') throw new Error('The sign-in response could not be read');
    },
    isSignedIn: () => state !== 'signed-out',
    async signIn() {
      signIns++;
    },
    async getToken() {
      throw new AuthRequiredError('Sign in needed');
    },
  };
}

/** The drive behind a token, like the Graph adapter: every call gets a token first. */
export function tokenGated(drive: StorageAdapter, getToken: () => Promise<string>): StorageAdapter {
  return {
    async read(name: FileName) {
      await getToken();
      return drive.read(name);
    },
    async write(name: FileName, text: string, ifMatch: string | null) {
      await getToken();
      return drive.write(name, text, ifMatch);
    },
  };
}
