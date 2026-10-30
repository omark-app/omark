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

/** What Microsoft's personal-account sign-in and Google's sign-in page say about the client. */
const PAGES = { live: '<title>Sign in to your Microsoft account</title>', google: '<title>Sign in - Google Accounts</title>' };

/** Answers by provider: a Location for a 302, or a bare status. A list gives one answer per call, the last repeating. */
function setup(answers: Record<string, string | number | (string | number)[]>, providers = ['microsoft', 'google', 'googlecal'], pages = PAGES) {
  const calls: { url: string; redirect?: string }[] = [];
  const count: Record<string, number> = {};
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    // The providers' own pages: Microsoft's consumers endpoint hands personal accounts to login.live.com.
    if (url.host === 'login.microsoftonline.com') return new Response(null, { status: 302, headers: { Location: 'https://login.live.com/oauth20_authorize.srf?client_id=x' } });
    if (url.host === 'login.live.com') return new Response(pages.live);
    if (url.host === 'accounts.google.com') return new Response(pages.google);
    if (url.pathname.endsWith('/providers')) return Response.json({ providers });
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
      // Again, to follow it to Microsoft's personal-account sign-in.
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

  it('checks only Microsoft when the helper offers no Google (a copy without the Google secrets)', async () => {
    const s = setup({ microsoft: microsoft() }, ['microsoft']);
    const r = await checkOmarkSignin({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/no Google/);
    expect(s.calls.map((c) => c.url)).toEqual([`${URL_}/api/auth/login`, `${URL_}/api/auth/login`]);
  });

  it('fails when the helper lists Google but its sign-in is broken, naming the secrets', async () => {
    const r = await checkOmarkSignin({ url: URL_, fetch: setup({ ...GOOD, google: 500, googlecal: 500 }).fake, sleep: async () => {}, attempts: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/does not redirect.*GOOGLE_CLIENT_ID/);
  });

  it('fails when Microsoft does not let personal accounts use the client (Entra: supported account types)', async () => {
    const live = '<p>unauthorized_client: The client does not exist or is not enabled for consumers.</p>';
    const r = await checkOmarkSignin({ url: URL_, fetch: setup(GOOD, undefined, { ...PAGES, live }).fake, sleep: async () => {}, attempts: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/personal Microsoft accounts/);
  });

  it('fails when Google refuses the client or its redirect address', async () => {
    const google = '<title>Error 400: redirect_uri_mismatch</title>';
    const r = await checkOmarkSignin({ url: URL_, fetch: setup(GOOD, undefined, { ...PAGES, google }).fake, sleep: async () => {}, attempts: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/provider=google.*Error 400/);
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
