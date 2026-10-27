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

  it.each(['nope', 'constructor', 'toString'])('refuses OMARK_APP %s', async (app) => {
    const res = await onRequest({ request: login(), env: { ...ENV, OMARK_APP: app } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(`Omark sign-in: OMARK_APP "${app}" is not an app`);
  });
});
