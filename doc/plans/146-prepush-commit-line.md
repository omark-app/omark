# Plan for #146: pre-push checks see what a commit-and-push line pushes

## What changes for users

Only agents in Claude Code notice. App users see nothing.

- A command that commits and pushes in one line (`git add x && git commit -m … && git push`) is judged by what it will push: the branch's commits, plus the files the commit may add. A docs-only change pushes at once, as it would in two commands.
- A checkout where `pnpm install` hasn't run (a new worktree) gets one clear line, "dependencies aren't installed in <folder>: run `pnpm install` there and push again", instead of "'vitest' is not recognized".

## Acceptance criteria

- [ ] When the line runs `git commit` before the push, the changed files are the branch's diff since it left main, plus every tracked change and every untracked, not-ignored file. That is a superset of what the commit takes, so the hook may check more than needed but never less.
- [ ] Added after review, to keep that promise: the hook reads the tree before the line runs, so a line with any other step before the push that could change files or make commits (`sed`, `git mv`, a redirect, `git add -f`, `git stash`, `git cherry-pick`, an alias) runs the full `pnpm typecheck` and `pnpm test`. A new file in a package runs the full `pnpm typecheck`, since pnpm's filter doesn't see untracked files. A rename counts as both names.
- [ ] A push with no commit in the line is judged as today, by the branch's commits only.
- [ ] When checks would run and the checkout has no `node_modules`, the push is blocked with the install message, and no check runs.
- [ ] A docs-only push from a checkout with no install still passes: it runs no checks, so it needs none.
- [ ] `doc/factory.md` ("Checks before a push") says both.

## Tests I'll write first

In `tools/claude-guard/test/checks.test.ts`:

1. `commitsFirst`: true for `git add x && git commit -m y && git push`, `git commit -am y; git push`, `git -C sub commit -m y && git -C sub push`. False for `git push`, `git status && git push`, and `echo git commit && git push`.
2. The hook, in the miniature repo: a new untracked `doc/b.md`, then `git add doc/b.md && git commit -m b && git push` passes with no checks. It fails today: the checks run.
3. The same line with a new `apps/x/a.ts` runs the checks.
4. With a stubbed `installed: () => false`: a code change is blocked with the install message and `run` is never called. A docs-only change passes.

## Risks

- **Counting too much.** A dirty checkout (say an untracked `.claude/settings.local.json`) makes a commit-and-push line run the checks, even when the commit is docs only. That is stricter, never looser, and it costs about 40 s. Two separate commands keep today's exact behaviour.
- **This changes the guard's folder** (`tools/claude-guard`), which is why it is large. The guard itself (`guard.mjs`) doesn't change.

## Out of scope

- Running `pnpm install` from the hook: a hook that installs packages does too much behind the agent's back. The message is enough.
- Reading which files `git add` names, to count exactly what the commit takes.
