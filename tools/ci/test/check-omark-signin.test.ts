import { describe, expect, it } from 'vitest';
import { checkOmarkSignin } from '../check-omark-signin.mjs';

const URL_ = 'https://app.example.test';
const G = 'https://www.googleapis.com/auth/';
const DRIVE = `${G}drive.file`;
const READ = [`${G}calendar.calendarlist.readonly`, `${G}calendar.events.owned.readonly`];
const EDIT = `${G}calendar.events.owned`;
const microsoft = (tenant = 'consumers', scope = 'Files.ReadWrite.AppFolder') =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=x&scope=${encodeURIComponent(`openid profile ${scope} offline_access`)}`;
const google = (scopes: string[]) =>
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=x&scope=${encodeURIComponent(['openid', 'email', ...scopes].join(' '))}`;

/** Answers by provider: a Location for a 302, or a bare status. A list gives one answer per call, the last repeating. */
function setup(answers: Record<string, string | number | (string | number)[]>) {
  const calls: { url: string; redirect?: string }[] = [];
  const count: Record<string, number> = {};
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), redirect: init?.redirect });
    const provider = new URL(String(input)).searchParams.get('provider') ?? 'microsoft';
    const list = [answers[provider] ?? 404].flat();
    const n = (count[provider] = (count[provider] ?? 0) + 1);
    const a = list[Math.min(n - 1, list.length - 1)]!;
    return typeof a === 'number' ? new Response('', { status: a }) : new Response(null, { status: 302, headers: { Location: a } });
  }) as typeof fetch;
  return { calls, fake, sleep: async () => {} };
}

const GOOD = { microsoft: microsoft(), google: google([DRIVE]), googlecal: google(READ) };

describe('checkOmarkSignin', () => {
  it('passes when Microsoft asks for the app folder, Google for Drive files and googlecal for reading calendars', async () => {
    const s = setup(GOOD);
    const r = await checkOmarkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r).toEqual({ ok: true, message: 'Sign-in helper OK' });
    expect(s.calls).toEqual([
      { url: `${URL_}/api/auth/login`, redirect: 'manual' },
      { url: `${URL_}/api/auth/login?provider=google`, redirect: 'manual' },
      { url: `${URL_}/api/auth/login?provider=googlecal`, redirect: 'manual' },
    ]);
  });

  it('fails when Microsoft goes to another tenant or asks for the whole drive', async () => {
    const other = await checkOmarkSignin({ url: URL_, fetch: setup({ ...GOOD, microsoft: microsoft('common') }).fake, sleep: async () => {}, attempts: 1 });
    expect(other.ok).toBe(false);
    expect(other.message).toContain('consumers');
    const full = await checkOmarkSignin({ url: URL_, fetch: setup({ ...GOOD, microsoft: microsoft('consumers', 'Files.ReadWrite') }).fake, sleep: async () => {}, attempts: 1 });
    expect(full.ok).toBe(false);
    expect(full.message).toContain('Files.ReadWrite');
  });

  it('takes the tenant it is given', async () => {
    const r = await checkOmarkSignin({ url: URL_, tenant: 'organizations', fetch: setup({ ...GOOD, microsoft: microsoft('organizations') }).fake, sleep: async () => {} });
    expect(r.ok).toBe(true);
  });

  it('fails when the Google sign-in asks for the calendar, or lacks Drive', async () => {
    for (const scopes of [[DRIVE, ...READ], []]) {
      const r = await checkOmarkSignin({ url: URL_, fetch: setup({ ...GOOD, google: google(scopes) }).fake, sleep: async () => {}, attempts: 1 });
      expect(r.ok, scopes.join(' ')).toBe(false);
      expect(r.message).toContain('provider=google');
    }
  });

  it('fails when the calendar sign-in asks for Drive or edit access, or lacks a read scope', async () => {
    for (const scopes of [[...READ, DRIVE], [...READ, EDIT], [READ[0]!]]) {
      const r = await checkOmarkSignin({ url: URL_, fetch: setup({ ...GOOD, googlecal: google(scopes) }).fake, sleep: async () => {}, attempts: 1 });
      expect(r.ok, scopes.join(' ')).toBe(false);
      expect(r.message).toContain('provider=googlecal');
    }
  });

  it('fails when Google is not set up, naming the secrets', async () => {
    const r = await checkOmarkSignin({ url: URL_, fetch: setup({ ...GOOD, google: 500, googlecal: 500 }).fake, sleep: async () => {}, attempts: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/does not redirect.*GOOGLE_CLIENT_ID/);
  });

  it('retries while a fresh deploy still serves the old helper', async () => {
    const s = setup({ ...GOOD, microsoft: [500, microsoft()] });
    expect((await checkOmarkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep })).ok).toBe(true);
    const g = setup({ ...GOOD, googlecal: [500, 500, google(READ)] });
    expect((await checkOmarkSignin({ url: URL_, fetch: g.fake, sleep: g.sleep })).ok).toBe(true);
    const never = setup({ ...GOOD, google: 500 });
    expect((await checkOmarkSignin({ url: URL_, fetch: never.fake, sleep: never.sleep, attempts: 3 })).ok).toBe(false);
    expect(never.calls.filter((c) => c.url.endsWith('provider=google'))).toHaveLength(3);
  });
});
