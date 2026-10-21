import { describe, expect, it } from 'vitest';
import { checkSignin } from '../check-signin.mjs';

const URL_ = 'https://tasks.example.test';
const login = (tenant: string, scope: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=x&scope=${encodeURIComponent(`openid profile ${scope} offline_access`)}`;

/** Answers each call with the next response: a Location for a 302, or a bare status. */
function setup(answers: (string | number)[]) {
  const calls: { url: string; redirect?: string }[] = [];
  let sleeps = 0;
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), redirect: init?.redirect });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    return typeof a === 'number' ? new Response('', { status: a }) : new Response(null, { status: 302, headers: { Location: a } });
  }) as typeof fetch;
  const sleep = async () => {
    sleeps++;
  };
  return { calls, sleeps: () => sleeps, fake, sleep };
}

describe('checkSignin', () => {
  it('passes when login redirects to the tenant with app-folder scope', async () => {
    const s = setup([login('consumers', 'Files.ReadWrite.AppFolder')]);
    const r = await checkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(true);
    expect(s.calls[0]).toEqual({ url: `${URL_}/api/auth/login`, redirect: 'manual' });
  });

  it('passes for whole-drive scope when full is expected', async () => {
    const s = setup([login('consumers', 'Files.ReadWrite')]);
    const r = await checkSignin({ url: URL_, scope: 'full', fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(true);
  });

  it('fails when the helper grants app-folder but full is expected', async () => {
    const s = setup([login('consumers', 'Files.ReadWrite.AppFolder')]);
    const r = await checkSignin({ url: URL_, scope: 'full', fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Files.ReadWrite.AppFolder');
    expect(r.message).toContain('full');
  });

  it('fails when the redirect goes to another tenant', async () => {
    const s = setup([login('organizations', 'Files.ReadWrite.AppFolder')]);
    const r = await checkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('consumers');
  });

  it('retries until the helper is live', async () => {
    const s = setup([404, 404, login('consumers', 'Files.ReadWrite.AppFolder')]);
    const r = await checkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(true);
    expect(s.calls).toHaveLength(3);
  });

  it('fails after the last attempt', async () => {
    const s = setup([404]);
    const r = await checkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(s.calls).toHaveLength(6);
    expect(s.sleeps()).toBe(5);
  });
});
