#!/usr/bin/env node
// Promote to production, step 1: resolve the commit to promote and refuse anything that isn't on main with
// a passing CI run (doc/factory.md, Environments and CI). Usage: promote-check.mjs <sha | short sha | tag> <app>;
// an empty commit means the one staging runs now. The tag is <app>-prod-…, or for tasks also a prod-… tag from
// before the monorepo move. Needs GITHUB_TOKEN and GITHUB_REPOSITORY; writes sha, run_id, run_number,
// built_at, artifact (true when that run's build can still be downloaded), artifact_name, app_dir and filter
// to $GITHUB_OUTPUT. A commit from before the move has apps/web, the package `web` and the build `web-dist`,
// so a rollback to it still deploys.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tagPatterns } from './release-notes.mjs';

/** The commit may not be promoted; the message says why. */
export class Refused extends Error {}

/**
 * @param {{ repo: string, token: string, input: string, app: string, fetch?: typeof fetch }} opts
 * @returns {Promise<{ sha: string, runId: number, runNumber: number, builtAt: string, artifact: boolean,
 *   artifactName: string, appDir: string, filter: string }>}
 */
export async function promoteCheck({ repo, token, input, app, fetch: f = fetch }) {
  /** @param {string} path */
  const get = async (path) => {
    const res = await f(`https://api.github.com/repos/${repo}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    return { status: res.status, ok: res.ok, data: /** @type {any} */ (await res.json().catch(() => ({}))) };
  };
  const runsOnMain = '/actions/workflows/ci.yml/runs?branch=main&per_page=50';
  /**
   * Only runs of main itself count: a push, or CI started by hand. A fork's pull request from a branch it
   * named `main` also matches `branch=main`, so the event is checked here.
   * @param {any} res
   * @returns {any[]}
   */
  const ofMain = (res) =>
    (res.data.workflow_runs ?? []).filter((/** @type {any} */ r) => r.event === 'push' || r.event === 'workflow_dispatch');
  // Only tasks existed before the move, so only it falls back to the old names.
  const legacy = app === 'tasks';

  const ref = input.trim();
  /** @type {string} */
  let sha;
  if (ref === '') {
    const run = ofMain(await get(`${runsOnMain}&status=success`))[0];
    if (!run) throw new Refused('No successful CI run on main yet, so there is nothing on staging to promote.');
    sha = run.head_sha;
  } else {
    const commit = await get(`/commits/${encodeURIComponent(ref)}`);
    if (!commit.ok) {
      const tags = tagPatterns(app).map((p) => p.replace('*', '…')).join(' or ');
      throw new Refused(`"${ref}" was not found: give a commit SHA from main or a ${tags} tag.`);
    }
    sha = commit.data.sha;
  }
  const short = sha.slice(0, 7);

  const compare = await get(`/compare/${sha}...main`);
  if (!compare.ok || !['ahead', 'identical'].includes(compare.data.status)) {
    throw new Refused(`${short} is not on main; only commits merged to main can go to production.`);
  }

  // Where the app lives in that commit: apps/<app>, or apps/web (package `web`) before the move.
  const contents = await get(`/contents/apps/${encodeURIComponent(app)}?ref=${sha}`);
  /** @type {{ appDir: string, filter: string }} */
  let layout;
  if (contents.ok) layout = { appDir: `apps/${app}`, filter: app };
  else if (contents.status === 404 && legacy) layout = { appDir: 'apps/web', filter: 'web' };
  else if (contents.status === 404) throw new Refused(`${short} has no apps/${app}; promote a commit that has the app.`);
  else throw new Refused(`Could not read apps/${app} in ${short} (status ${contents.status}); try again.`);

  const runs = ofMain(await get(`${runsOnMain}&head_sha=${sha}`));
  const passed = runs.find((/** @type {any} */ r) => r.conclusion === 'success');
  if (!passed) {
    const latest = runs[0];
    if (!latest) throw new Refused(`${short} has no CI run on main (a doc-only merge?); promote a commit that has one.`);
    if (latest.status !== 'completed') throw new Refused(`CI for ${short} is still running; try again when it has passed.`);
    throw new Refused(`CI for ${short} did not pass (${latest.conclusion}).`);
  }

  // The build staging ran: <app>-dist, or web-dist before the move.
  const artifacts = (await get(`/actions/runs/${passed.id}/artifacts`)).data.artifacts ?? [];
  const live = new Set(artifacts.filter((/** @type {any} */ a) => !a.expired).map((/** @type {any} */ a) => a.name));
  const names = legacy ? [`${app}-dist`, 'web-dist'] : [`${app}-dist`];
  // A run that never made the build (its staging job skipped, or older than the app's deploy) never put this
  // commit on staging, so it isn't promoted. Tasks' oldest runs predate its artifacts, so it is exempt.
  if (!legacy && !artifacts.some((/** @type {any} */ a) => a.name === `${app}-dist`)) {
    throw new Refused(`CI for ${short} has no ${app}-dist build, so staging never ran it; promote a commit staging deployed.`);
  }
  const found = names.find((n) => live.has(n));
  const artifactName = found ?? (layout.appDir === 'apps/web' ? 'web-dist' : `${app}-dist`);
  // When the run started, in the footer's `YYYY-MM-DD HH:MM UTC` form: a rebuild keeps the original build's date.
  const builtAt = `${String(passed.run_started_at ?? passed.created_at).slice(0, 16).replace('T', ' ')} UTC`;
  return { sha, runId: passed.id, runNumber: passed.run_number, builtAt, artifact: found !== undefined, artifactName, ...layout };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const [input = '', app = ''] = process.argv.slice(2);
  if (!token || !repo) {
    console.log('::error::GITHUB_TOKEN and GITHUB_REPOSITORY must be set.');
    return 1;
  }
  if (!/^[a-z][a-z0-9-]*$/.test(app)) {
    console.log('::error::usage: promote-check.mjs <commit or tag> <app>');
    return 1;
  }
  try {
    const r = await promoteCheck({ repo, token, input, app });
    const build = r.artifact ? `using its ${r.artifactName} build` : 'build expired, rebuilding';
    console.log(`Promoting ${app} at ${r.sha} from ${r.appDir} (CI run ${r.runId}, v${r.runNumber}, ${build})`);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `sha=${r.sha}\nrun_id=${r.runId}\nrun_number=${r.runNumber}\nbuilt_at=${r.builtAt}\nartifact=${r.artifact}\n` +
          `artifact_name=${r.artifactName}\napp_dir=${r.appDir}\nfilter=${r.filter}\n`,
      );
    }
    return 0;
  } catch (e) {
    console.log(`::error::${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
