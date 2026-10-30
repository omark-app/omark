#!/usr/bin/env node
// Checks that the one Omark app's sign-in helper is live and asks for what the app expects (one app spec,
// section 5): /api/auth/login goes to Microsoft for MSAL_TENANT with the app folder; ?provider=google to Google
// with Drive's own files and no calendar; ?provider=googlecal with the calendar read scopes and neither Drive
// nor edit access (both are added later, only when the user asks). The Google ones only when the helper offers
// Google (/api/auth/providers), as a copy without the Google secrets doesn't. Run by CI and Promote with SIGNIN_URL
// (APP_STAGING_URL or APP_PROD_URL) and MSAL_TENANT (APP_MSAL_TENANT, empty means consumers).

import { pathToFileURL } from 'node:url';
import { checkSignin } from './check-signin.mjs';

const G = 'https://www.googleapis.com/auth/';
const DRIVE = `${G}drive.file`;
const READ = [`${G}calendar.calendarlist.readonly`, `${G}calendar.events.owned.readonly`];
const EDIT = `${G}calendar.events.owned`;

/** Each Google sign-in: the scopes it must ask for and those it must not. */
const GOOGLE = [
  { provider: 'google', want: [DRIVE], never: [...READ, EDIT] },
  { provider: 'googlecal', want: READ, never: [DRIVE, EDIT] },
];

/**
 * @param {{ url: string, tenant?: string, fetch?: typeof fetch, attempts?: number, waitMs?: number,
 *   sleep?: (ms: number) => Promise<void> }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkOmarkSignin({
  url,
  tenant = 'consumers',
  fetch: f = fetch,
  attempts = 6,
  waitMs = 10_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const ms = await checkSignin({ url, tenant, fetch: f, attempts, waitMs, sleep });
  if (!ms.ok) return ms;
  const base = url.replace(/\/+$/, '');
  const live = await personalAccounts(`${base}/api/auth/login`);
  if (live !== '') return { ok: false, message: live };
  // Google is optional for a copy of Omark: only a helper with both Google secrets lists it, and only then is
  // it checked. If the list can't be read, it is checked anyway.
  const offered = await f(`${base}/api/auth/providers`)
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => (Array.isArray(body?.providers) ? body.providers : null))
    .catch(() => null);
  if (offered && !offered.includes('google')) {
    return { ok: true, message: 'Sign-in helper OK (Microsoft; no Google: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set)' };
  }
  for (const g of GOOGLE) {
    let message = '';
    for (let i = 1; i <= attempts; i++) {
      message = await probe(`${base}/api/auth/login?provider=${g.provider}`, g.want, g.never);
      if (message === '') break;
      // A fresh deploy can still serve the old helper, so a wrong answer is retried too.
      if (i < attempts) await sleep(waitMs);
    }
    if (message !== '') return { ok: false, message };
  }
  return { ok: true, message: 'Sign-in helper OK' };

  /**
   * @param {string} login
   * @param {string[]} want
   * @param {string[]} never
   * @returns {Promise<string>} empty when the answer is right, else what is wrong
   */
  async function probe(login, want, never) {
    let res;
    try {
      res = await f(login, { redirect: 'manual' });
    } catch (e) {
      return `${login} could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    }
    const location = res.headers.get('location') ?? '';
    if (!location) return `${login} does not redirect (status ${res.status}); check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Pages project.`;
    if (!location.startsWith('https://accounts.google.com/')) return `${login} redirects to ${location.split('?')[0]}, not to Google.`;
    const words = (new URL(location).searchParams.get('scope') ?? '').split(/\s+/);
    const missing = want.filter((s) => !words.includes(s));
    if (missing.length > 0) return `${login} does not ask for ${missing.join(' ')}.`;
    const extra = never.filter((s) => words.includes(s));
    if (extra.length > 0) return `${login} asks for ${extra.join(' ')}, which the app adds only when the user asks.`;
    // Google answers a client or redirect address it doesn't know with an error page before anyone signs in.
    try {
      const error = (await (await f(location)).text()).match(/Error 40\d[^<]*/)?.[0];
      if (error) return `${login}: Google shows "${error.trim()}"; check the client and its redirect URIs in Google Cloud.`;
    } catch (e) {
      return `Google's sign-in page could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    }
    return '';
  }

  /**
   * The consumers endpoint hands personal accounts to login.live.com, which refuses a client whose registration
   * doesn't allow them, before anyone signs in. Other tenants are left alone.
   * @param {string} login
   * @returns {Promise<string>} empty when the client is accepted, else what is wrong
   */
  async function personalAccounts(login) {
    if (tenant !== 'consumers') return '';
    try {
      const authorize = (await f(login, { redirect: 'manual' })).headers.get('location') ?? '';
      const live = (await f(authorize, { redirect: 'manual' })).headers.get('location') ?? '';
      if (!live.startsWith('https://login.live.com/')) return '';
      if (!(await (await f(live)).text()).includes('unauthorized_client')) return '';
      return "Microsoft won't let personal Microsoft accounts use the app's client (unauthorized_client): in Entra, set the registration's supported account types to include personal Microsoft accounts.";
    } catch (e) {
      return `Microsoft's sign-in page could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    }
  }
}

async function main() {
  const url = process.env.SIGNIN_URL;
  if (!url) {
    console.log('::error::SIGNIN_URL must be set.');
    return 1;
  }
  const { ok, message } = await checkOmarkSignin({ url, tenant: process.env.MSAL_TENANT || 'consumers' });
  console.log(ok ? message : `::error::${message}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
