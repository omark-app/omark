#!/usr/bin/env node
// Checks that a deployed site's sign-in helper is live and set up the way the build expects: /api/auth/login
// must redirect to Microsoft for the right tenant, asking for the right OneDrive scope. A helper that grants
// another scope than the app expects would make every read fail with 403, so this fails the deploy first.
// Run by CI with SIGNIN_URL, MSAL_TENANT and ONEDRIVE_SCOPE (CI fills them from the repository variables TASKS_STAGING_URL, TASKS_MSAL_TENANT and TASKS_ONEDRIVE_SCOPE).

const APP_FOLDER = 'Files.ReadWrite.AppFolder';
const FULL = 'Files.ReadWrite';

/**
 * @param {{ url: string, tenant?: string, scope?: 'appfolder' | 'full', fetch?: typeof fetch, attempts?: number,
 *   waitMs?: number, sleep?: (ms: number) => Promise<void> }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkSignin({
  url,
  tenant = 'consumers',
  scope = 'appfolder',
  fetch: f = fetch,
  attempts = 6,
  waitMs = 10_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const login = `${url.replace(/\/+$/, '')}/api/auth/login`;
  const want = scope === 'full' ? 'full (Files.ReadWrite)' : `appfolder (${APP_FOLDER})`;
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
    if (!location) return `${login} does not redirect (status ${res.status}); check the Pages secrets (README, Sign-in).`;
    if (!location.startsWith(`https://login.microsoftonline.com/${tenant}/`)) {
      return `${login} redirects to ${location.split('?')[0]}, not to the ${tenant} tenant; check MSAL_TENANT on the Pages project.`;
    }
    const words = (new URL(location).searchParams.get('scope') ?? '').split(/\s+/);
    const grantsAppFolder = words.includes(APP_FOLDER);
    const ok = scope === 'full' ? words.includes(FULL) && !grantsAppFolder : grantsAppFolder;
    if (ok) return '';
    const got = grantsAppFolder ? `appfolder (${APP_FOLDER})` : words.includes(FULL) ? `full (${FULL})` : 'neither';
    return `The helper grants ${got} but the build expects ${want}; set ONEDRIVE_SCOPE on the Pages project to match.`;
  }
}

async function main() {
  const url = process.env.SIGNIN_URL;
  if (!url) {
    console.log('::error::SIGNIN_URL must be set.');
    return 1;
  }
  const scope = process.env.ONEDRIVE_SCOPE === 'full' ? 'full' : 'appfolder';
  const { ok, message } = await checkSignin({ url, tenant: process.env.MSAL_TENANT || 'consumers', scope });
  console.log(ok ? message : `::error::${message}`);
  return ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
