import { createAuth } from '@omark/storage';

/** What a sign-in can be asked for later (spec 10.2): Google Drive for the files, edit access for colouring. */
export type Access = 'drive' | 'edit';

export interface TimeAuth {
  isSignedIn(): boolean;
  /** Leaves the page for Google's read-only sign-in. */
  signIn(): Promise<void>;
  /** Leaves the page for a second consent that adds `access` to the sign-in. */
  addAccess(access: Access): Promise<void>;
  getToken(opts?: { fresh?: boolean }): Promise<string>;
  /** Throws the sign-in helper's error text when the page is its return from a failed sign-in. */
  handleRedirect(): Promise<void>;
  signOut(): Promise<void>;
}

/** Must match `CSRF_HEADER` in `packages/signin`. */
const CSRF_HEADER = 'X-Omark-Auth';

/** Google through the sign-in helper at /api/auth (the `time` app there: cookie prefix `omarktime`). */
export function createTimeAuth(): TimeAuth {
  const auth = createAuth({
    cookiePrefix: 'omarktime',
    providers: { google: 'Google' },
    appName: 'Omark Time',
    scopeErrors: {
      '': "Google didn't let Omark Time see your calendars and events. Sign in again and tick both boxes.",
      drive: "Google didn't give Omark Time access to its files in Drive. Pick Google Drive again and tick the box for its own files.",
      edit: "Google didn't give Omark Time edit access to your events, so it can't colour them. Turn colouring on again and tick the box.",
    },
  });
  return {
    isSignedIn: () => auth.isSignedIn(),
    signIn: () => auth.signIn('google'),
    addAccess: (access) => auth.signIn('google', { add: access }),
    getToken: (opts) => auth.getToken(opts),
    handleRedirect: () => auth.handleRedirect(),
    async signOut() {
      const res = await fetch('/api/auth/logout', { method: 'POST', headers: { [CSRF_HEADER]: '1' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error('Sign-out failed; try again');
    },
  };
}
