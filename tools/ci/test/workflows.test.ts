import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FILES = ['ci.yml', 'promote.yml'];
const path = (f: string) => new URL(`../../../.github/workflows/${f}`, import.meta.url);
const text = (f: string) => readFileSync(path(f), 'utf8');

interface Step { if?: string; uses?: string; with?: unknown; env?: unknown; run?: string; 'working-directory'?: string }
interface Job {
  if?: string;
  needs?: string[];
  permissions?: Record<string, string>;
  container?: { image?: string };
  strategy?: { matrix?: Record<string, unknown>; 'fail-fast'?: boolean };
  'timeout-minutes'?: number;
  steps?: Step[];
}
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
    // The site has no build number, so it is listed in the set of builds but left out of the BUILD_NUMBER check.
    const builds = (f: string, re = /^pnpm --filter .+ build$/) =>
      jobsOf(f).flatMap(([name, j]) =>
        (j.steps ?? []).filter((s) => re.test(s.run ?? '')).map((s) => ({ name, run: s.run, env: (s.env ?? {}) as Record<string, string> })),
      );
    const all = builds('ci.yml');
    expect(all.map((b) => b.name).sort()).toEqual(['site-preview', 'site-production', 'tasks-demo', 'tasks-preview', 'tasks-staging']);
    const ci = all.filter((b) => !b.name.startsWith('site-'));
    for (const b of all) expect(b.run, b.name).toBe(`pnpm --filter ${b.name.startsWith('site-') ? 'site' : 'tasks'} build`);
    for (const b of ci) expect(b.env.BUILD_NUMBER, b.name).toBe('${{ github.run_number }}');
    const promote = builds('promote.yml');
    expect(promote).toHaveLength(1);
    // The filter comes from the promoted commit: `web` before the monorepo move, so rollbacks still build.
    expect(promote[0]!.run).toBe('pnpm --filter ${{ steps.check.outputs.filter }} build');
    expect(promote[0]!.env.BUILD_NUMBER).toBe('${{ steps.check.outputs.run_number }}');
    // The date in the label is the original build's, not the rebuild's.
    expect(promote[0]!.env.BUILD_TIME).toBe('${{ steps.check.outputs.built_at }}');
  });

  it('runs no secret-using step for forks', () => {
    for (const f of FILES) expect(forkProblems(parse(text(f)) as Workflow), f).toEqual([]);
  });

  it('lets CI be started by hand, deploying staging and the demo only from main', () => {
    expect('workflow_dispatch' in ((parse(text('ci.yml')) as { on: object }).on ?? {})).toBe(true);
    for (const name of ['tasks-staging', 'tasks-demo']) {
      const deploy = jobsOf('ci.yml').find(([n]) => n === name)![1];
      expect(deploy.if!.startsWith(MAIN_ONLY), name).toBe(true);
    }
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

  it('checks the app’s variables first, naming them, before a deploy', () => {
    const first = (f: string, job: string) => jobsOf(f).find(([n]) => n === job)![1].steps![0]!;
    // The message a run with only the old variables set would show: it must name the new ones.
    const error = (s: Step) => (s.run ?? '').match(/::error::Set the repository variables? (.*)$/m)?.[1] ?? '';
    const names = (s: Step) => Object.values((s.env ?? {}) as Record<string, string>).join(' ');
    const expected: [string, string, string[]][] = [
      ['promote.yml', 'promote', ['CF_TASKS_PROD_PROJECT', 'TASKS_PROD_HOST', 'TASKS_PROD_URL']],
      ['ci.yml', 'tasks-staging', ['CF_TASKS_STAGING_PROJECT', 'TASKS_STAGING_HOST', 'TASKS_STAGING_URL']],
      ['ci.yml', 'tasks-preview', ['CF_TASKS_STAGING_PROJECT']],
      ['ci.yml', 'tasks-demo', ['CF_TASKS_DEMO_PROJECT', 'TASKS_DEMO_URL']],
      ['ci.yml', 'site-production', ['CF_SITE_PROJECT', 'SITE_URL']],
      ['ci.yml', 'site-preview', ['CF_SITE_PROJECT']],
    ];
    for (const [f, job, vars] of expected) {
      const step = first(f, job);
      expect(step.uses, job).toBeUndefined();
      for (const v of vars) {
        expect(error(step), job).toContain(v);
        expect(names(step), job).toContain(`\${{ vars.${v} }}`);
      }
    }
  });

  it('reads only the per-app repository variables (and DEPLOY_ENABLED)', () => {
    const NEW = [
      'CF_TASKS_STAGING_PROJECT', 'CF_TASKS_PROD_PROJECT', 'CF_TASKS_ZONE_ID',
      'TASKS_STAGING_DOMAIN', 'TASKS_STAGING_HOST', 'TASKS_STAGING_URL',
      'TASKS_PROD_HOST', 'TASKS_PROD_URL',
      'TASKS_PROD_FOLDER', 'TASKS_STAGING_FOLDER', 'TASKS_PREVIEW_HOST_SUFFIXES',
      'TASKS_ONEDRIVE_SCOPE', 'TASKS_MSAL_TENANT',
      'CF_TASKS_DEMO_PROJECT', 'TASKS_DEMO_URL', 'TASKS_REAL_USE_URL', 'CF_SITE_PROJECT', 'SITE_URL',
    ];
    const used = new Set(FILES.flatMap((f) => [...text(f).matchAll(/\bvars\.(\w+)/g)].map((m) => m[1]!)));
    expect(used.size).toBeGreaterThan(1);
    for (const v of used) expect([...NEW, 'DEPLOY_ENABLED'], v).toContain(v);
  });

  it('keeps the staging build as tasks-dist, from apps/tasks/dist', () => {
    const staging = jobsOf('ci.yml').find(([n]) => n === 'tasks-staging')![1];
    const upload = staging.steps!.filter((s) => s.uses?.startsWith('actions/upload-artifact@'));
    expect(upload.map((s) => s.with)).toEqual([{ name: 'tasks-dist', path: 'apps/tasks/dist', 'retention-days': 30 }]);
  });

  it('asks Promote which app, and takes the path, artifact and filter from the promoted commit', () => {
    const wf = parse(text('promote.yml')) as { on: { workflow_dispatch: { inputs: Record<string, object> } } };
    expect(wf.on.workflow_dispatch.inputs.app).toMatchObject({ type: 'choice', options: ['tasks'], default: 'tasks', required: true });
    const steps = jobsOf('promote.yml').find(([n]) => n === 'promote')![1].steps!;
    const env = (s: Step) => (s.env ?? {}) as Record<string, string>;
    const check = steps.find((s) => s.run?.includes('promote-check.mjs'))!;
    expect(check.run).toBe('node "$RUNNER_TEMP/ci/promote-check.mjs" "$COMMIT" "$APP"');
    expect(env(check).APP).toBe('${{ inputs.app }}');
    const notes = steps.find((s) => s.run?.includes('release-notes.mjs'))!;
    expect(notes.run).toBe('node "$RUNNER_TEMP/ci/release-notes.mjs" "$SHA" "$APP"');
    expect(env(notes).APP).toBe('${{ inputs.app }}');
    const download = steps.find((s) => s.uses?.startsWith('actions/download-artifact@'))!;
    expect(download.with).toMatchObject({ name: '${{ steps.check.outputs.artifact_name }}', path: '${{ steps.check.outputs.app_dir }}/dist' });
    const deploy = steps.find((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))!;
    expect((deploy.with as Record<string, string>).command).toMatch(/^pages deploy \$\{\{ steps\.check\.outputs\.app_dir \}\}\/dist /);
    // Nothing in Promote may name today's folder: an older commit has another one.
    expect(text('promote.yml')).not.toMatch(/apps\/tasks|--filter tasks|tasks-dist/);
  });

  it('updates the old preview comment too', () => {
    const preview = jobsOf('ci.yml').find(([n]) => n === 'tasks-preview')![1];
    const script = String((preview.steps!.find((s) => s.uses?.startsWith('actions/github-script@'))!.with as Record<string, string>).script);
    expect(script).toContain("'<!-- tasks-preview -->'");
    expect(script).toContain("'<!-- taskapp-preview -->'");
  });

  it('builds PR previews as demo builds', () => {
    const preview = jobsOf('ci.yml').find(([n]) => n === 'tasks-preview')![1];
    const build = preview.steps!.find((s) => s.run === 'pnpm --filter tasks build')!;
    expect(build.env).toMatchObject({
      VITE_STORAGE: 'demo',
      VITE_REAL_USE_URL: '${{ vars.TASKS_REAL_USE_URL }}',
      // Still PREVIEW in the footer.
      VITE_PREVIEW_HOST_SUFFIXES: '${{ vars.TASKS_PREVIEW_HOST_SUFFIXES }}',
    });
  });

  it('deploys the demo build from apps/tasks, so functions/ (the sign-in helper) is left out', () => {
    const wf = parse(text('ci.yml')) as { jobs: Record<string, Job & { concurrency?: unknown }> };
    const demo = wf.jobs['tasks-demo']!;
    expect(demo.concurrency).toEqual({ group: 'demo', 'cancel-in-progress': false });
    const steps = demo.steps!;
    const build = steps.find((s) => s.run === 'pnpm --filter tasks build')!;
    expect(build.env).toEqual({
      VITE_STORAGE: 'demo',
      VITE_REAL_USE_URL: '${{ vars.TASKS_REAL_USE_URL }}',
      BUILD_NUMBER: '${{ github.run_number }}',
    });
    // The project only: the domain and its DNS record were set up once by hand.
    const ensure = steps.find((s) => s.run === 'node tools/ci/ensure-pages-project.mjs')!;
    expect(ensure.env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      CF_PROJECT: '${{ vars.CF_TASKS_DEMO_PROJECT }}',
    });
    // A plain step with the workspace's wrangler, run from apps/tasks; values come in through env, not ${{ }}.
    expect(steps.some((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))).toBe(false);
    const deploys = steps.filter((s) => s.run?.includes('wrangler pages deploy'));
    expect(deploys).toHaveLength(1);
    expect(deploys[0]!['working-directory']).toBe('apps/tasks');
    expect(deploys[0]!.run).toBe('../../node_modules/.bin/wrangler pages deploy dist --project-name="$CF_TASKS_DEMO_PROJECT" --branch=main');
    expect(deploys[0]!.env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      CF_TASKS_DEMO_PROJECT: '${{ vars.CF_TASKS_DEMO_PROJECT }}',
    });
    const check = steps.find((s) => s.run === 'node tools/ci/check-demo.mjs')!;
    expect(check.env).toEqual({ DEMO_URL: '${{ vars.TASKS_DEMO_URL }}' });
    expect(steps.indexOf(check)).toBeGreaterThan(steps.indexOf(deploys[0]!));
    // Staging, by contrast, deploys from the repo root so its sign-in helper ships.
    const staging = wf.jobs['tasks-staging']!.steps!.find((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))!;
    expect((staging.with as Record<string, string>).workingDirectory).toBeUndefined();
    expect((staging.with as Record<string, string>).command).toMatch(/^pages deploy apps\/tasks\/dist /);
  });

  it('uses the same pinned wrangler action and version for every deploy', () => {
    const deploys = allSteps().filter((s) => s.uses?.startsWith('cloudflare/wrangler-action@'));
    expect(deploys.length).toBeGreaterThan(2);
    expect(new Set(deploys.map((s) => s.uses)).size).toBe(1);
    const versions = new Set(deploys.map((s) => (s.with as Record<string, string>).wranglerVersion));
    expect(versions.size).toBe(1);
    // The demo deploys with the workspace's wrangler (root package.json), so that must be the same version.
    const root = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(root.devDependencies.wrangler).toBe([...versions][0]);
  });

  it('calls ensure-pages-project with the generic variable names', () => {
    expect(FILES.some((f) => text(f).includes('ensure-staging'))).toBe(false);
    const calls = allSteps().filter((s) => s.run === 'node tools/ci/ensure-pages-project.mjs');
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) {
      const env = Object.keys((c.env ?? {}) as Record<string, string>);
      expect(env).toContain('CF_PROJECT');
      for (const k of env) expect(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CF_PROJECT', 'PAGES_DOMAIN', 'CF_ZONE_ID']).toContain(k);
    }
  });

  it('gives the e2e job no write permission', () => {
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.permissions).toEqual({ contents: 'read' });
  });

  it('runs e2e in the Playwright image that matches @playwright/test, installing no browsers', () => {
    const installed = JSON.parse(readFileSync(new URL('../../../apps/tasks/node_modules/@playwright/test/package.json', import.meta.url), 'utf8')).version;
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.container?.image).toMatch(new RegExp(`^mcr\\.microsoft\\.com/playwright:v${installed.replaceAll('.', '\\.')}-noble@sha256:[0-9a-f]{64}$`));
    expect(text('ci.yml')).not.toMatch(/playwright install/);
  });

  it('splits e2e into one job per Playwright project', () => {
    const config = readFileSync(new URL('../../../apps/tasks/playwright.config.ts', import.meta.url), 'utf8');
    const block = config.match(/projects: \[([\s\S]*?)\n {2}\],/)![1]!;
    const projects = [...block.matchAll(/\{ name: '(\w+)'/g)].map((m) => m[1]);
    // Every project in the block, however it is written, must be one the pattern above found.
    expect(projects).toHaveLength(block.match(/\bname:/g)!.length);
    expect(projects.length).toBeGreaterThan(1);
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.strategy?.matrix?.project).toEqual(projects);
    expect(e2e.strategy?.['fail-fast']).toBe(false);
    expect(e2e.steps!.map((s) => s.run)).toContain('pnpm --filter tasks e2e --project=${{ matrix.project }}');
  });

  it('deploys staging, the demo and the site only after check and every e2e job', () => {
    for (const name of ['tasks-staging', 'tasks-demo', 'site-production']) {
      expect(jobsOf('ci.yml').find(([n]) => n === name)![1].needs, name).toEqual(['check', 'e2e']);
    }
  });

  it('deploys PR previews once check passes, without waiting for e2e', () => {
    for (const name of ['tasks-preview', 'site-preview']) {
      expect(jobsOf('ci.yml').find(([n]) => n === name)![1].needs, name).toEqual(['check']);
    }
  });

  it('cancels the run once check has failed, so the e2e jobs stop early and check stays failed', () => {
    const jobs = Object.fromEntries(jobsOf('ci.yml'));
    // A separate job: cancelling from inside check would mark check itself cancelled instead of failed.
    const stop = jobs['stop-on-check-failure']!;
    expect(stop.needs).toEqual(['check']);
    expect(stop.if).toBe(`failure() && (github.event_name != 'pull_request' || ${FORK_GUARD})`);
    expect(stop.permissions).toEqual({ actions: 'write' });
    expect(stop.steps).toHaveLength(1);
    expect(stop.steps![0]!.run).toMatch(/^gh run cancel "\$RUN_ID"/);
    expect(stop.steps![0]!.env).toEqual({ GH_TOKEN: '${{ github.token }}', RUN_ID: '${{ github.run_id }}' });
    expect(jobs.check!.permissions).toBeUndefined();
  });

  it('gives every job a time limit', () => {
    const limits = Object.fromEntries(FILES.flatMap((f) => jobsOf(f).map(([n, j]) => [n, j['timeout-minutes']])));
    expect(limits).toEqual({ check: 10, 'stop-on-check-failure': 5, e2e: 20, 'tasks-preview': 15, 'tasks-staging': 15, 'tasks-demo': 15, 'site-preview': 15, 'site-production': 15, promote: 15 });
  });

  it('site jobs deploy only apps/site', () => {
    for (const name of ['site-preview', 'site-production']) {
      const job = jobsOf('ci.yml').find(([n]) => n === name)![1];
      const deploy = job.steps!.filter((s) => s.uses?.startsWith('cloudflare/wrangler-action@'));
      expect(deploy, name).toHaveLength(1);
      const w = deploy[0]!.with as Record<string, string>;
      // From apps/site, so wrangler bundles only its functions, never the sign-in helper at the root.
      expect(w.workingDirectory, name).toBe('apps/site');
      expect(w.command, name).toMatch(/^pages deploy dist --project-name=\$\{\{ vars\.CF_SITE_PROJECT \}\} /);
      const branch = name === 'site-production' ? '--branch=main' : '--branch=pr-${{ github.event.number }}';
      expect(w.command, name).toContain(` ${branch}`);
    }
  });

  it('deploys the site to production only from main, and previews it only for PRs', () => {
    const jobs = Object.fromEntries(jobsOf('ci.yml'));
    expect(jobs['site-production']!.if!.startsWith(MAIN_ONLY)).toBe(true);
    expect(jobs['site-production']!.if).toContain("vars.DEPLOY_ENABLED == 'true'");
    expect(jobs['site-preview']!.if).toContain(FORK_GUARD);
    expect(jobs['site-preview']!.if).toContain("vars.DEPLOY_ENABLED == 'true'");
  });

  it('runs the site’s e2e in the e2e job', () => {
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.steps!.map((s) => s.run)).toContain('pnpm --filter site e2e --project=${{ matrix.project }}');
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
      // From a repository variable: `${{ vars.X }}` in an action's input, `"$X"` (set from vars in env) in a script.
      expect(text(f)).not.toMatch(/--project-name=(?!\$\{\{ vars\.|"\$[A-Z_]+")/);
      expect(text(f)).not.toMatch(/alipka|ALAI/i);
    }
  });
});
