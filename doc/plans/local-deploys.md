# Local deploys while GitHub Actions is off

Date: 2026-10-30. Fast mode (CLAUDE.md), no issue.

## Why

The repository is private on GitHub's free plan, which gives 2,000 Actions minutes a month. October's ran out on
2026-10-29, so CI refused to start and nothing on main deployed. With one maintainer and one agent, CI repeats
checks that already run here before each push. Until the repository goes public (roadmap 4.3, when Actions is free),
CI and Promote are switched off on GitHub and their deploys run from this computer.

## What changes

- `pnpm ship` does what CI's main jobs did, for main's tip on GitHub (`origin/main`): checks, then the one app to
  staging (with the sign-in check), the demo (with its check) and the site (with its check).
- `pnpm promote [commit | omark-prod- tag]` does what promote.yml did for `omark`: it deploys the build staging ran
  to production, checks the sign-in helper and tags a release with notes.
- Both read the repository variables with `gh variable list`, deploy with the computer's wrangler sign-in, and
  build in a git worktree of the exact commit outside the repository (`~/.omark-deploy/<sha>`), so the working
  copy and its uncommitted files never ship.
- Release notes list the commits since the last release when there are no merged pull requests (fast mode has none).
- The bridge (`tasks` to tasks.alipka.com) is not covered: it is retired at the cutover (3.6, 3.7).

## Acceptance criteria

- `pnpm ship` refuses to run with a missing repository variable, and deploys nothing if typecheck or tests fail.
- Promote with no commit takes what staging runs now (its `version.json`), and refuses a commit `pnpm ship` never
  deployed to staging from this computer, or one not on main. An `omark-prod-` tag rolls back, rebuilding if needed.
- Promote asks for a yes before it deploys, unless given `--yes`.
- The production deploy bundles the functions of the promoted commit, not of the working copy.

## Tests first

`tools/ci/test/local-deploy.test.ts`: the build environments from the variables, the missing-variable refusal, the
promote decision (staging's build, a kept commit, a rollback tag, an unknown or never-staged commit, a commit off
main), the site check, and which old worktrees are removed. `release-notes.test.ts`: commits listed when no pull
requests were merged.

## Risks

- A deploy from this computer skips the e2e run CI did. Mitigation: the touched e2e specs still run before each
  push (CLAUDE.md), and the full `pnpm e2e` runs again when CI is back.
- Build numbers: CI used its run number (211 at the switch). Local builds use main's commit count (556+), so the
  footer number jumps; it is only shown, never compared.

## Out of scope

- Re-enabling CI and Promote on GitHub (before 4.3).
- The bridge's staging and Promote.
