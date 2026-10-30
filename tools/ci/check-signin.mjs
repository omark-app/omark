// Checks that a deployed site's Microsoft sign-in is live and set up as the app expects: /api/auth/login must
// redirect to Microsoft for the right tenant, asking for OneDrive's app folder and not the whole drive. A helper
// that grants another scope would make every read fail with 403, so this fails the deploy first.
// check-omark-signin.mjs runs it for the one app.

const APP_FOLDER = 'Files.ReadWrite.AppFolder';
const FULL = 'Files.ReadWrite';

/**
 * @param {{ url: string, tenant?: string, fetch?: typeof fetch, attempts?: number, waitMs?: number,
 *   sleep?: (ms: number) => Promise<void> }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkSignin({
  url,
  tenant = 'consumers',
  fetch: f = fetch,
  attempts = 6,
  waitMs = 10_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const login = `${url.replace(/\/+$/, '')}/api/auth/login`;
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
    if (words.includes(FULL)) return `The helper asks for the whole drive (${FULL}); it must ask only for ${APP_FOLDER}.`;
    if (!words.includes(APP_FOLDER)) return `The helper does not ask for ${APP_FOLDER}.`;
    return '';
  }
}
