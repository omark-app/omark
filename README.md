# TaskApp

A small task app that keeps your tasks in plain Markdown files on your own OneDrive (`tasks.md`, `done.md`, `config.yaml`). It is a Svelte 5 + TypeScript PWA with a list view and a week board, works offline, and the files stay editable in Obsidian or by Claude Code.

Monorepo: `packages/core` (parsing and logic), `packages/storage` (OneDrive and sign-in), `apps/web` (the app), `tools/todoist-import`.

## Setup

Node 22 or newer and pnpm 10, then `pnpm i`.

## Environment variables

| name | used for |
| --- | --- |
| `VITE_STORAGE` | `onedrive` (default) or `fake` (in-memory drive, used by the tests) |
| `VITE_ONEDRIVE_FOLDER` | OneDrive folder holding the files; default `ALAI/TaskApp` |
| `VITE_MSAL_CLIENT_ID` | Entra app (client) ID. Put it in `apps/web/.env.local` (git-ignored) for local runs; CI reads the repo variable `MSAL_CLIENT_ID` |
| `TODOIST_TOKEN` | Todoist API token for the import; read from the environment, never written anywhere |
| `TASKAPP_E2E_STATE` | where the real-OneDrive smoke keeps its signed-in browser state; default `C:\Users\<you>\.secrets\taskapp-e2e-state.json` (outside the repo, it holds tokens) |

## One-time setup already done

- Entra app registration "TaskApp" in my own tenant, personal Microsoft accounts only, as a single-page app with redirect URIs `https://tasks.alipka.com/` and `http://localhost:5173/`. Scope used: `Files.ReadWrite`. Another origin (for example `pnpm dev` on a different port) needs its own `<origin>/` URI added.
- Cloudflare Pages project with the custom domain `tasks.alipka.com`. GitHub Actions deploys it using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the repository variable `MSAL_CLIENT_ID`.

## Sign-in

The app signs in with your personal Microsoft account and keeps the tokens in the browser. Entra limits a single-page app's refresh token to 24 hours, and Safari (the iPhone home-screen app) and Brave block the hidden renewal that would otherwise extend it, so expect "sign in needed" about once a day on those browsers. Signing in again names your account, so it is usually a quick redirect without the account picker. Edits made meanwhile stay in the browser's offline copy and are uploaded after you sign in.

## Commands

| command | what it does |
| --- | --- |
| `pnpm dev` (in `apps/web`) | dev server on http://localhost:5173 |
| `pnpm test` | unit tests |
| `pnpm typecheck` | type checks |
| `pnpm e2e` | browser tests on a fake drive |
| `pnpm e2e:real:login` | once: opens a browser, you sign in, the state is saved to `TASKAPP_E2E_STATE` |
| `pnpm e2e:real` | smoke test on the real OneDrive, folder `ALAI/TaskApp-e2e`; by hand only, never in CI |

Build and deploy: push to `main`; CI runs the checks and deploys to Cloudflare Pages.

## Real-OneDrive smoke

`pnpm e2e:real` builds the app with `VITE_STORAGE=onedrive` and `VITE_ONEDRIVE_FOLDER=ALAI/TaskApp-e2e`, serves it on http://localhost:5173 (stop `pnpm dev` first, the port must be free), adds and completes one task and adds and deletes another, and reads `tasks.md` and `done.md` back through Graph. It removes its own lines afterwards. The saved sign-in expires after about 24 hours (SPA refresh tokens), so `pnpm e2e:real:login` is usually needed before `pnpm e2e:real`. The smoke leaves the `ALAI/TaskApp-e2e` folder and its files behind (only the task lines are removed). Without the saved state it stops with a message to run `pnpm e2e:real:login`.

Real-OneDrive smoke last passed: (not yet run)

## Todoist import

One-time import of open tasks into `tasks.md`:

```
pnpm --filter todoist-import start -- --out <path> [--force]
```

The token is read from `TODOIST_TOKEN`. Review the warnings it prints.

## Claude Code skill

The repo ships a skill, `.claude/skills/taskapp-files/`, that teaches Claude Code the formats of `tasks.md`, `done.md` and `config.yaml`. Inside this repo Claude Code picks it up automatically. To use it from any project, copy the folder into your personal skills directory:

- macOS / Linux: copy `.claude/skills/taskapp-files/` to `~/.claude/skills/taskapp-files/`
- Windows: copy it to `C:\Users\<you>\.claude\skills\taskapp-files\`

Re-copy after the skill changes.
