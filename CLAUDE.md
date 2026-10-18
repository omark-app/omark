# TaskApp

A PWA that keeps AL's tasks in plain Markdown files on his OneDrive. Specs: `doc/TaskApp v1 spec.md` (the app), `doc/TaskApp factory spec.md` (how work flows). Cut ideas go to `doc/TaskApp backlog.md`.

## Layout

- `packages/core`: parsing and logic, pure (no DOM, network or storage).
- `packages/storage`: OneDrive, the offline cache, sync.
- `packages/signin` + `functions/`: the sign-in helper (`/api/auth/*`, Cloudflare Pages Functions).
- `apps/web`: the Svelte 5 app and its Playwright e2e (`desktop` = Chrome, `iphone` = WebKit).
- `tools/`: Todoist import, the Claude guard hook, CI helper scripts.
- `doc/`: specs, plans (`doc/plans/<issue>-<slug>.md`), backlog.

## Commands

| command | |
|---|---|
| `pnpm typecheck` | all packages |
| `pnpm test` | all Vitest projects |
| `pnpm e2e` | fake-drive build + Playwright, both projects |
| `pnpm --filter web build` | the production build |

## Definition of done

- [ ] A test written first that failed before the change; the PR quotes the failing line.
- [ ] All four commands pass here, then in CI.
- [ ] The PR follows the template, closes the issue and has the preview link.
- [ ] A fresh-eyes review subagent (no memory of writing it) checked the diff against the issue or plan, and its findings are fixed.
- [ ] Large work: every acceptance criterion in the plan is met or explicitly moved out.
- [ ] Docs for changed behaviour are updated (README, the v1 spec, the `taskapp-files` skill when formats change).

Existing tests change only when the behaviour they cover is meant to change; the PR says which and why. When sync or storage changed, list `pnpm e2e:real` (manual) under "try this".

## How work flows

Follow the `taskapp-factory` skill: pick up, size (`size:small` / `size:large`), plan large work and wait for approval, implement test-first, open the PR, hand over. For the file formats use the `taskapp-files` skill.

## Hard rules

- Never push to `main`, never merge, never force-push.
- Never run Promote to production unless AL asks for it in this conversation.
- Never delete or rewrite task lines in AL's real files (`ALAI/TaskApp`). For anything real use `ALAI/TaskApp-e2e` or `ALAI/TaskApp-staging`.
- Never ask for a secret in chat. The cloud session has none and needs none.
- Steps only AL can do (Entra, his PC, dashboards, billing) get the `needs-human` label and short numbered instructions.

## GitHub in cloud sessions

`gh issue` and `gh pr` (GraphQL) are blocked by the proxy. Use the GitHub MCP tools, or `gh api` (REST), e.g. `gh api repos/alipkagit/TaskApp/issues/14/comments -f body=...`.

## Style

Plain, short English in docs, comments, issues and PRs. Commit messages are short imperative sentences ("Add tasks.md parser").
