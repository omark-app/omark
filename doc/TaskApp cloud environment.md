# TaskApp cloud environment

The settings of the Claude cloud environment that factory sessions run in ([[TaskApp factory spec]], 7.4). They live at claude.ai, not in the repo, so this page is the record. To re-create it: claude.ai/code → environment menu → Add environment, and copy what's below.

## Settings

| Setting | Value |
|---|---|
| Name | `TaskApp` |
| Repository | `alipkagit/TaskApp` |
| Network access | **Limited** (called Custom in older apps), with the package managers box ticked, plus these allowed domains: `cdn.playwright.dev`, `playwright.download.prss.microsoft.com` |
| Setup script | none |
| Environment variables | none |
| Secrets | none. The session never needs Cloudflare, Entra or OneDrive credentials; deploys run in GitHub Actions. |

Why the two domains: Playwright downloads its Chromium and WebKit builds from them, and the default list blocks them (checked 2026-10-18: `403 … no rule or allowlist entry allows host "cdn.playwright.dev"`). The container's pre-installed Chromium is an older build that this Playwright version doesn't use.

## What happens when a session starts

`.claude/hooks/session-start.sh` runs in cloud sessions only (`CLAUDE_CODE_REMOTE=true`):

1. `corepack enable`.
2. `pnpm install --frozen-lockfile` when `node_modules` is missing or older than `pnpm-lock.yaml`.
3. `playwright install --with-deps chromium webkit` when this Playwright version's browsers are missing.

It prints one line if a step fails and never blocks the session. The browser download is in the hook rather than a setup script, so the same steps work in any environment and stay in the repo.

The guard hook (`tools/claude-guard/guard.mjs`) runs before every Bash command and GitHub tool call and blocks pushes to `main`, force pushes, deleting other remote branches, merges and starting Promote.

## Checks

| Date | What | Result |
|---|---|---|
| 2026-10-18 | Playwright browser download with the default network list | Blocked (`cdn.playwright.dev`); needs the allowed domains above |
| 2026-10-18 | Unit tests and typecheck in a cloud session | Pass |
| 2026-10-18 | Desktop e2e in a cloud session, on the older pre-installed Chromium | Pass |
| 2026-10-18 | Session start in a fresh session on this environment (Task 15 of [[TaskApp factory build plan]]) | The hook installed Chromium 1248 and WebKit 2370 (with apt deps). Hook 4m00s (pnpm install ~1m20s, apt ~20s, browsers ~1m30s); container start to first prompt ~4m15s. Under the 5-minute bar, so the install stays in the hook |
| 2026-10-18 | `pnpm typecheck` | Pass, 0 errors (1m00s) |
| 2026-10-18 | `pnpm test` | Pass, 692 tests in 41 files (39s) |
| 2026-10-18 | `pnpm e2e`, both projects | Pass, 157 passed, 0 failed, 97 skipped (desktop 97 passed / 30 skipped, iphone 60 / 67; the skips are the other device's tests). WebKit works in the sandbox. 7m02s |
| 2026-10-18 | `pnpm --filter web build` | Pass (29s) |
| 2026-10-18 | Superpowers plugin loads from `.claude/settings.json` | No. No `superpowers:*` skills and nothing in `~/.claude/plugins/installed_plugins.json`, though the marketplace repo is reachable. Cloud sessions don't install project-declared plugins. AL chose to do without them; the plugin entries were removed from the settings (2026-10-19) |
| 2026-10-18 | Live guard check: `git push origin HEAD:main` | Blocked by the guard hook: `Blocked by the TaskApp guard: push to main.` Remote `main` unchanged |
