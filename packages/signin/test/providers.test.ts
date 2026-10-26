import { describe, expect, it } from 'vitest';
import { microsoft } from '../src/providers.ts';
import type { ProviderConfig } from '../src/providers.ts';

const ENV = { MSAL_CLIENT_ID: 'cid', MSAL_CLIENT_SECRET: 'secret' };

describe('microsoft', () => {
  it('names the missing client settings', () => {
    const result = microsoft.configure({});
    expect(typeof result).toBe('string');
    expect(result).toContain('MSAL_CLIENT_ID');
  });

  it('refuses a tenant that is not a tenant name', () => {
    const result = microsoft.configure({ ...ENV, MSAL_TENANT: 'a/b' });
    expect(typeof result).toBe('string');
    expect(result).toContain('MSAL_TENANT');
  });

  it("returns today's consumers endpoints, app-folder scope and 90-day session", () => {
    const config = microsoft.configure(ENV) as ProviderConfig;
    expect(config).toEqual({
      clientId: 'cid',
      clientSecret: 'secret',
      authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      scope: 'Files.ReadWrite.AppFolder offline_access',
      signinScope: 'openid profile Files.ReadWrite.AppFolder offline_access',
      sessionMaxAge: 90 * 86400,
    });
    expect(microsoft.name).toBe('Microsoft');
  });

  it('asks for the whole drive when ONEDRIVE_SCOPE is full', () => {
    const config = microsoft.configure({ ...ENV, ONEDRIVE_SCOPE: 'full' }) as ProviderConfig;
    expect(config.scope).toBe('Files.ReadWrite offline_access');
    expect(config.signinScope).toBe('openid profile Files.ReadWrite offline_access');
  });

  it('uses MSAL_TENANT for both endpoints', () => {
    const config = microsoft.configure({ ...ENV, MSAL_TENANT: 'common' }) as ProviderConfig;
    expect(config.authorizeUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(config.tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
  });
});
