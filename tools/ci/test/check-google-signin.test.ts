import { describe, expect, it } from 'vitest';
import { checkGoogleSignin } from '../check-google-signin.mjs';

const URL_ = 'https://time.example.test';
const READ = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.owned.readonly'];
const google = (scopes: string[]) =>
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=x&scope=${encodeURIComponent(['openid', 'email', ...scopes].join(' '))}`;

function setup(answers: (string | number)[]) {
  const calls: { url: string; redirect?: string }[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), redirect: init?.redirect });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    return typeof a === 'number' ? new Response('', { status: a }) : new Response(null, { status: 302, headers: { Location: a } });
  }) as typeof fetch;
  return { calls, fake, sleep: async () => {} };
}

describe('checkGoogleSignin', () => {
  it('passes when login redirects to Google asking to read calendars and events', async () => {
    const s = setup([google(READ)]);
    const r = await checkGoogleSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r).toEqual({ ok: true, message: 'Sign-in helper OK' });
    expect(s.calls[0]).toEqual({ url: `${URL_}/api/auth/login?provider=google`, redirect: 'manual' });
  });

  it('fails when the first sign-in already asks for edit access or Drive', async () => {
    for (const extra of ['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/drive.file']) {
      const r = await checkGoogleSignin({ url: URL_, fetch: setup([google([...READ, extra])]).fake, sleep: async () => {} });
      expect(r.ok).toBe(false);
      expect(r.message).toContain(extra);
    }
  });

  it('fails when a read scope is missing, naming it', async () => {
    const r = await checkGoogleSignin({ url: URL_, fetch: setup([google([READ[0]!])]).fake, sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(READ[1]);
  });

  it('fails on no redirect or another provider, after retrying', async () => {
    const s = setup([500]);
    const r = await checkGoogleSignin({ url: URL_, fetch: s.fake, sleep: s.sleep, attempts: 3 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/does not redirect/);
    expect(s.calls).toHaveLength(3);
    const ms = await checkGoogleSignin({ url: URL_, fetch: setup(['https://login.microsoftonline.com/x']).fake, sleep: async () => {}, attempts: 1 });
    expect(ms.message).toMatch(/not to Google/);
  });

  it('passes once a fresh deploy serves the new helper', async () => {
    const s = setup([500, google(READ)]);
    expect((await checkGoogleSignin({ url: URL_, fetch: s.fake, sleep: s.sleep })).ok).toBe(true);
  });
});
