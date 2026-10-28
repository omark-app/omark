@AGENTS.md

# Claude Code notes

Everything above comes from `AGENTS.md`, which every agent reads. These notes are for Claude Code only.

## Fast mode until launch (AL, 2026-10-28)

Until the repo goes public (roadmap 4.3), AL's working session overrides the factory flow in `AGENTS.md`: no issues, PRs or plan approvals; work serially in one session, test first, run `pnpm typecheck`, `pnpm test`, the build and the touched e2e specs, then commit and push straight to `main`. AL tests on production. Force-push stays forbidden, and Promote runs only when AL asks. Before 4.3, remove this section and restore the guard and deny rules in `.claude/settings.json`.

## Skills

The repo's skills live in `.claude/skills/`:

- `omark-factory`: the issue flow step by step, with the comment and label wording and the plan-approval check.
- `taskapp-files`: how to read and edit `tasks.md`, `done.md` and `config.yaml`.
- `omark-time`: how to add Omark Time events, answer questions about hours from its CSV files, and draft a client report.

`.claude/settings.json` wires up the hooks: the guard (`tools/claude-guard/guard.mjs`) that blocks pushes to `main`, merges and Promote, and the cloud session-start hook in `.claude/hooks/` ([doc/factory.md](doc/factory.md)).

## GitHub in cloud sessions

`gh issue` and `gh pr` (GraphQL) are blocked by the proxy. Use the GitHub MCP tools, or `gh api` (REST), e.g. `gh api repos/omark-app/omark/issues/14/comments -f body=...`.

## Cloud environment

Factory sessions run in a Claude cloud environment whose settings live at claude.ai. [doc/factory.md](doc/factory.md) records them.
