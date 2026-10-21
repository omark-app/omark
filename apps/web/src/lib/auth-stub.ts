import { AuthRequiredError } from '@omark/storage';
import type { Auth, FileName, StorageAdapter } from '@omark/storage';

/**
 * The Microsoft account an e2e test pretends to have, set as `window.__TASKAPP_AUTH_STUB__` before the
 * app loads. Only the fake-storage build reads it (see `boot`):
 * - `signed-out`: no account, so the sign-in screen shows;
 * - `expired`: signed in, but every token refresh needs a fresh sign-in;
 * - `redirect-error`: returning from the sign-in page fails, so the app cannot start;
 * - `stalled-start`: the sign-in library never finishes starting (a hung MSAL), and tokens need a sign-in.
 */
export type AuthStubState = 'signed-out' | 'expired' | 'redirect-error' | 'stalled-start';

/** A stand-in for the sign-in helper. `signIns` counts sign-in attempts (the real one would leave the page). */
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
      if (state === 'stalled-start') await new Promise<never>(() => {});
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
