@AGENTS.md

# Claude Code notes

Everything above comes from `AGENTS.md`, which every agent reads. These notes are for Claude Code only.

## Skills

The repo's skills live in `.claude/skills/`:

- `taskapp-factory`: the issue flow step by step, with the comment and label wording.
- `taskapp-files`: how to read and edit `tasks.md`, `done.md` and `config.yaml`.

`.claude/settings.json` wires up the hooks: the guard (`tools/claude-guard/guard.mjs`) that blocks pushes to `main`, merges and Promote, and the cloud session-start hook in `.claude/hooks/` ([doc/factory.md](doc/factory.md)).

## GitHub in cloud sessions

`gh issue` and `gh pr` (GraphQL) are blocked by the proxy. Use the GitHub MCP tools, or `gh api` (REST), e.g. `gh api repos/omark-app/omark/issues/14/comments -f body=...`.

## Cloud environment

Factory sessions run in a Claude cloud environment whose settings live at claude.ai. [doc/factory.md](doc/factory.md) records them.
