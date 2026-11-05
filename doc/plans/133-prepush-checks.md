# #133: Run typecheck and unit tests before an agent pushes

## What changes for users

Nothing in the apps. For agents working in this repository with Claude Code:

- Before a `git push` runs, a hook runs the typecheck and the unit tests of the packages the branch changed, and the packages that depend on them. If either fails, the push is blocked and the agent sees the failing output, so it fixes the error in seconds instead of waiting for CI.
- A branch that only changes docs (`doc/**`, `*.md`) skips the checks and pushes at once.
- People pushing from their own terminal are not affected: Claude Code hooks only run for Claude Code.

Measured today on Windows: the full `pnpm typecheck` takes 62 s and `pnpm test` 53 s. Running only the changed packages, and running the two side by side, should bring a typical push to under 30 s.

## Acceptance criteria

- [ ] A `git push` from Claude Code with a type error or a failing unit test in a changed package is blocked, and the hook's message shows the failing lines (the last ~40).
- [ ] A push whose branch, compared with `origin/main`, changes only docs runs no checks.
- [ ] Commands that are not a push (`git status`, `git push --dry-run`, `git push --delete`) run no checks.
- [ ] Packages are picked with pnpm's changed-since filter (`--filter "...[origin/main]"`). When that can't be worked out (no `origin/main`), it falls back to the full `pnpm typecheck` and `pnpm test`.
- [ ] The hook sits in `.claude/settings.json` next to the guard, with a timeout long enough for the full fallback (10 min). It works in local and cloud sessions.
- [ ] `doc/factory.md` (The guard) and AGENTS.md (Commands, or How work flows step 4) say it exists, in one line each.

## Tests I'll write first

In `tools/claude-guard/test/` (Vitest), against a new `tools/claude-guard/checks.mjs` whose pure parts are exported:

- `isPush(command)`: true for `git push`, `git push -u origin issue-1-x`, `git -C dir push`, `cd x && git push`; false for `git push --dry-run`, `git push origin --delete b`, `git status`, `echo git push`. It reuses the guard's command parser, so both read commands the same way.
- `onlyDocs(files)`: true for `doc/a.md`, `README.md`; false as soon as one file is code, config or a workflow.
- `plan(files)`: no commands for docs only; the two filtered commands otherwise; the full commands when the changed files can't be read.
- The hook end to end, spawned like the guard's tests, with a stub runner: exit 2 with the output's tail when a check fails, exit 0 when both pass or when the command isn't a push.

## Risks

- A slow or flaky test blocks every push. Mitigation: unit tests only (e2e stays in CI). A flaky unit test is a bug to fix anyway.
- The changed-since filter can miss a package that is affected without depending on the changed one through `package.json` (for example a test that reads a file of another package). CI still runs everything, so the cost is a later failure, as today.
- The hook blocks pushing a branch that is red on purpose (a failing test pushed to show it). The agent can say so to the maintainer, who can push it from a terminal. I don't add a bypass, because agents would use it.

## Out of scope

- Lint: the repository has no linter today.
- e2e before push: too slow; it stays in CI.
- A git `pre-push` hook for people: contributors set up their own tools; this is for agents.
