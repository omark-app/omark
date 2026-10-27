#!/usr/bin/env node
// Checks that the demo is live and has no sign-in helper: `/` must be the app's HTML page, and /api/auth/login
// must not be answered by the helper (a redirect or JSON). Pages answers an unknown path with 404 or, having no
// 404.html, with the app's page; both are fine. The helper would mean functions/ was deployed with the demo.
// Run by CI with DEMO_URL (each demo job fills it from its app's repository variable: TASKS_DEMO_URL, TIME_DEMO_URL).

import { pathToFileURL } from 'node:url';

/**
 * @param {{ url: string, fetch?: typeof fetch, attempts?: number, waitMs?: number, timeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void> }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkDemo({
  url,
  fetch: f = fetch,
  attempts = 6,
  waitMs = 10_000,
  timeoutMs = 15_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const base = url.replace(/\/+$/, '');
  const home = `${base}/`;
  const login = `${base}/api/auth/login`;
  let message = '';
  for (let i = 1; i <= attempts; i++) {
    message = await probe();
    if (message === '') return { ok: true, message: 'Demo OK' };
    // A fresh deploy can take seconds to reach the custom domain, so a wrong answer is retried too.
    if (i < attempts) await sleep(waitMs);
  }
  return { ok: false, message };

  /** @param {Response} res */
  function answer(res) {
    return [res.status, res.headers.get('content-type')].filter(Boolean).join(' ');
  }

  /** @returns {Promise<string>} empty when both answers are right, else what is wrong */
  async function probe() {
    // Each request gets its own time limit; one that runs out is a failed attempt like any other.
    const get = (/** @type {string} */ u) => f(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    let res;
    try {
      res = await get(home);
      const type = res.headers.get('content-type') ?? '';
      if (res.status !== 200 || !type.startsWith('text/html')) return `${home} answers ${answer(res)}, not the app's page.`;
      res = await get(login);
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') return `${base} did not answer within ${timeoutMs / 1000} s.`;
      return `${base} could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    }
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 404 && !type.includes('json')) return '';
    if (res.status === 200 && type.startsWith('text/html')) return '';
    return `${login} answers ${answer(res)}: the sign-in helper is live on the demo. Deploy from the app's folder (apps/tasks, apps/time) so functions/ is left out.`;
  }
}

async function main() {
  const url = process.env.DEMO_URL;
  if (!url) {
    console.log('::error::DEMO_URL must be set.');
    return 1;
  }
  const { ok, message } = await checkDemo({ url });
  console.log(ok ? message : `::error::${message}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
