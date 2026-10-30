#!/usr/bin/env node
// Deploys from this computer while GitHub Actions is off (doc/plans/local-deploys.md; back on at roadmap 4.3).
//   pnpm ship                          what CI did on main: checks, then the one app to staging, the demo and the site
//   pnpm promote [commit | tag] [--yes]  what promote.yml did for omark: staging's build to production, then a release
// Both build main's commits in a git worktree outside the repository (~/.omark-deploy/<sha>, or OMARK_DEPLOY_DIR),
// so the working copy never ships, and Promote deploys the very build and functions staging ran. Names and hosts
// come from the repository variables (gh variable list); Cloudflare from this computer's wrangler sign-in.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDemo } from './check-demo.mjs';
import { checkOmarkSignin } from './check-omark-signin.mjs';

export class Refused extends Error {}

const NEED = {
  ship: ['CF_APP_STAGING_PROJECT', 'APP_PROD_HOST', 'APP_STAGING_HOST', 'APP_STAGING_URL', 'CF_DEMO_PROJECT', 'DEMO_URL', 'CF_SITE_PROJECT', 'SITE_URL'],
  promote: ['CF_APP_PROJECT', 'APP_PROD_HOST', 'APP_PROD_URL', 'APP_STAGING_URL'],
};

/**
 * @param {Record<string, string>} vars the repository variables
 * @param {'ship' | 'promote'} kind
 */
export function checkVars(vars, kind) {
  const missing = NEED[kind].filter((name) => !vars[name]);
  if (missing.length) throw new Refused(`Set the repository variables ${missing.join(', ')} (doc/self-hosting.md, GitHub Actions).`);
  if (kind === 'promote' && vars.APP_PROD_URL !== `https://${vars.APP_PROD_HOST}`) {
    throw new Refused('APP_PROD_URL must be https:// followed by APP_PROD_HOST.');
  }
}

/**
 * The one app's build, the same for staging and production: it picks its environment from the host name.
 * @param {Record<string, string>} vars
 * @param {{ sha: string, number: number, builtAt: string }} build
 */
export function appBuildEnv(vars, { sha, number, builtAt }) {
  return {
    BUILD_SHA: sha,
    BUILD_NUMBER: String(number),
    BUILD_TIME: builtAt,
    VITE_PROD_HOST: vars.APP_PROD_HOST ?? '',
    VITE_STAGING_HOST: vars.APP_STAGING_HOST ?? '',
    VITE_PREVIEW_HOST_SUFFIXES: vars.APP_PREVIEW_HOST_SUFFIXES ?? '',
  };
}

/**
 * @param {Record<string, string>} vars
 * @param {{ sha: string, number: number }} build
 */
export function demoBuildEnv(vars, { sha, number }) {
  return { BUILD_SHA: sha, BUILD_NUMBER: String(number), VITE_STORAGE: 'demo', VITE_REAL_USE_URL: vars.REAL_USE_URL ?? '' };
}

/**
 * Which commit Promote deploys, and whether it must be built again. As promote.yml: no commit means what staging
 * runs now; a commit must be one staging ran (shipped from this computer); an omark-prod- tag rolls back.
 * @param {{ arg: string, stagingBuild: string | null, kept: { sha: string }[], resolve: (ref: string) => string | null,
 *   onMain: (sha: string) => boolean }} opts stagingBuild: the short commit in staging's version.json
 * @returns {{ sha: string, rebuild: boolean }}
 */
export function choosePromote({ arg, stagingBuild, kept, resolve, onMain }) {
  let sha;
  if (arg === '') {
    if (!stagingBuild) throw new Refused("Staging's version.json could not be read; name the commit to promote.");
    sha = kept.find((k) => k.sha.startsWith(stagingBuild))?.sha;
    if (!sha) throw new Refused(`staging runs ${stagingBuild}, which pnpm ship did not deploy from this computer. Run pnpm ship, then promote.`);
  } else {
    sha = resolve(arg) ?? undefined;
    if (!sha) throw new Refused(`${arg} is not a commit or tag here (git fetch?).`);
  }
  const short = sha.slice(0, 7);
  if (!onMain(sha)) throw new Refused(`${short} is not on main.`);
  if (kept.some((k) => k.sha === sha)) return { sha, rebuild: false };
  if (/^omark-prod-/.test(arg)) return { sha, rebuild: true };
  throw new Refused(`staging never ran ${short} (pnpm ship deploys staging). Promote what staging runs now, or an omark-prod- tag to roll back.`);
}

/**
 * The site is live: its privacy policy has Google's Limited Use text and it sends its CSP header (as CI checked).
 * @param {{ url: string, fetch?: typeof fetch, attempts?: number, waitMs?: number, sleep?: (ms: number) => Promise<void> }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function checkSite({
  url,
  fetch: f = fetch,
  attempts = 5,
  waitMs = 10_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const base = url.replace(/\/+$/, '');
  let message = '';
  for (let i = 1; i <= attempts; i++) {
    message = await probe();
    if (message === '') return { ok: true, message: 'The site is live.' };
    // The custom domain can take a moment to serve a new deploy.
    if (i < attempts) await sleep(waitMs);
  }
  return { ok: false, message };

  async function probe() {
    try {
      const privacy = await f(`${base}/privacy/`);
      if (!privacy.ok || !(await privacy.text()).includes('Limited Use')) return `${base}/privacy/ has no Limited Use text.`;
      const home = await f(`${base}/`);
      if (!home.headers.get('content-security-policy')) return `${base}/ sends no Content-Security-Policy header.`;
      return '';
    } catch (e) {
      return `${base} could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    }
  }
}

/**
 * The kept builds to remove: all but the newest `keep`.
 * @param {{ sha: string, builtAt: string }[]} records
 * @param {number} keep
 */
export function toPrune(records, keep) {
  return [...records]
    .sort((a, b) => b.builtAt.localeCompare(a.builtAt))
    .slice(keep)
    .map((r) => r.sha);
}

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const DIR = process.env.OMARK_DEPLOY_DIR || join(homedir(), '.omark-deploy');
const KEEP = 5;

/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd = REPO) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Runs a command where its output shows; pnpm is a .cmd on Windows, so through the shell there. */
function run(/** @type {string} */ cmd, /** @type {string[]} */ args, /** @type {{ cwd: string, env?: Record<string, string> }} */ { cwd, env = {} }) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status}).`);
}

/** @returns {Record<string, string>} */
function readVars() {
  const list = JSON.parse(execFileSync('gh', ['variable', 'list', '--json', 'name,value'], { cwd: REPO, encoding: 'utf8' }));
  return Object.fromEntries(list.map((/** @type {{ name: string, value: string }} */ v) => [v.name, v.value]));
}

/** @returns {{ sha: string, number: number, builtAt: string }[]} */
function readRecords() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => /^[0-9a-f]{40}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));
}

/** A worktree of the commit with its dependencies installed. */
function worktree(/** @type {string} */ sha) {
  const dir = join(DIR, sha);
  if (!existsSync(dir)) {
    mkdirSync(DIR, { recursive: true });
    git(['worktree', 'add', '--detach', dir, sha]);
  }
  if (!existsSync(join(dir, 'node_modules'))) run('pnpm', ['install', '--frozen-lockfile'], { cwd: dir });
  return dir;
}

/** @param {string} sha */
function wrangler(sha, /** @type {string} */ cwd, /** @type {string} */ dist, /** @type {string} */ project) {
  run('pnpm', ['exec', 'wrangler', 'pages', 'deploy', dist, `--project-name=${project}`, '--branch=main', `--commit-hash=${sha}`], { cwd });
}

/** @param {{ ok: boolean, message: string }} result */
function report({ ok, message }) {
  if (!ok) throw new Error(message);
  console.log(`OK: ${message}`);
}

const buildTime = () => `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

async function ship() {
  git(['fetch', 'origin', 'main', '--tags']);
  const sha = git(['rev-parse', 'origin/main']);
  const vars = readVars();
  checkVars(vars, 'ship');
  const { CF_APP_STAGING_PROJECT = '', APP_STAGING_URL = '', APP_MSAL_TENANT = '', CF_DEMO_PROJECT = '', DEMO_URL = '', CF_SITE_PROJECT = '', SITE_URL = '' } = vars;
  console.log(`Shipping ${sha.slice(0, 7)} ${git(['log', '-1', '--format=%s', sha])}`);
  const wt = worktree(sha);
  run('pnpm', ['typecheck'], { cwd: wt });
  run('pnpm', ['test'], { cwd: wt });

  const number = Number(git(['rev-list', '--count', sha]));
  const builtAt = buildTime();
  const app = join(wt, 'apps', 'omark');
  run('pnpm', ['--filter', 'omark', 'build'], { cwd: wt, env: appBuildEnv(vars, { sha, number, builtAt }) });
  // From apps/omark, so wrangler bundles its functions/ (the sign-in helper at /api/auth/*).
  wrangler(sha, app, 'dist', CF_APP_STAGING_PROJECT);
  report(await checkOmarkSignin({ url: APP_STAGING_URL, tenant: APP_MSAL_TENANT || 'consumers' }));
  writeFileSync(join(DIR, `${sha}.json`), `${JSON.stringify({ sha, number, builtAt }, null, 2)}\n`);

  // The demo builds beside dist (which Promote ships) and deploys from inside its build, so no functions/ go with it.
  run('pnpm', ['--filter', 'omark', 'exec', 'vite', 'build', '--outDir', 'dist-demo', '--emptyOutDir'], { cwd: wt, env: demoBuildEnv(vars, { sha, number }) });
  wrangler(sha, join(app, 'dist-demo'), '.', CF_DEMO_PROJECT);
  report(await checkDemo({ url: DEMO_URL }));

  run('pnpm', ['--filter', 'site', 'build'], { cwd: wt });
  wrangler(sha, join(wt, 'apps', 'site'), 'dist', CF_SITE_PROJECT);
  report(await checkSite({ url: SITE_URL }));

  for (const old of toPrune(readRecords(), KEEP)) {
    git(['worktree', 'remove', '--force', join(DIR, old)]);
    rmSync(join(DIR, `${old}.json`), { force: true });
  }
  console.log(`\nShipped ${sha.slice(0, 7)} (build ${number}) to ${APP_STAGING_URL}, ${DEMO_URL} and ${SITE_URL}.`);
}

/** @param {string} arg @param {boolean} yes */
async function promote(arg, yes) {
  git(['fetch', 'origin', 'main', '--tags']);
  const vars = readVars();
  checkVars(vars, 'promote');
  const { CF_APP_PROJECT = '', APP_PROD_URL = '', APP_STAGING_URL = '', APP_MSAL_TENANT = '' } = vars;
  const stagingBuild = await fetch(`${APP_STAGING_URL.replace(/\/+$/, '')}/version.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => (typeof body?.build === 'string' ? body.build : null))
    .catch(() => null);
  const kept = readRecords();
  const { sha, rebuild } = choosePromote({
    arg,
    stagingBuild,
    kept,
    resolve: (ref) => {
      try {
        return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      } catch {
        return null;
      }
    },
    onMain: (c) => spawnSync('git', ['merge-base', '--is-ancestor', c, 'origin/main'], { cwd: REPO }).status === 0,
  });

  console.log(`Promote ${sha.slice(0, 7)} ${git(['log', '-1', '--format=%s', sha])}`);
  console.log(`to ${APP_PROD_URL}${rebuild ? ', rebuilt (its staging build is gone)' : ", the build staging ran"}.`);
  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Type yes to deploy to production: ');
    rl.close();
    if (answer.trim() !== 'yes') throw new Refused('Not promoted.');
  }

  const wt = worktree(sha);
  const app = join(wt, 'apps', 'omark');
  if (rebuild) {
    const number = Number(git(['rev-list', '--count', sha]));
    run('pnpm', ['--filter', 'omark', 'build'], { cwd: wt, env: appBuildEnv(vars, { sha, number, builtAt: buildTime() }) });
  } else if (!existsSync(join(app, 'dist', 'version.json'))) {
    throw new Refused(`The kept build of ${sha.slice(0, 7)} is gone (${join(app, 'dist')}); run pnpm ship again.`);
  }
  // From the commit's own apps/omark, so its functions/ ship with the build.
  wrangler(sha, app, 'dist', CF_APP_PROJECT);
  report(await checkOmarkSignin({ url: APP_PROD_URL, tenant: APP_MSAL_TENANT || 'consumers' }));

  const output = join(tmpdir(), `omark-promote-${process.pid}.txt`);
  run('node', [join(REPO, 'tools', 'ci', 'release-notes.mjs'), sha, 'omark'], { cwd: wt, env: { GITHUB_OUTPUT: output } });
  const tag = readFileSync(output, 'utf8').match(/^tag=(.+)$/m)?.[1];
  rmSync(output, { force: true });
  if (!tag) throw new Error('release-notes.mjs gave no tag.');
  run('gh', ['release', 'create', tag, '--target', sha, '--title', tag, '--notes-file', 'release-notes.md'], { cwd: wt });
  rmSync(join(wt, 'release-notes.md'), { force: true });
  console.log(`\nPromoted ${sha.slice(0, 7)} to ${APP_PROD_URL} as ${tag}.`);
}

async function main() {
  const [command = '', ...rest] = process.argv.slice(2);
  try {
    if (command === 'ship') await ship();
    else if (command === 'promote') await promote(rest.find((a) => !a.startsWith('--')) ?? '', rest.includes('--yes'));
    else {
      console.log('usage: local-deploy.mjs ship | promote [commit | omark-prod- tag] [--yes]');
      return 1;
    }
    return 0;
  } catch (e) {
    console.log(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
