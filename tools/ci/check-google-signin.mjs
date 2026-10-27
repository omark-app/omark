#!/usr/bin/env node
// Checks that a deployed Omark Time's sign-in helper is live and set up as the app expects: /api/auth/login
// must redirect to Google asking to read calendars and events, and for no more (edit access and Drive are
// added later, only when the user asks; Time spec 10.1). Run by CI with SIGNIN_URL (TIME_STAGING_URL).

const READ = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
];
const LATER = ['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/drive.file'];

/**
 * @param {{ url: string, fetch?: typeof fetch, attempts?: number, waitMs?: number, sleep?: (ms: number) => Promise<void> }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkGoogleSignin({
  url,
  fetch: f = fetch,
  attempts = 6,
  waitMs = 10_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const login = `${url.replace(/\/+$/, '')}/api/auth/login?provider=google`;
  let message = '';
  for (let i = 1; i <= attempts; i++) {
    message = await probe();
    if (message === '') return { ok: true, message: 'Sign-in helper OK' };
    // A fresh deploy can still serve the old helper, so a wrong answer is retried too.
    if (i < attempts) await sleep(waitMs);
  }
  return { ok: false, message };

  /** @returns {Promise<string>} empty when the answer is right, else what is wrong */
  async function probe() {
    let res;
    try {
      res = await f(login, { redirect: 'manual' });
    } catch (e) {
      return `${login} could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    }
    const location = res.headers.get('location') ?? '';
    if (!location) return `${login} does not redirect (status ${res.status}); check OMARK_APP and the Google Pages secrets.`;
    if (!location.startsWith('https://accounts.google.com/')) return `${login} redirects to ${location.split('?')[0]}, not to Google.`;
    const words = (new URL(location).searchParams.get('scope') ?? '').split(/\s+/);
    const missing = READ.filter((s) => !words.includes(s));
    if (missing.length > 0) return `The sign-in does not ask for ${missing.join(' ')}.`;
    const extra = LATER.filter((s) => words.includes(s));
    if (extra.length > 0) return `The first sign-in asks for ${extra.join(' ')}, which the app adds only when the user asks.`;
    return '';
  }
}

async function main() {
  const url = process.env.SIGNIN_URL;
  if (!url) {
    console.log('::error::SIGNIN_URL must be set.');
    return 1;
  }
  const { ok, message } = await checkGoogleSignin({ url });
  console.log(ok ? message : `::error::${message}`);
  return ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
