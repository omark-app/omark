@AGENTS.md

# Claude Code notes

Everything above comes from `AGENTS.md`, which every agent reads. These notes are for Claude Code only.

## Fast mode until launch (2026-10-28)

Until the repo goes public (roadmap 4.3), the founder's working session overrides the factory flow in `AGENTS.md`: no issues, PRs or plan approvals; work serially in one session, test first, run `pnpm typecheck`, `pnpm test`, the build and the touched e2e specs, then commit and push straight to `main`. Fresh-eyes review stays: after each roadmap row (or a day's work, whichever comes first), one review subagent with no memory of writing the code checks its diff against the plan and spec, and its real findings are fixed before the next row. The founder tests on production. Force-push stays forbidden, and Promote runs only when the founder asks. Before 4.3, remove this section and restore the guard and deny rules in `.claude/settings.json`.

GitHub Actions is off while the repo is private (its free minutes ran out on 2026-10-29), so deploys run from this computer ([doc/plans/local-deploys.md](doc/plans/local-deploys.md)): after each push that isn't docs only, run `pnpm ship` (main's tip: typecheck and tests, then staging, the demo and the site, each with its live check). `pnpm promote` takes Promote's place and, like it, runs only when the founder asks. Before 4.3, also turn the CI and Promote workflows back on (`gh workflow enable CI`, `gh workflow enable "Promote to production"`).

## Skills

The repo's skills live in `.claude/skills/`:

- `omark-factory`: the issue flow step by step, with the comment and label wording and the plan-approval check.
- `taskapp-files`: how to read and edit `tasks.md`, `done.md` and `config.yaml`.
- `omark-time`: how to add Omark Time events, answer questions about hours from its CSV files, and draft a client report.
- `omark-goals`: how to read and edit Omark Goals' `goals.md`, review drift against tasks, habits and hours, and word new areas and goals.

`.claude/settings.json` wires up the hooks: the guard (`tools/claude-guard/guard.mjs`) that blocks pushes to `main`, merges and Promote, and the cloud session-start hook in `.claude/hooks/` ([doc/factory.md](doc/factory.md)).

## GitHub in cloud sessions

`gh issue` and `gh pr` (GraphQL) are blocked by the proxy. Use the GitHub MCP tools, or `gh api` (REST), e.g. `gh api repos/omark-app/omark/issues/14/comments -f body=...`.

## Cloud environment

Factory sessions run in a Claude cloud environment whose settings live at claude.ai. [doc/factory.md](doc/factory.md) records them.
