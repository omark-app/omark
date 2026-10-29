# Self-hosting

How to run your own copy of Omark (the one app in `apps/omark`: Tasks, Time and Goals) on Cloudflare Pages, with your own Microsoft and Google sign-in. Everything here is free: Cloudflare Pages Free, a Microsoft Entra app registration and a Google Cloud OAuth client cost nothing.

You don't need any of this to try or develop the app: `pnpm --filter omark dev` runs it on your machine, and the demo build (`VITE_STORAGE=demo`) has made-up data and no sign-in ([CONTRIBUTING.md](../CONTRIBUTING.md)).

## What you'll set up

| Piece | What for |
|---|---|
| A fork of this repository | GitHub Actions builds, tests and deploys from it |
| Cloudflare Pages projects | Production, staging and (optionally) a demo. Production and staging serve the app's static files and the sign-in helper at `/api/auth/*` (`apps/omark/functions/`); the demo has no helper |
| A Microsoft Entra app registration per environment | Sign-in with a Microsoft account and access to OneDrive |
| A Google Cloud OAuth client (optional) | Sign-in with Google, Google Drive, and the calendar for Omark Time |

## 1. Microsoft sign-in (Entra)

1. In the [Entra admin center](https://entra.microsoft.com), App registrations → New registration. Pick the account types you want: "Personal Microsoft accounts only" matches the default tenant, `consumers`.
2. Authentication → Add a platform → **Web**. Redirect URI: `https://<your host>/api/auth/callback`, one per host that signs in. For local sign-in add `http://localhost:5173/api/auth/callback`. Leave the implicit-grant boxes unticked.
3. Certificates & secrets → New client secret. Copy the **Value** (not the Secret ID) at once; it is shown only once. Note the expiry date.
4. API permissions are asked for at sign-in: `Files.ReadWrite.AppFolder offline_access openid profile`. OneDrive keeps the files in `Apps/<the registration's display name>`, so name production's "Omark" and staging's "Omark Staging": each environment has its own registration, and staging can never touch production's files.

## 2. Google sign-in (optional)

An OAuth client of type "Web application" in a Google Cloud project, with the Google Drive and Google Calendar APIs enabled. Its consent screen lists `drive.file` (the app sees only files it created) and, for Omark Time, `calendar.calendarlist.readonly`, `calendar.events.owned.readonly` and `calendar.events.owned`. The app asks for each only when it needs it: Drive at sign-in with Google storage, the calendar read scopes when Time is turned on, edit access only when colouring is.

1. Redirect URIs: `https://<host>/api/auth/callback` for each host that offers Google, and `http://localhost:5173/api/auth/callback` for local runs.
2. Set the secrets from the client's JSON file without printing it (adjust the path and project):

   ```
   node -p "require('./google-client.json').web.client_id" | pnpm exec wrangler pages secret put GOOGLE_CLIENT_ID --project-name=<project>
   node -p "require('./google-client.json').web.client_secret" | pnpm exec wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=<project>
   ```

Only a Pages project that has both secrets lists Google at `/api/auth/providers`, so only there the app offers "Sign in with Google". Drive keeps the files in one My Drive folder: `Omark` in production, `Omark Staging` everywhere else.

## 3. Cloudflare Pages

1. Create a Pages project per environment (for example `my-omark`, `my-omark-staging` and `my-omark-demo`), or let CI create them: `tools/ci/ensure-pages-project.mjs` makes any that are missing.
2. Set the sign-in helper's secrets on production and staging. From a checkout with `pnpm i` done and `pnpm exec wrangler login`:

   ```
   pnpm exec wrangler pages secret put MSAL_CLIENT_ID --project-name=<project>
   pnpm exec wrangler pages secret put MSAL_CLIENT_SECRET --project-name=<project>
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   pnpm exec wrangler pages secret put COOKIE_KEY --project-name=<project>
   ```

   Paste the Entra client ID, the secret's Value, and the 44-character line the `node` command printed. Keep no copy of `COOKIE_KEY`; changing it signs every device out. Secrets apply to deployments made after they are set.
3. Optional Pages variable: `MSAL_TENANT` (default `consumers`).
4. Add your custom domain to each project in the Cloudflare dashboard.

## 4. GitHub Actions

In your fork, Settings → Secrets and variables → Actions.

**Secrets:** `CLOUDFLARE_API_TOKEN` (a token that can edit Pages) and `CLOUDFLARE_ACCOUNT_ID`.

**Variables:** `DEPLOY_ENABLED` = `true` turns on every deploy job. Without it, CI only checks and tests. Then:

| Variable | Meaning |
|---|---|
| `CF_APP_PROJECT`, `CF_APP_STAGING_PROJECT` | The Pages projects for production and staging (staging also holds the PR previews) |
| `APP_PROD_HOST`, `APP_STAGING_HOST` | The hosts the app treats as production and staging (they become `VITE_PROD_HOST`, `VITE_STAGING_HOST`) |
| `APP_PROD_URL`, `APP_STAGING_URL` | Their addresses: `https://` followed by the host. CI checks the sign-in helper there after each deploy |
| `APP_PREVIEW_HOST_SUFFIXES` | Host suffixes that are previews, comma-separated, such as `my-omark-staging.pages.dev` |
| `APP_MSAL_TENANT` | Optional: must match the Pages variable `MSAL_TENANT`; empty means `consumers` |
| `CF_DEMO_PROJECT`, `DEMO_URL` | Optional: a public demo's Pages project and address |
| `REAL_USE_URL` | Where the demo's "Use it for real" link goes |
| `CF_SITE_PROJECT`, `SITE_URL` | Only for the omark.app landing page |

CI and Promote refuse to deploy when a `*_URL` isn't `https://` followed by its host. `.env.example` at the repository root lists every variable the repo reads, with a line on each.

## 5. Deploy

| | When | Data |
|---|---|---|
| Preview | Every push to a pull request from the repository itself (not from forks) | The demo build: made-up data in the browser, no sign-in, "PREVIEW" in the footer. The link is posted on the PR |
| Staging | Every merge to `main` | Real storage, staging's own folder |
| Production | By hand: Actions → **Promote to production** → Run workflow | Real storage |
| Demo | Every merge to `main`, with staging | Made-up data in the visitor's browser, no sign-in |

Staging and production run the same build. The app picks its environment from the host name (`apps/tasks/src/lib/environment.ts`).

**Promote** asks which app (`omark`; `tasks` is the bridge below) and which commit (empty means what staging runs now). It refuses a commit that isn't on `main` with a passing CI run, or whose run never made the app's build (`omark-dist`), because then staging never ran it. It deploys the build staging ran (or rebuilds it if that build expired after 30 days), checks the sign-in helper, tags it `omark-prod-YYYY-MM-DD-n`, and creates a release.

**Rollback:** run Promote with an older `omark-prod-` tag. Cloudflare's dashboard rollback also works.

The demo is its own build (`VITE_STORAGE=demo`), deployed from inside `apps/omark/dist` so the sign-in helper stays out; CI checks after each deploy that the page loads and `/api/auth` is absent (`tools/ci/check-demo.mjs`).

## Running it locally with sign-in

`pnpm dev` and `pnpm demo` run the bridge Tasks build's demo, with no sign-in. Local sign-in still runs that build (`apps/tasks`) until roadmap 3.7:

1. Put the helper's secrets in `.dev.vars` at the repository root (git-ignored), one `NAME=value` per line: `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET`, `COOKIE_KEY`, and the Google ones if you use Google.
2. Put `VITE_STORAGE=onedrive` in `apps/tasks/.env.development.local`.
3. `pnpm dev:signin` builds the app and serves it with the helper on http://localhost:5173 (`wrangler pages dev`). The localhost redirect URIs from sections 1 and 2 must be registered.

## Keeping it running

- **Client secret expiry.** When the Entra secret expires, token refresh fails with `invalid_client`: the app reads "offline", and the Pages Functions log shows `invalid_client`. Make a new secret, set `MSAL_CLIENT_SECRET`, and redeploy (Promote the current `omark-prod-` tag again; for staging, re-run the last `main` CI run). Nobody needs to sign in again. Put a reminder in your calendar a month before it expires.
- **Signing a device out:** `fetch('/api/auth/logout', { method: 'POST', headers: { 'X-TaskApp-Auth': '1' } })` in its console, or clear the site's cookies.
- **Each device signs in once.** On the iPhone, open the home-screen app itself and sign in there: it has its own cookies, separate from Safari.
- **Real-OneDrive smoke test**, by hand only, never in CI:
  1. `pnpm e2e:real:login` once: a browser opens, you sign in, and the state is saved to `TASKAPP_E2E_STATE` (default `C:\Users\<you>\.secrets\taskapp-e2e-state.json`, outside the repo, because it holds tokens). It lasts 90 days from its last use. The first run after a scope change needs it again.
  2. Stop `pnpm dev` (the port must be free), then `pnpm e2e:real`. It builds the app with `VITE_STORAGE=onedrive` and the folder `TaskApp-e2e` (`TASKAPP_E2E_FOLDER`) inside the app folder, serves it with the helper on port 5173 (secrets from `.dev.vars`), adds and completes one task, adds and deletes another, and reads `tasks.md` and `done.md` back through Graph.
  3. It removes its own lines but leaves the folder and files behind. Without the saved state it stops and tells you to run `pnpm e2e:real:login`.
- **Google Drive on staging**, by hand: sign in with Google (Drive box ticked), add a task, look in `My Drive/Omark Staging/tasks`, then edit `tasks.md` through Google Drive for desktop and check that the app merges it.

## The sign-in helper's endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/auth/providers` | `{ providers: [...] }`: the providers whose secrets are set |
| `GET /api/auth/login` | Redirects to Microsoft (authorization code + PKCE); `?provider=google` for Google |
| `GET /api/auth/callback` | Checks the state, redeems the code, sets the session cookie, returns to `/` (on failure `/?signin_error=…`) |
| `POST /api/auth/token` | `{ accessToken, expiresAt }`, rotating the session cookie; 401 `{ signin: true }` means sign in again, 503 that the provider could not be reached |
| `POST /api/auth/logout` | Deletes the cookies |

The POST endpoints need the header `X-TaskApp-Auth: 1` and an `Origin` of the app itself. [architecture.md](architecture.md) explains the design and [SECURITY.md](../SECURITY.md) what each cookie holds.

## Until the cutover: the bridge deployment

The pre-Omark deployment keeps running until the founder's cutover to the hosted app (roadmap 3.6). Its values stay in CI's variables until then, and this section is removed with them (roadmap 3.7).

- Entra app "TaskApp" (client ID `1fa03c5b-4275-490e-8e71-2aa7a405e310`) in the founder's own tenant, personal accounts only. Its portal opens tenant-scoped at https://portal.azure.com/47bed4a7-e649-443a-b055-b54d901df272 (plain entra.microsoft.com opens the wrong tenant). Web redirect URIs: `https://tasks.alipka.com/api/auth/callback`, `https://tasks-staging.alipka.com/api/auth/callback` and `http://localhost:5173/api/auth/callback`. Its old SPA platform (`https://tasks.alipka.com/`, `http://localhost:5173/`) is kept so a rollback to an MSAL build can still sign in; remove it once that is no longer needed. Staging has its own client secret, `taskapp staging`.
- Pages projects `taskapp` (production, https://tasks.alipka.com) and `taskapp-staging` (staging, https://tasks-staging.alipka.com), deployed by CI's `tasks-staging` job and Promote's `tasks` with the `TASKS_*` repository variables (`.env.example`). Its OneDrive scope comes from `TASKS_ONEDRIVE_SCOPE` and the Pages variable `ONEDRIVE_SCOPE`, its helper from the root `functions/`.
- The old per-app hosts redirect to the one app (roadmap U.7): `demo-tasks.omark.app` and `demo-time.omark.app` to `demo.omark.app/tasks` and `/time`, `staging-time.omark.app` to `staging-app.omark.app/time`. Their Pages projects (`omark-tasks-demo`, `omark-time-demo`, `omark-time-staging`) serve only that redirect (`tools/ci/redirect-sites.mjs`) and are retired in roadmap 3.7.
- Production reads OneDrive `ALAI/TaskApp` with the whole-drive scope (`ONEDRIVE_SCOPE=full`), staging `ALAI/TaskApp-staging`. **Refresh staging:** copy the files from `ALAI/TaskApp` over `ALAI/TaskApp-staging` on the PC.
- Rollback to before the monorepo move: Promote an old `prod-` tag.
