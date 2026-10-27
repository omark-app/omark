import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toBase64Url } from '../src/crypto.ts';
import { onRequest } from '../../../functions/api/auth/[[path]].ts';

const KEY = toBase64Url(new Uint8Array(32).fill(7));
const ENV = { MSAL_CLIENT_ID: 'cid', MSAL_CLIENT_SECRET: 'secret', COOKIE_KEY: KEY };
const login = () => new Request('https://tasks.example/api/auth/login');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('the Pages Function', () => {
  it('runs Tasks when OMARK_APP is unset', async () => {
    const res = await onRequest({ request: login(), env: ENV });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')!.startsWith('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?')).toBe(true);
    expect(res.headers.getSetCookie().map((c) => c.split('=')[0])).toEqual(['taskapp_login']);
  });

  it('runs Tasks when OMARK_APP is tasks', async () => {
    const res = await onRequest({ request: login(), env: { ...ENV, OMARK_APP: 'tasks' } });
    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie().map((c) => c.split('=')[0])).toEqual(['taskapp_login']);
  });

  it('lists Microsoft and Google for Tasks when both are configured', async () => {
    const env = { ...ENV, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret' };
    const res = await onRequest({ request: new Request('https://tasks.example/api/auth/providers'), env });
    expect(await res.json()).toEqual({ providers: ['microsoft', 'google'] });
  });

  it('runs Omark Time when OMARK_APP is time: Google only, reading calendars and events', async () => {
    const env = { COOKIE_KEY: KEY, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', OMARK_APP: 'time' };
    const res = await onRequest({ request: new Request('https://time.example/api/auth/login'), env });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('scope')!.split(' ').sort()).toEqual([
      'email',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.owned.readonly',
      'openid',
    ]);
    expect(res.headers.getSetCookie().map((c) => c.split('=')[0])).toEqual(['omarktime_login']);
    const providers = await onRequest({ request: new Request('https://time.example/api/auth/providers'), env });
    expect(await providers.json()).toEqual({ providers: ['google'] });
    // Drive and edit access are added later, each with its own consent.
    for (const [add, scope] of [
      ['drive', 'https://www.googleapis.com/auth/drive.file'],
      ['edit', 'https://www.googleapis.com/auth/calendar.events.owned'],
    ]) {
      const more = await onRequest({ request: new Request(`https://time.example/api/auth/login?provider=google&add=${add}`), env });
      expect(new URL(more.headers.get('Location')!).searchParams.get('scope')!.split(' ')).toContain(scope);
    }
  });

  it.each(['nope', 'constructor', 'toString'])('refuses OMARK_APP %s', async (app) => {
    const res = await onRequest({ request: login(), env: { ...ENV, OMARK_APP: app } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(`Omark sign-in: OMARK_APP "${app}" is not an app`);
  });
});
