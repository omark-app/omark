import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/auth/[[path]].ts';

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64url');
const ENV = { MSAL_CLIENT_ID: 'cid', MSAL_CLIENT_SECRET: 'secret', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', COOKIE_KEY: KEY };
const get = (path: string, env: Record<string, string> = ENV) => onRequest({ request: new Request(`https://app.example${path}`), env });
const cookieNames = (res: Response) => res.headers.getSetCookie().map((c) => c.split('=')[0]);
const scopes = (res: Response) => new URL(res.headers.get('Location')!).searchParams.get('scope')!.split(' ').sort();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the one app's sign-in function", () => {
  it('offers Microsoft, then Google, with no OMARK_APP', async () => {
    expect(await (await get('/api/auth/providers')).json()).toEqual({ providers: ['microsoft', 'google'] });
  });

  it('signs in to OneDrive in the app folder, with omark cookies', async () => {
    const res = await get('/api/auth/login?return=/tasks');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')!.startsWith('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?')).toBe(true);
    expect(scopes(res)).toEqual(['Files.ReadWrite.AppFolder', 'offline_access', 'openid', 'profile']);
    expect(cookieNames(res)).toEqual(['omark_login']);
  });

  it('asks Google for Drive only at first, and for the calendar when Time adds it', async () => {
    const drive = 'https://www.googleapis.com/auth/drive.file';
    expect(scopes(await get('/api/auth/login?provider=google'))).toEqual(['email', drive, 'openid']);
    expect(scopes(await get('/api/auth/login?provider=google&add=calendar'))).toEqual([
      'email',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.owned.readonly',
      drive,
      'openid',
    ]);
    expect(scopes(await get('/api/auth/login?provider=google&add=edit'))).toContain('https://www.googleapis.com/auth/calendar.events.owned');
  });

  it('ignores OMARK_APP: the one app has no other apps', async () => {
    expect(cookieNames(await get('/api/auth/login', { ...ENV, OMARK_APP: 'time' }))).toEqual(['omark_login']);
  });
});
