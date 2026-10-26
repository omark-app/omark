import { AuthRequiredError } from '@omark/storage';
import type { Auth, StorageAdapter } from '@omark/storage';
import type { TaskFile } from './workspace.ts';

/**
 * The account an e2e test pretends to have, set as `window.__TASKAPP_AUTH_STUB__` before the app loads.
 * Only the fake-storage build reads it (see `boot`). All but `google` are a Microsoft account:
 * - `signed-out`: no account, so the sign-in screen shows;
 * - `expired`: signed in, but every token refresh needs a fresh sign-in;
 * - `redirect-error`: returning from the sign-in page fails, so the app cannot start;
 * - `stalled-start`: the sign-in library never finishes starting (a hung library), and tokens need a sign-in;
 * - `google`: signed in with Google, with Drive access granted (tokens always come);
 * - `google-expired`: signed in with Google, but every token refresh needs a fresh sign-in, and the first
 *   failed one clears the signed-in cookie (as the helper does), so `signedInProvider()` turns null.
 */
export type AuthStubState = 'signed-out' | 'expired' | 'redirect-error' | 'stalled-start' | 'google' | 'google-expired';

/**
 * A stand-in for the sign-in helper. `signIns` counts sign-in attempts (the real one would leave the page);
 * `signInWith` lists the provider each one asked for (null for none). `providers` is what the helper offers.
 */
export interface AuthStub extends Auth {
  readonly signIns: number;
  readonly signInWith: readonly (string | null)[];
}

export function createAuthStub(state: AuthStubState, providers: string[] = ['microsoft']): AuthStub {
  const signInWith: (string | null)[] = [];
  let cookieCleared = false;
  return {
    get signIns() {
      return signInWith.length;
    },
    signInWith,
    async handleRedirect() {
      if (state === 'redirect-error') throw new Error('The sign-in response could not be read');
      if (state === 'stalled-start') await new Promise<never>(() => {});
    },
    isSignedIn: () => state !== 'signed-out',
    signedInProvider: () => {
      if (state === 'signed-out' || cookieCleared) return null;
      return state.startsWith('google') ? 'google' : 'microsoft';
    },
    availableProviders: async () => providers,
    async signIn(provider?: string) {
      signInWith.push(provider ?? null);
    },
    async getToken() {
      if (state === 'google') return 'fake-google-token';
      if (state === 'google-expired') cookieCleared = true;
      throw new AuthRequiredError('Sign in needed');
    },
  };
}

/** The drive behind a token, like the Graph adapter: every call gets a token first. */
export function tokenGated(drive: StorageAdapter, getToken: () => Promise<string>): StorageAdapter {
  return {
    async read(name: TaskFile) {
      await getToken();
      return drive.read(name);
    },
    async write(name: TaskFile, text: string, ifMatch: string | null) {
      await getToken();
      return drive.write(name, text, ifMatch);
    },
  };
}
