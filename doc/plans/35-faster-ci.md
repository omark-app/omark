# 35: Speed up CI

Issue #35. Branch `issue-35-faster-ci`.

Today (run 39798228306 on `main`, 2026-10-22): e2e took 4m52s, so deploy-staging started 4m55s after the push. Goal: about 3 minutes or less.

## What changes for AL

- Staging updates about 2 minutes sooner after a merge, and PR previews appear sooner.
- The Actions tab shows `e2e (desktop)` and `e2e (iphone)` instead of one `e2e`.
- A stuck job stops after its time limit instead of using up to 6 hours of minutes.
- Nothing changes in the app.

## Design

- **Container.** The e2e job runs in `mcr.microsoft.com/playwright:v1.64.1-noble`, pinned by digest like the other third-party images. The browsers and their Linux packages are already in the image.
  - The `Playwright version`, browser cache and both install steps go.
  - `options: --user 1001` (what Playwright's docs recommend for GitHub Actions), so files the job writes belong to the runner user and the browsers don't run as root.
  - checkout, pnpm and setup-node stay as they are. setup-node still installs the `.nvmrc` Node, so the container's Node doesn't matter.
  - The image tag must match the installed `@playwright/test`. A test checks this, so a version bump that misses the image fails `pnpm test`.
- **Split.** `e2e` gets `strategy.matrix.project: [desktop, iphone]` with `fail-fast: false`, and runs `pnpm --filter web e2e --project=${{ matrix.project }}`. Each leg builds the fake app once (the Playwright web server), as the single job does today.
  - `preview` and `deploy-staging` keep `needs: [check, e2e]`. With a matrix, that waits for every leg.
  - There is no branch protection, so no "required checks" list needs changing.
  - Promote checks the CI run's overall result, not job names (`promote-check.mjs`), so it needs no change.
- **Workers.** `workers: process.env.CI ? 4 : undefined` in `playwright.config.ts`. A GitHub runner has 4 vCPUs, and Playwright's default is half of them. Kept only if it is faster and 3 runs in a row have no new flakes (no test needing a retry). Otherwise reverted, and the PR says so with the times.
- **Stop on a failed check.** check and e2e keep starting together, so a green run doesn't wait about 50 seconds for check. If check fails, a small job after it (`stop-on-check-failure`, `needs: check`, `if: failure()`) cancels the run, so the e2e jobs stop instead of running for 2–3 minutes more. Only that job gets `actions: write`. A first try cancelled from a step inside check, but then check itself showed as cancelled instead of failed. On a fork's PR the token can't cancel, so e2e just runs on. Added after the first branch runs; AL agreed in the session on 2026-10-22.
- **Time limits.** `timeout-minutes`: check 10, e2e 20, preview 15, deploy-staging 15. Promote gets 15 too.
- **Measuring.** CI is started by hand on the branch (Actions → CI → Run workflow) 3 times, plus the PR runs. Starting it by hand on a branch other than `main` runs check and e2e only. The time from start to the end of the slower e2e leg is the time a `main` run would reach deploy-staging. The PR lists the times for all runs.

## Acceptance criteria

- [ ] e2e runs in the Playwright image matching `@playwright/test`, with no browser install steps.
- [ ] `e2e (desktop)` and `e2e (iphone)` run in parallel, and together run the same tests as today's `e2e`.
- [ ] `preview` and `deploy-staging` wait for both e2e legs and for check.
- [ ] A failed check cancels the run, so the e2e jobs stop early. Shown once on a throwaway branch with a failing test.
- [ ] Every job in `ci.yml` and `promote.yml` has the time limit above.
- [ ] 4 workers on CI are kept only if faster and stable over 3 runs. The PR states the outcome.
- [ ] Check through the end of e2e takes about 3 minutes or less in the branch runs.
- [ ] The factory spec (section 6) describes the new jobs. (The README has no section on CI jobs, so it needs no change.)

## Tests I'll write first

In `tools/ci/test/workflows.test.ts`:

- The e2e job's container image is `mcr.microsoft.com/playwright:v<installed @playwright/test version>-noble@sha256:…`.
- No step in `ci.yml` runs `playwright install`.
- The e2e matrix lists exactly the projects in `playwright.config.ts`, and its run step passes `--project=${{ matrix.project }}`.
- `preview` and `deploy-staging` both need `check` and `e2e`.
- `stop-on-check-failure` needs check, runs only on its failure (and not for forks), cancels the run, and is the only job with `actions: write`.
- Every job has `timeout-minutes` with the value above.
- The existing "e2e has no write permission" test stays as it is.

The worker count is not unit-tested. The CI runs show whether it holds.

## Risks

- **Running in a container.** `pnpm/action-setup`, `setup-node` and the pnpm cache must work inside the image as user 1001. If they don't, I fall back to the runner with the browser cache (today's steps) and keep the split and time limits.
- **WebKit flakes with more workers.** iPhone tests are the slowest and most timing-sensitive. That is why the 3-run check exists.
- **Image pull time.** The image is about 2 GB. If pulling it costs about as much as the install did, the container gains little. The branch runs will show it.
- **Minutes.** Two e2e jobs bill two rounded-up minute counts instead of one. At about 2 minutes each, that is about the same as today's single 5-minute job.

## Out of scope

- Sharding within a project.
- Reusing one build across both legs (they'd need an artifact handover, which costs about what the build saves).
- Branch protection and required checks.
