# #132: CI: PR checks in about 3 minutes

## What changes for users

Nothing in the apps. A PR's CI goes from about 8 minutes to about 3–4, and every test that guards something a user gets still runs.

Where the time goes today (run 41584310323, plus a local run of every suite with a JSON reporter):

| Step | iphone | desktop |
|---|---|---|
| tasks (standalone build) | 2:18 | 1:42 |
| site | 0:21 | 0:09 |
| time (standalone build) | 0:46 | 0:14 |
| omark | 0:55 | 0:24 |
| omark e2e:tasks | 1:47 | 1:21 |
| omark e2e:time | 0:43 | 0:12 |

The six steps run one after another. Each builds its app and runs on Playwright's default of 2 workers on a 4-vCPU runner.

The standalone Tasks and Time builds reach no user: app.omark.app and the demo serve `apps/omark` (doc/architecture.md, doc/history/3.7-remove-the-bridge.md). Yet their specs run twice, once against the standalone build and once against the one app with the same assertions:

- Tasks desktop: 149 of 195 tests
- Tasks iphone: 102 of 138 tests
- Time: 21 of 25 tests

## Acceptance criteria

- [ ] **No double runs.** The standalone Tasks and Time steps run only what the one app's run can't cover: `google-drive.spec.ts` and `local-folder.spec.ts`, which drive the real storage adapters in a browser. Everything else in `apps/tasks/e2e` and `apps/time/e2e` runs once, against the one app, as `omark e2e:tasks` / `e2e:time` already do.
- [ ] **Coverage the one app was missing.** The one app gets e2e for its own icons and manifest (today only the standalone `icons.spec` checks those, for a build nobody serves).
  - *Moved out in the PR:* the staging label. The one app has no staging title, manifest or icons; only Tasks' `STAGING` label shows inside it, and its host logic is unit-tested (`environment.test.ts`). An e2e needs a staging-host build of the one app, so it gets its own issue.
- [ ] **What the one app skips still runs.** Tests the one app's run skips but users still get (Tasks signing in again after a session expires, in `lifecycle.spec.ts`) run on the standalone build, and a test fails if a skipped test runs nowhere in CI.
- [ ] **More workers.** Playwright uses 4 workers on CI.
- [ ] **Faster polls.** The `expect.poll` calls that wait for a save poll every 100 ms through a shared helper, instead of Playwright's backoff to 1 s. `detail.spec.ts:138` already does this. The 1 s save delay itself stays.
- [ ] **Measured.** CI time is measured on this PR. If `e2e (iphone)` is still over 3.5 min, it is split into two parallel jobs, with a small job named `e2e (iphone)` that passes only when both do, so branch protection doesn't change.
- [ ] **Nothing dropped.** No test is deleted. Every spec that no longer runs in a step is listed in the PR, with where it still runs.
- [ ] **Docs.** AGENTS.md (Commands) and `doc/factory.md` say which e2e runs where. `pnpm e2e` locally still runs everything.

## Tests I'll write first

In `tools/ci/test/workflows.test.ts`:

- The e2e jobs run the standalone tasks and time steps with only `google-drive.spec.ts` and `local-folder.spec.ts`.
- They still run `omark e2e`, `omark e2e:tasks`, `omark e2e:time` and `site e2e` on both projects.
- The required check names `check`, `e2e (desktop)` and `e2e (iphone)` still exist as jobs.

Plus a test that every spec file in `apps/tasks/e2e` and `apps/time/e2e` is run against the one app, or is on the standalone list, or is named in a short list of standalone-only specs with the reason. That way a new spec can't silently run nowhere.

For the one app: the icons, manifest and staging-label specs in `apps/omark/e2e`, written to fail first on what they check.

## Risks

- **Standalone-only regressions.** A bug in a standalone-only screen (its own sign-in, first run, demo) is no longer caught in CI. Those screens reach no user. `pnpm e2e` locally still runs them.
- **Flakes from more workers.** 4 workers could expose timing flakes. Mitigation: `retries: 1` already exists; I'll run the suite three times on the PR before calling it done, and drop back to 3 workers if anything flakes.
- **A missed spec.** A spec could drop out of every run without anyone noticing. The test above makes that fail.

## Out of scope

- Running Time's specs on desktop only (the audit's option to save another minute). It trades away WebKit coverage, and iPhone users run WebKit.
- Component tests (Vitest browser mode): a new dependency, for about 30 s.
- Other runners, a faster linter or typechecker: not where the time goes.
- Time's first sync is slow on WebKit (1.0 s against 0.08 s on Chromium). That may be a real Safari performance bug, so it has its own issue.
