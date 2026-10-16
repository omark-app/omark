import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from '@azure/msal-browser';
import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { AuthRequiredError } from '../src/errors.ts';

const account = { homeAccountId: 'h', username: 'u@example.com' } as AccountInfo;

function stub(overrides: Record<string, unknown> = {}) {
  const msal = {
    initialize: vi.fn(async () => {}),
    handleRedirectPromise: vi.fn(async () => null),
    getActiveAccount: vi.fn(() => account as AccountInfo | null),
    getAllAccounts: vi.fn(() => [account]),
    setActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn(async () => ({ accessToken: 'tok' })),
    loginRedirect: vi.fn(async () => {}),
    acquireTokenRedirect: vi.fn(async () => {}),
    ...overrides,
  };
  return msal as typeof msal & IPublicClientApplication;
}
const mk = (msal: IPublicClientApplication) =>
  createAuth({ clientId: 'cid', redirectUri: 'https://x/', msal });

describe('createAuth', () => {
  it('getToken returns the silent access token', async () => {
    const msal = stub();
    expect(await mk(msal).getToken()).toBe('tok');
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({ scopes: ['Files.ReadWrite'], account });
  });

  it('throws AuthRequiredError without redirecting when interaction is required', async () => {
    const msal = stub({
      acquireTokenSilent: vi.fn(async () => {
        throw new InteractionRequiredAuthError('interaction_required', 'needs interaction');
      }),
    });
    await expect(mk(msal).getToken()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(msal.loginRedirect).not.toHaveBeenCalled();
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it('throws AuthRequiredError when there is no account', async () => {
    const msal = stub({ getActiveAccount: vi.fn(() => null), getAllAccounts: vi.fn(() => []) });
    await expect(mk(msal).getToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('signIn calls loginRedirect with the scopes', async () => {
    const msal = stub();
    await mk(msal).signIn();
    expect(msal.loginRedirect).toHaveBeenCalledWith({ scopes: ['Files.ReadWrite'] });
  });

  it('handleRedirect sets the active account from the redirect result', async () => {
    const msal = stub({
      getActiveAccount: vi.fn(() => null),
      getAllAccounts: vi.fn(() => []),
      handleRedirectPromise: vi.fn(async () => ({ account })),
    });
    const auth = mk(msal);
    await auth.handleRedirect();
    expect(msal.setActiveAccount).toHaveBeenCalledWith(account);
  });

  it('isSignedIn reflects whether an account exists', async () => {
    expect(mk(stub()).isSignedIn()).toBe(true);
    expect(mk(stub({ getActiveAccount: vi.fn(() => null), getAllAccounts: vi.fn(() => []) })).isSignedIn()).toBe(false);
  });
});
