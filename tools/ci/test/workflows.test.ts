import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FILES = ['ci.yml', 'promote.yml'];
const path = (f: string) => new URL(`../../../.github/workflows/${f}`, import.meta.url);
const text = (f: string) => readFileSync(path(f), 'utf8');

interface Step { id?: string; name?: string; if?: string; uses?: string; with?: unknown; env?: unknown; run?: string; 'working-directory'?: string }
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
    expect(all.map((b) => b.name).sort()).toEqual([
      'omark-demo', 'omark-preview', 'omark-staging', 'site-preview', 'site-production',
    ]);
    const ci = all.filter((b) => !b.name.startsWith('site-'));
    // The job's name starts with its app's: omark-*, site-*.
    for (const b of all) expect(b.run, b.name).toBe(`pnpm --filter ${b.name.split('-')[0]} build`);
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

  it('runs the required checks on every PR, docs-only ones included (#124)', () => {
    // Branch protection requires check and both e2e jobs, so a PR they skip could never merge.
    const on = (parse(text('ci.yml')) as { on: Record<string, Record<string, unknown> | null> }).on;
    expect(Object.keys(on.pull_request ?? {})).not.toContain('paths-ignore');
    expect(Object.keys(on.pull_request ?? {})).not.toContain('paths');
    // A docs-only push to main has nothing to deploy.
    expect(on.push?.['paths-ignore']).toEqual(['doc/**', '**/*.md']);
  });

  it('lets CI be started by hand, deploying staging and the demo only from main', () => {
    expect('workflow_dispatch' in ((parse(text('ci.yml')) as { on: object }).on ?? {})).toBe(true);
    for (const name of ['omark-staging', 'omark-demo']) {
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
      ['ci.yml', 'omark-staging', ['CF_APP_STAGING_PROJECT', 'APP_STAGING_HOST', 'APP_STAGING_URL']],
      ['ci.yml', 'omark-preview', ['CF_APP_STAGING_PROJECT']],
      ['ci.yml', 'omark-demo', ['CF_DEMO_PROJECT', 'DEMO_URL']],
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
    // Promote checks the one app's.
    const promote = first('promote.yml', 'promote');
    expect(promote.uses).toBeUndefined();
    const lines = [...(promote.run ?? '').matchAll(/::error::Set the repository variables (.*)$/gm)].map((m) => m[1]!);
    expect(lines).toHaveLength(1);
    for (const v of ['CF_APP_PROJECT', 'APP_PROD_HOST', 'APP_PROD_URL']) {
      expect(lines[0]).toContain(v);
      expect(names(promote)).toContain(`\${{ vars.${v} }}`);
    }
  });

  it('reads only the one app’s and the site’s repository variables (and DEPLOY_ENABLED)', () => {
    const ONE_APP = [
      'CF_APP_PROJECT', 'CF_APP_STAGING_PROJECT', 'CF_DEMO_PROJECT',
      'APP_PROD_HOST', 'APP_STAGING_HOST', 'APP_PROD_URL', 'APP_STAGING_URL', 'DEMO_URL',
      'APP_PREVIEW_HOST_SUFFIXES', 'APP_MSAL_TENANT', 'REAL_USE_URL',
    ];
    const used = new Set(FILES.flatMap((f) => [...text(f).matchAll(/\bvars\.(\w+)/g)].map((m) => m[1]!)));
    expect(used.size).toBeGreaterThan(1);
    for (const v of used) expect([...ONE_APP, 'CF_SITE_PROJECT', 'SITE_URL', 'DEPLOY_ENABLED'], v).toContain(v);
    for (const v of ONE_APP) expect(used, v).toContain(v);
  });

  it('keeps the staging build for Promote: omark-dist', () => {
    const upload = (job: string) =>
      jobsOf('ci.yml').find(([n]) => n === job)![1].steps!.filter((s) => s.uses?.startsWith('actions/upload-artifact@')).map((s) => s.with);
    expect(upload('omark-staging')).toEqual([{ name: 'omark-dist', path: 'apps/omark/dist', 'retention-days': 30 }]);
  });

  it('asks Promote which app, and takes the path, artifact and filter from the promoted commit', () => {
    const wf = parse(text('promote.yml')) as { on: { workflow_dispatch: { inputs: Record<string, object> } } };
    expect(wf.on.workflow_dispatch.inputs.app).toMatchObject({ type: 'choice', options: ['omark'], default: 'omark', required: true });
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
    // The one app deploys from its folder, so its own functions/ (the sign-in helper) ships, then the sign-in check.
    const deploys = steps.filter((s) => s.uses?.startsWith('cloudflare/wrangler-action@'));
    expect(deploys).toHaveLength(1);
    const omark = deploys[0]!.with as Record<string, string>;
    expect(omark.workingDirectory).toBe('${{ steps.check.outputs.app_dir }}');
    expect(omark.command).toMatch(/^pages deploy dist --project-name=\$\{\{ vars\.CF_APP_PROJECT \}\} --branch=main /);
    const checks = steps.filter((s) => /check-(omark-)?signin\.mjs/.test(s.run ?? ''));
    expect(checks.map((s) => s.run)).toEqual(['node "$RUNNER_TEMP/ci/check-omark-signin.mjs"']);
    expect(env(checks[0]!)).toEqual({ SIGNIN_URL: '${{ vars.APP_PROD_URL }}', MSAL_TENANT: '${{ vars.APP_MSAL_TENANT }}' });
    // The rebuild's hosts and folders are the chosen app's, set by the first step.
    const first = steps[0]!.run ?? '';
    for (const v of ['VITE_PROD_HOST', 'VITE_STAGING_HOST', 'VITE_PREVIEW_HOST_SUFFIXES']) expect(first).toContain(`echo "${v}=`);
    expect(first).toContain('>> "$GITHUB_ENV"');
    // Nothing in Promote may name an app's folder or build: an older commit can have another one.
    expect(text('promote.yml')).not.toMatch(/apps\/(tasks|omark)|--filter (tasks|omark)|(tasks|omark)-dist/);
  });

  it('builds PR previews as demo builds of the one app', () => {
    const preview = jobsOf('ci.yml').find(([n]) => n === 'omark-preview')![1];
    const build = preview.steps!.find((s) => s.run === 'pnpm --filter omark build')!;
    expect(build.env).toMatchObject({
      VITE_STORAGE: 'demo',
      VITE_REAL_USE_URL: '${{ vars.REAL_USE_URL }}',
      // PREVIEW, not DEMO, from the host.
      VITE_PREVIEW_HOST_SUFFIXES: '${{ vars.APP_PREVIEW_HOST_SUFFIXES }}',
    });
    const deploy = preview.steps!.find((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))!.with as Record<string, string>;
    expect(deploy.workingDirectory).toBe('apps/omark');
    expect(deploy.command).toBe('pages deploy dist --project-name=${{ vars.CF_APP_STAGING_PROJECT }} --branch=pr-${{ github.event.number }}');
    const script = String((preview.steps!.find((s) => s.uses?.startsWith('actions/github-script@'))!.with as Record<string, string>).script);
    expect(script).toContain("'<!-- omark-preview -->'");
  });

  it('deploys the demo from inside apps/omark/dist, so no functions/ (sign-in helper) goes with it', () => {
    const wf = parse(text('ci.yml')) as { jobs: Record<string, Job & { concurrency?: unknown }> };
    const demo = wf.jobs['omark-demo']!;
    expect(demo.concurrency).toEqual({ group: 'demo', 'cancel-in-progress': false });
    const steps = demo.steps!;
    const build = steps.find((s) => s.run === 'pnpm --filter omark build')!;
    expect(build.env).toEqual({
      VITE_STORAGE: 'demo',
      VITE_REAL_USE_URL: '${{ vars.REAL_USE_URL }}',
      BUILD_NUMBER: '${{ github.run_number }}',
    });
    // The project only: the domain and its DNS record were set up once by hand.
    const ensure = steps.find((s) => s.run === 'node tools/ci/ensure-pages-project.mjs')!;
    expect(ensure.env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      CF_PROJECT: '${{ vars.CF_DEMO_PROJECT }}',
    });
    // A plain step with the workspace's wrangler; values come in through env, not ${{ }}.
    expect(steps.some((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))).toBe(false);
    const deploys = steps.filter((s) => s.run?.includes('wrangler pages deploy'));
    expect(deploys).toHaveLength(1);
    expect(deploys[0]!['working-directory']).toBe('apps/omark/dist');
    expect(deploys[0]!.run).toBe('../../../node_modules/.bin/wrangler pages deploy . --project-name="$CF_DEMO_PROJECT" --branch=main');
    expect(deploys[0]!.env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      CF_DEMO_PROJECT: '${{ vars.CF_DEMO_PROJECT }}',
    });
    const check = steps.find((s) => s.run === 'node tools/ci/check-demo.mjs')!;
    expect(check.env).toEqual({ DEMO_URL: '${{ vars.DEMO_URL }}' });
    expect(steps.indexOf(check)).toBeGreaterThan(steps.indexOf(deploys[0]!));
  });

  it('deploys one app staging from apps/omark, so its sign-in helper ships, and checks it', () => {
    const wf = parse(text('ci.yml')) as { jobs: Record<string, Job & { concurrency?: unknown }> };
    const staging = wf.jobs['omark-staging']!;
    expect(staging.concurrency).toEqual({ group: 'staging', 'cancel-in-progress': false });
    const steps = staging.steps!;
    // One build for staging and production: the app picks its environment from the host name.
    expect(steps.find((s) => s.run === 'pnpm --filter omark build')!.env).toEqual({
      BUILD_NUMBER: '${{ github.run_number }}',
      VITE_PROD_HOST: '${{ vars.APP_PROD_HOST }}',
      VITE_STAGING_HOST: '${{ vars.APP_STAGING_HOST }}',
      VITE_PREVIEW_HOST_SUFFIXES: '${{ vars.APP_PREVIEW_HOST_SUFFIXES }}',
    });
    expect(steps.find((s) => s.run === 'node tools/ci/ensure-pages-project.mjs')!.env).toEqual({
      CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
      CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
      CF_PROJECT: '${{ vars.CF_APP_STAGING_PROJECT }}',
    });
    const deploy = steps.find((s) => s.uses?.startsWith('cloudflare/wrangler-action@'))!.with as Record<string, string>;
    expect(deploy.workingDirectory).toBe('apps/omark');
    expect(deploy.command).toBe('pages deploy dist --project-name=${{ vars.CF_APP_STAGING_PROJECT }} --branch=main');
    const check = steps.find((s) => s.run === 'node tools/ci/check-omark-signin.mjs')!;
    expect(check.env).toEqual({ SIGNIN_URL: '${{ vars.APP_STAGING_URL }}', MSAL_TENANT: '${{ vars.APP_MSAL_TENANT }}' });
  });

  it('uses the same pinned wrangler action and version for every deploy', () => {
    const deploys = allSteps().filter((s) => s.uses?.startsWith('cloudflare/wrangler-action@'));
    expect(deploys.length).toBeGreaterThan(2);
    expect(new Set(deploys.map((s) => s.uses)).size).toBe(1);
    const versions = new Set(deploys.map((s) => (s.with as Record<string, string>).wranglerVersion));
    expect(versions.size).toBe(1);
    // The demo deploys with the workspace's wrangler (root package.json), and the action finds the one in the
    // folder it runs from (apps/omark, apps/site), so they must all be the same version.
    for (const pkg of ['package.json', 'apps/omark/package.json', 'apps/site/package.json']) {
      const json = JSON.parse(readFileSync(new URL(`../../../${pkg}`, import.meta.url), 'utf8'));
      expect(json.devDependencies.wrangler, pkg).toBe([...versions][0]);
    }
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
    for (const name of ['omark-staging', 'omark-demo', 'site-production']) {
      expect(jobsOf('ci.yml').find(([n]) => n === name)![1].needs, name).toEqual(['check', 'e2e']);
    }
  });

  it('deploys from main only while its commit is still main’s tip (#81)', () => {
    // A run whose e2e finished later must not overwrite a newer commit's deploy; the newer run deploys itself.
    for (const name of ['omark-staging', 'omark-demo', 'site-production']) {
      const steps = jobsOf('ci.yml').find(([n]) => n === name)![1].steps!;
      const i = steps.findIndex((s) => s.id === 'tip');
      // Right after the variables check, before anything is built or deployed.
      expect(i, name).toBe(1);
      // Newer commits that only touch docs have no run of their own, so they don't make this one skip.
      expect(steps[i]!.run, name).toContain(`gh api "repos/$REPO/compare/$GITHUB_SHA...main"`);
      expect(steps[i]!.run, name).toContain('select(test("^doc/|[.]md$") | not)');
      expect(steps[i]!.run, name).toMatch(/if \[ "\$newer" = 0 \]; then\n\s+echo "latest=true" >> "\$GITHUB_OUTPUT"/);
      expect(steps[i]!.env, name).toEqual({ GH_TOKEN: '${{ github.token }}', REPO: '${{ github.repository }}' });
      for (const s of steps.slice(i + 1)) {
        expect(s.if, `${name}: ${s.name ?? s.uses ?? s.run}`).toBe("steps.tip.outputs.latest == 'true'");
      }
    }
  });

  it('deploys PR previews once check passes, without waiting for e2e', () => {
    for (const name of ['omark-preview', 'site-preview']) {
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
    expect(limits).toEqual({ check: 10, 'stop-on-check-failure': 5, e2e: 20, 'omark-preview': 15, 'omark-staging': 15, 'omark-demo': 15, 'site-preview': 15, 'site-production': 15, promote: 15 });
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

  it('runs Omark Time’s e2e in the e2e job, with the same Playwright projects as Tasks', () => {
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.steps!.map((s) => s.run)).toContain('pnpm --filter time e2e --project=${{ matrix.project }}');
    const names = (app: string) =>
      [...readFileSync(new URL(`../../../apps/${app}/playwright.config.ts`, import.meta.url), 'utf8').matchAll(/\{ name: '(\w+)'/g)].map((m) => m[1]);
    expect(names('time')).toEqual(names('tasks'));
  });

  it("runs the one app's e2e and Tasks' specs inside it in the e2e job, with the same Playwright projects", () => {
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    const runs = e2e.steps!.map((s) => s.run);
    expect(runs).toContain('pnpm --filter omark e2e --project=${{ matrix.project }}');
    expect(runs).toContain('pnpm --filter omark e2e:tasks --project=${{ matrix.project }}');
    const names = (file: string) =>
      [...readFileSync(new URL(`../../../apps/${file}`, import.meta.url), 'utf8').matchAll(/\{ name: '(\w+)'/g)].map((m) => m[1]);
    expect(names('omark/playwright.config.ts')).toEqual(names('tasks/playwright.config.ts'));
    expect(names('omark/playwright.tasks.config.ts')).toEqual(names('tasks/playwright.config.ts'));
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

  it('names no project', () => {
    // From a repository variable: `${{ vars.X }}` in an action's input, `"$X"` (set from vars in env) in a script.
    // Hosts and folders: owner-values.test.ts.
    for (const f of FILES) expect(text(f)).not.toMatch(/--project-name=(?!\$\{\{ vars\.|"\$[A-Z_]+")/);
  });
});
