# 124: run the required checks on docs-only PRs

Issue #124. Large (a CI change).

## What changes for users

Nothing in the apps. For contributors and maintainers: a PR that only changes docs gets `check`, `e2e (desktop)` and `e2e (iphone)`, the checks branch protection on `main` requires, so it can merge like any other PR. Today CI's `pull_request` trigger ignores `doc/**` and `**/*.md`, so such a PR waits for checks that never come.

## Acceptance criteria

- [ ] CI's `pull_request` trigger has no `paths-ignore` (or `paths`) filter.
- [ ] CI's `push` trigger on `main` keeps `paths-ignore: ['doc/**', '**/*.md']`: a docs-only push has nothing to deploy.
- [ ] The workflow test checks both.

## Tests I'll write first

- `tools/ci/test/workflows.test.ts`: "runs the required checks on every PR, docs-only ones included (#124)": the `pull_request` trigger has neither `paths-ignore` nor `paths`; the `push` trigger still ignores `doc/**` and `**/*.md`.

## Risks

- Docs-only PRs now spend a CI run (a few minutes, free on a public repository) and get an app preview they don't need.

## Out of scope

- Skipping the e2e jobs inside the run for docs-only changes (a path-filter job). Not worth the extra moving part while runs are free.
