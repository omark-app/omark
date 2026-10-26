# TaskApp

A small task app that keeps your tasks in plain Markdown files on your own OneDrive (`tasks.md`, `done.md`, `config.yaml`). It is a Svelte 5 + TypeScript PWA with a list view and a week board, works offline, and the files stay editable in Obsidian or by Claude Code.

Monorepo: `packages/tasks-core` (parsing and logic), `packages/storage` (OneDrive and the sign-in client), `packages/signin` (the sign-in helper, served from `functions/` as Cloudflare Pages Functions), `apps/tasks` (the Tasks app), `tools/todoist-import`, `tools/claude-guard` (the guard hook), `tools/ci` (CI helper scripts).

Work on the app runs through GitHub issues and pull requests, mostly done by Claude in cloud sessions: see `CLAUDE.md` and [the factory spec](doc/TaskApp%20factory%20spec.md).

## Setup

Node 22 or newer and pnpm 10, then `pnpm i`.

## Environment variables

| name | used for |
| --- | --- |
| `VITE_STORAGE` | `onedrive` (default) or `fake` (in-memory drive, used by the tests) |
| `VITE_ONEDRIVE_FOLDER` | OneDrive folder holding the files; default `''` (the app folder's root) |
| `VITE_PROD_HOST`, `VITE_STAGING_HOST` | the hosts that are production and staging; with neither set every host is `local` |
| `VITE_PREVIEW_HOST_SUFFIXES` | comma-separated host suffixes that are previews (a host matches itself or any subdomain) |
| `VITE_PROD_FOLDER`, `VITE_STAGING_FOLDER` | the OneDrive folders production and staging read |
| `VITE_ONEDRIVE_SCOPE` | `full` asks for the whole drive; anything else (the default) is the app folder |
| `ONEDRIVE_SCOPE`, `MSAL_TENANT` | Pages secrets, optional. `full` makes the sign-in helper ask for `Files.ReadWrite`, else `Files.ReadWrite.AppFolder` (default `appfolder`); the Entra tenant to sign in through (default `consumers`). They must match the build: CI fails the deploy when the helper grants another scope |
| Repository variables | read by the workflows (Settings → Secrets and variables → Actions → Variables): `DEPLOY_ENABLED` (`true` turns on every deploy job), and per app, named after it (`TASKS_*` for Tasks): `CF_TASKS_STAGING_PROJECT`, `CF_TASKS_PROD_PROJECT` (Cloudflare Pages projects), `TASKS_STAGING_URL`, `TASKS_PROD_URL` (sign-in checks), `TASKS_STAGING_DOMAIN` with `CF_TASKS_ZONE_ID` (optional: staging's custom domain and DNS), and `TASKS_PROD_HOST`, `TASKS_STAGING_HOST`, `TASKS_PREVIEW_HOST_SUFFIXES`, `TASKS_PROD_FOLDER`, `TASKS_STAGING_FOLDER`, `TASKS_ONEDRIVE_SCOPE`, `TASKS_MSAL_TENANT`, which become the `VITE_*` build variables and the sign-in check. Forks have no secrets, so for them only the checks and e2e run |
| `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET`, `COOKIE_KEY` | the sign-in helper's secrets: Entra app (client) ID, its client secret, and 32 random bytes (base64) that encrypt the session cookie. Set on Cloudflare Pages with `wrangler pages secret put` (see Sign-in); for local runs put them in `.dev.vars` at the repo root (git-ignored), one `NAME=value` per line |
| `TODOIST_TOKEN` | Todoist API token for the import; read from the environment, never written anywhere |
| `TASKAPP_E2E_STATE` | where the real-OneDrive smoke keeps its signed-in browser state; default `C:\Users\<you>\.secrets\taskapp-e2e-state.json` (outside the repo, it holds tokens) |
| `TASKAPP_E2E_FOLDER` | the folder the real-OneDrive smoke uses, inside the app folder; default `TaskApp-e2e` |

## One-time setup already done

- Entra app registration "TaskApp" (client ID `1fa03c5b-4275-490e-8e71-2aa7a405e310`) in my own tenant, personal Microsoft accounts only. It was registered as a single-page app with redirect URIs `https://tasks.alipka.com/` and `http://localhost:5173/`; the sign-in helper needs a **Web** platform as well (see Sign-in). Scopes used: `Files.ReadWrite.AppFolder offline_access` by default, `Files.ReadWrite offline_access` for the whole drive with `ONEDRIVE_SCOPE=full` (plus `openid profile` at sign-in, for the account name).
- Cloudflare Pages project `taskapp` with the custom domain `tasks.alipka.com` (production), and `taskapp-staging` with `tasks-staging.alipka.com` (staging and PR previews; CI creates it if missing, `tools/ci/ensure-staging.mjs`). GitHub Actions deploys both using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Sign-in

The app signs in with your personal Microsoft account through a small sign-in helper on its own origin (`/api/auth/*`, Cloudflare Pages Functions in `functions/`, code in `packages/signin`). The helper signs in as a confidential web app, so Microsoft's refresh token lasts 90 days instead of a single-page app's 24 hours; it is kept in an encrypted HttpOnly cookie that only `/api/auth/token` receives, and every refresh replaces it and restarts the 90 days. The app only ever sees short-lived Graph access tokens. Nothing is stored on the server. So each device signs in once and stays signed in as long as the app is opened at least every 90 days (or until the Microsoft password changes or the app's access is revoked). Edits made while signed out stay in the browser's offline copy and are uploaded after you sign in.

| endpoint | what it does |
| --- | --- |
| `GET /api/auth/login` | redirects to Microsoft (authorization code + PKCE, `login_hint` from the last sign-in); state and verifier wait in a 10-minute encrypted cookie |
| `GET /api/auth/callback` | checks the state, redeems the code with the client secret, sets the session cookie, returns to `/` (on failure `/?signin_error=…`, which the app shows) |
| `POST /api/auth/token` | `{ accessToken, expiresAt }`, rotating the session cookie; 401 `{ signin: true }` means sign in again, 503 means Microsoft could not be reached |
| `POST /api/auth/logout` | deletes the cookies |

The POST endpoints need the header `X-TaskApp-Auth: 1` and an `Origin` of the app itself.

### Before the first deploy with the sign-in helper

Do these before merging to `main` (the merge deploys to production, and the app cannot sign in until all of it is done):

1. **Entra portal.** Open it tenant-scoped at https://portal.azure.com/47bed4a7-e649-443a-b055-b54d901df272 (plain entra.microsoft.com opens the wrong tenant). App registrations → TaskApp → Authentication → Add a platform → **Web**, redirect URI `https://tasks.alipka.com/api/auth/callback`. Leave the implicit-grant boxes unticked. For the real-OneDrive smoke, add `http://localhost:5173/api/auth/callback` to the same Web platform. Do not add `https://taskapp-64g.pages.dev/api/auth/callback`: the app is used at tasks.alipka.com, every origin has its own cookies and offline copy, so signing in on pages.dev would only make a second, separate copy, and each extra redirect URI is one more place a sign-in code can be sent. Add it later only if pages.dev ever has to stand in for the custom domain.
2. Still in TaskApp: Certificates & secrets → Client secrets → New client secret, description `taskapp pages`, expires **24 months**. Copy the **Value** (not the Secret ID) at once; it is shown only once. Put a reminder in your calendar about a month before it expires (see below).
3. **Pages secrets.** From any checkout with `pnpm i` done, logged in with `pnpm exec wrangler login` (or with `CLOUDFLARE_API_TOKEN` set):

   ```
   pnpm exec wrangler pages secret put MSAL_CLIENT_ID --project-name=taskapp
   # paste 1fa03c5b-4275-490e-8e71-2aa7a405e310
   pnpm exec wrangler pages secret put MSAL_CLIENT_SECRET --project-name=taskapp
   # paste the secret Value from step 2
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   pnpm exec wrangler pages secret put COOKIE_KEY --project-name=taskapp
   # paste the 44-character line it printed
   pnpm exec wrangler pages secret list --project-name=taskapp
   ```

   These go to the production environment, which is what `--branch=main` deploys. Secrets apply to deployments made after they are set, so set them before merging. Keep no copy of `COOKIE_KEY`; it never needs to be read back.
4. **Merge.** CI deploys, then checks that `https://tasks.alipka.com/api/auth/login` redirects to Microsoft; if that step fails, a secret is missing or the functions did not ship.
5. **Each device signs in once:** open the app, "Sign in with Microsoft". On the iPhone, open the home-screen app itself and sign in there (it has its own cookies, separate from Safari).

The SPA platform with `https://tasks.alipka.com/` and `http://localhost:5173/` can stay registered: the helper never uses it, and keeping it lets a rollback to an MSAL build still sign in. Remove it once the helper has run for a while, so the registration no longer allows a browser-only sign-in with 24-hour tokens. The old MSAL cache in localStorage needs no clearing by hand: the new build deletes its `msal.` entries on first start.

### Later

- **Staging** signs in the same way, on its own origin, with its own Web redirect URI `https://tasks-staging.alipka.com/api/auth/callback`, its own client secret (`taskapp staging`) and its own three Pages secrets on `taskapp-staging` (step 3 with `--project-name=taskapp-staging`). Its CI deploy checks `https://tasks-staging.alipka.com/api/auth/login` the same way.
- **Client secret expiry.** When the secret expires, the token refresh fails with `invalid_client`: the app reads "offline" and the Pages Functions log shows `invalid_client`. Make a new secret (step 2), set it (step 3, `MSAL_CLIENT_SECRET` only) and redeploy (run Promote to production again with the current `tasks-prod-` tag; for staging, re-run the last `main` CI run); nobody needs to sign in again.
- **Changing `COOKIE_KEY`** signs every device out.
- **Signing out** a device: `fetch('/api/auth/logout', { method: 'POST', headers: { 'X-TaskApp-Auth': '1' } })` in its console, or clear the site's cookies.
- **Local sign-in:** `pnpm dev:signin` builds the app and serves it with the helper on http://localhost:5173 (`wrangler pages dev`, secrets from `.dev.vars`, and the localhost Web redirect URI from step 1). `pnpm dev` (plain Vite) has no `/api/auth`, so use it with `VITE_STORAGE=fake`.

## Commands

| command | what it does |
| --- | --- |
| `pnpm dev` (in `apps/tasks`) | dev server on http://localhost:5173 (no sign-in; use `VITE_STORAGE=fake`) |
| `pnpm dev:signin` | build and serve the app with the sign-in helper on http://localhost:5173 (needs `.dev.vars`) |
| `pnpm test` | unit tests |
| `pnpm typecheck` | type checks |
| `pnpm e2e` | browser tests on a fake drive |
| `pnpm e2e:real:login` | once: opens a browser, you sign in, the state is saved to `TASKAPP_E2E_STATE` |
| `pnpm e2e:real` | smoke test on the real OneDrive, folder `TaskApp-e2e` inside the app folder; by hand only, never in CI |

## Deploy

| | when | where | data |
| --- | --- | --- | --- |
| Preview | every push to a PR from this repository, once `DEPLOY_ENABLED` is `true` | `pr-<n>.taskapp-staging…pages.dev`, linked in a PR comment | fake drive with sample tasks, "PREVIEW" in the footer |
| Staging | every merge to `main`, once `DEPLOY_ENABLED` is `true` | https://tasks-staging.alipka.com | OneDrive `ALAI/TaskApp-staging`, "STAGING" in the footer |
| Production | by hand, once `DEPLOY_ENABLED` is `true`: Actions → **Promote to production** → Run workflow | https://tasks.alipka.com | OneDrive `ALAI/TaskApp` |

Staging and production run the same build: the app picks its OneDrive folder and look from the host name (`apps/tasks/src/lib/environment.ts`). Promote takes a commit (empty = what staging runs now), refuses it unless it is on `main` with a passing CI run, deploys the build staging ran (or rebuilds it once that build has expired after 30 days), and tags it `tasks-prod-YYYY-MM-DD-n` with a release listing the PRs merged since the last one. Promote asks which app; only `tasks` exists so far.

The Pages Function in `functions/` serves every app. It picks the app from the Pages variable `OMARK_APP`; unset means `tasks`. Each app's Pages project sets its own value.

**Rollback:** run Promote with an older `tasks-prod-` tag, or a `prod-` tag from before the monorepo move. Cloudflare's dashboard rollback also works.

**Refresh staging:** copy the files from `ALAI/TaskApp` over `ALAI/TaskApp-staging` on the PC.

## Real-OneDrive smoke

`pnpm e2e:real` builds the app with `VITE_STORAGE=onedrive` and `VITE_ONEDRIVE_FOLDER=TaskApp-e2e` (inside the app folder), serves it with the sign-in helper on http://localhost:5173 (`wrangler pages dev`, secrets from `.dev.vars` at the repo root; stop `pnpm dev` first, the port must be free), adds and completes one task and adds and deletes another, and reads `tasks.md` and `done.md` back through Graph. It removes its own lines afterwards. The saved sign-in (the helper's cookies) lasts 90 days from its last use. The smoke leaves the `TaskApp-e2e` folder and its files behind (only the task lines are removed). Without the saved state it stops with a message to run `pnpm e2e:real:login`. The first run after the move to the app folder needs `pnpm e2e:real:login` again, because the sign-in asks for new consent.

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
