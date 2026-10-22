import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FILES = ['ci.yml', 'promote.yml'];
const path = (f: string) => new URL(`../../../.github/workflows/${f}`, import.meta.url);
const text = (f: string) => readFileSync(path(f), 'utf8');

interface Step { uses?: string; with?: unknown; env?: unknown; run?: string }
interface Job { if?: string; permissions?: Record<string, string>; steps?: Step[] }
const runsOnPr = (f: string) => 'pull_request' in ((parse(text(f)) as { on: object }).on ?? {});
const jobsOf = (f: string): [string, Job][] => Object.entries((parse(text(f)) as { jobs: Record<string, Job> }).jobs);
const allSteps = () => FILES.flatMap((f) => jobsOf(f).flatMap(([, j]) => j.steps ?? []));

interface Workflow { on?: object; jobs: Record<string, Job> }
const FORK_GUARD = 'github.event.pull_request.head.repo.full_name == github.repository';
/** A job that runs only for a push to main or a manual run on main, never for a pull request. */
const MAIN_ONLY = "(github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main' &&";

/** The problems that would let a fork's pull request reach a secret. Empty means none. */
function forkProblems(wf: Workflow): string[] {
  const problems: string[] = [];
  const onPr = 'pull_request' in (wf.on ?? {});
  for (const [name, job] of Object.entries(wf.jobs)) {
    const cond = job.if ?? '';
    const usesSecrets = JSON.stringify(job).includes('secrets.');
    // Push-only: the condition starts with the push test (or the main-only test) and has no further `||`
    // that could widen it.
    const pushOnly =
      (cond.startsWith("github.event_name == 'push' &&") && !cond.includes('||')) ||
      (cond.startsWith(MAIN_ONLY) && !cond.slice(MAIN_ONLY.length).includes('||'));
    if (usesSecrets && !cond.includes("vars.DEPLOY_ENABLED == 'true'")) problems.push(`${name}: secrets without DEPLOY_ENABLED`);
    if (onPr && !pushOnly && (usesSecrets || cond !== '') && !cond.includes(FORK_GUARD)) {
      problems.push(`${name}: no fork guard`);
    }
  }
  return problems;
}

describe('workflows', () => {
  it('gives every deployed build the CI run number; a Promote rebuild gets the promoted run’s', () => {
    const builds = (f: string) =>
      jobsOf(f).flatMap(([name, j]) => (j.steps ?? []).filter((s) => s.run === 'pnpm --filter web build').map((s) => ({ name, env: (s.env ?? {}) as Record<string, string> })));
    const ci = builds('ci.yml');
    expect(ci.map((b) => b.name).sort()).toEqual(['deploy-staging', 'preview']);
    for (const b of ci) expect(b.env.BUILD_NUMBER, b.name).toBe('${{ github.run_number }}');
    const promote = builds('promote.yml');
    expect(promote).toHaveLength(1);
    expect(promote[0]!.env.BUILD_NUMBER).toBe('${{ steps.check.outputs.run_number }}');
    // The date in the label is the original build's, not the rebuild's.
    expect(promote[0]!.env.BUILD_TIME).toBe('${{ steps.check.outputs.built_at }}');
  });

  it('runs no secret-using step for forks', () => {
    for (const f of FILES) expect(forkProblems(parse(text(f)) as Workflow), f).toEqual([]);
  });

  it('lets CI be started by hand, deploying staging only from main', () => {
    expect('workflow_dispatch' in ((parse(text('ci.yml')) as { on: object }).on ?? {})).toBe(true);
    const deploy = jobsOf('ci.yml').find(([n]) => n === 'deploy-staging')![1];
    expect(deploy.if!.startsWith(MAIN_ONLY)).toBe(true);
  });

  it('the fork check does not take a widened main-only condition as safe', () => {
    const bad: Workflow = {
      on: { pull_request: {} },
      jobs: { wide: { if: `${MAIN_ONLY} vars.DEPLOY_ENABLED == 'true' || true`, steps: [{ env: { T: '${{ secrets.X }}' } }] } },
    };
    expect(forkProblems(bad)).toEqual(['wide: no fork guard']);
  });

  it('the fork check catches an unguarded job-level secret', () => {
    const bad: Workflow = {
      on: { pull_request: {} },
      jobs: { sneaky: { steps: [{ run: 'echo hi' }], ...({ env: { T: '${{ secrets.X }}' } } as object) } },
    };
    expect(forkProblems(bad)).toEqual(['sneaky: secrets without DEPLOY_ENABLED', 'sneaky: no fork guard']);
  });

  it('checks the host variables before a deploy', () => {
    const first = (f: string, job: string) => JSON.stringify(jobsOf(f).find(([n]) => n === job)![1].steps![0]);
    expect(first('promote.yml', 'promote')).toMatch(/PROD_HOST.*PROD_URL|PROD_URL.*PROD_HOST/);
    expect(first('ci.yml', 'deploy-staging')).toMatch(/STAGING_HOST.*STAGING_URL|STAGING_URL.*STAGING_HOST/);
  });

  it('gives the e2e job no write permission', () => {
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.permissions).toEqual({ contents: 'read' });
  });

  it('never uses pull_request_target', () => {
    for (const f of FILES) expect(text(f)).not.toContain('pull_request_target');
  });

  it('pins third-party actions to a commit', () => {
    const uses = allSteps().flatMap((s) => (s.uses ? [s.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      if (u.startsWith('actions/')) continue;
      expect(u, u).toMatch(u.startsWith('docker://') ? /@sha256:[0-9a-f]{64}$/ : /@[0-9a-f]{40}$/);
    }
  });

  it('names no project, host or folder', () => {
    for (const f of FILES) {
      expect(text(f)).not.toMatch(/--project-name=(?!\$\{\{ vars\.)/);
      expect(text(f)).not.toMatch(/alipka|ALAI/i);
    }
  });
});
