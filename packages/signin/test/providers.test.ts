import { describe, expect, it } from 'vitest';
import { google, microsoft } from '../src/providers.ts';
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

  it('asks only for the app folder, even with a leftover ONEDRIVE_SCOPE=full', () => {
    const config = microsoft.configure({ ...ENV, ONEDRIVE_SCOPE: 'full' }) as ProviderConfig;
    expect(config.scope).toBe('Files.ReadWrite.AppFolder offline_access');
    expect(config.signinScope).toBe('openid profile Files.ReadWrite.AppFolder offline_access');
  });

  it('uses MSAL_TENANT for both endpoints', () => {
    const config = microsoft.configure({ ...ENV, MSAL_TENANT: 'common' }) as ProviderConfig;
    expect(config.authorizeUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(config.tokenUrl).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
  });
});

const DRIVE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret' };

describe('google', () => {
  it('names the missing client settings', () => {
    const result = google({ scopes: [DRIVE] }).configure({});
    expect(typeof result).toBe('string');
    expect(result).toContain('GOOGLE_CLIENT_ID');
  });

  it('returns the endpoints, the Drive scope, offline access and a 180-day session', () => {
    const provider = google({ scopes: [DRIVE] });
    expect(provider.name).toBe('Google');
    expect(provider.configure(GOOGLE_ENV)).toEqual({
      clientId: 'gid',
      clientSecret: 'gsecret',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: DRIVE,
      signinScope: `openid email ${DRIVE}`,
      sessionMaxAge: 180 * 86400,
      authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      requiredScopes: [DRIVE],
    });
  });

  it('joins several scopes with a space and requires all of them', () => {
    const other = 'https://www.googleapis.com/auth/calendar.events';
    const config = google({ scopes: [DRIVE, other] }).configure(GOOGLE_ENV) as ProviderConfig;
    expect(config.scope).toBe(`${DRIVE} ${other}`);
    expect(config.signinScope).toBe(`openid email ${DRIVE} ${other}`);
    expect(config.requiredScopes).toEqual([DRIVE, other]);
  });
});
