#!/usr/bin/env node
// Promote to production, step 1: resolve the commit to promote and refuse anything that isn't on main with
// a passing CI run (doc/TaskApp factory spec.md, 6.2). Usage: promote-check.mjs [<sha | short sha | prod- tag>];
// empty means the commit staging runs now. Needs GITHUB_TOKEN and GITHUB_REPOSITORY; writes sha, run_id and
// artifact (true when that run's web-dist build can still be downloaded) to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs';

/** The commit may not be promoted; the message says why. */
export class Refused extends Error {}

/**
 * @param {{ repo: string, token: string, input: string, fetch?: typeof fetch }} opts
 * @returns {Promise<{ sha: string, runId: number, artifact: boolean }>}
 */
export async function promoteCheck({ repo, token, input, fetch: f = fetch }) {
  /** @param {string} path */
  const get = async (path) => {
    const res = await f(`https://api.github.com/repos/${repo}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    return { status: res.status, ok: res.ok, data: /** @type {any} */ (await res.json().catch(() => ({}))) };
  };
  const runsOnMain = '/actions/workflows/ci.yml/runs?event=push&branch=main';

  const ref = input.trim();
  /** @type {string} */
  let sha;
  if (ref === '') {
    const last = await get(`${runsOnMain}&status=success&per_page=1`);
    const run = last.data.workflow_runs?.[0];
    if (!run) throw new Refused('No successful CI run on main yet, so there is nothing on staging to promote.');
    sha = run.head_sha;
  } else {
    const commit = await get(`/commits/${encodeURIComponent(ref)}`);
    if (!commit.ok) throw new Refused(`"${ref}" was not found: give a commit SHA from main or a prod- tag.`);
    sha = commit.data.sha;
  }
  const short = sha.slice(0, 7);

  const compare = await get(`/compare/${sha}...main`);
  if (!compare.ok || !['ahead', 'identical'].includes(compare.data.status)) {
    throw new Refused(`${short} is not on main; only commits merged to main can go to production.`);
  }

  const runs = (await get(`${runsOnMain}&head_sha=${sha}`)).data.workflow_runs ?? [];
  const passed = runs.find((/** @type {any} */ r) => r.conclusion === 'success');
  if (!passed) {
    const latest = runs[0];
    if (!latest) throw new Refused(`${short} has no CI run on main (a doc-only merge?); promote a commit that has one.`);
    if (latest.status !== 'completed') throw new Refused(`CI for ${short} is still running; try again when it has passed.`);
    throw new Refused(`CI for ${short} did not pass (${latest.conclusion}).`);
  }

  const artifacts = (await get(`/actions/runs/${passed.id}/artifacts`)).data.artifacts ?? [];
  const artifact = artifacts.some((/** @type {any} */ a) => a.name === 'web-dist' && !a.expired);
  return { sha, runId: passed.id, artifact };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.log('::error::GITHUB_TOKEN and GITHUB_REPOSITORY must be set.');
    return 1;
  }
  try {
    const { sha, runId, artifact } = await promoteCheck({ repo, token, input: process.argv[2] ?? '' });
    console.log(`Promoting ${sha} (CI run ${runId}, ${artifact ? 'using its build' : 'build expired, rebuilding'})`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nrun_id=${runId}\nartifact=${artifact}\n`);
    return 0;
  } catch (e) {
    console.log(`::error::${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
