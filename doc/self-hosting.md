# Self-hosting

How to run your own copy of Omark Tasks on Cloudflare Pages, with your own Microsoft and Google sign-in. Everything here is free: Cloudflare Pages Free, a Microsoft Entra app registration and a Google Cloud OAuth client cost nothing.

You don't need any of this to try or develop the app: `pnpm demo` runs it with sample data and no sign-in ([CONTRIBUTING.md](../CONTRIBUTING.md)). Omark Time's hosting notes come with the app.

## What you'll set up

| Piece | What for |
|---|---|
| A fork of this repository | GitHub Actions builds, tests and deploys from it |
| Cloudflare Pages projects | Production, staging and (optionally) a demo. Each one serves the app's static files and the sign-in helper at `/api/auth/*` |
| A Microsoft Entra app registration | Sign-in with a Microsoft account and access to OneDrive |
| A Google Cloud OAuth client (optional) | Sign-in with Google and access to Google Drive |

## 1. Microsoft sign-in (Entra)

1. In the [Entra admin center](https://entra.microsoft.com), App registrations → New registration. Pick the account types you want: "Personal Microsoft accounts only" matches the default tenant, `consumers`.
2. Authentication → Add a platform → **Web**. Redirect URI: `https://<your host>/api/auth/callback`, one per host that signs in. For local sign-in add `http://localhost:5173/api/auth/callback`. Leave the implicit-grant boxes unticked.
3. Certificates & secrets → New client secret. Copy the **Value** (not the Secret ID) at once; it is shown only once. Note the expiry date.
4. API permissions are asked for at sign-in: `Files.ReadWrite.AppFolder offline_access openid profile`. OneDrive keeps the files in `Apps/<your app's display name>`. With the Pages variable `ONEDRIVE_SCOPE=full` (and the matching `TASKS_ONEDRIVE_SCOPE`) it asks for `Files.ReadWrite` instead, the whole drive, and folders start at the drive's root. Every environment should have its own registration, so staging can never touch production's files.

## 2. Google sign-in (optional)

An OAuth client of type "Web application" in a Google Cloud project, with the Google Drive API enabled and the `drive.file` scope on its consent screen (the app sees only files it created).

1. Redirect URIs: `https://<host>/api/auth/callback` for each host that offers Google, and `http://localhost:8788/api/auth/callback` for local runs. `pnpm dev:signin` uses port 5173, so add `http://localhost:5173/api/auth/callback` as well.
2. Set the secrets from the client's JSON file without printing it (adjust the path and project):

   ```
   node -p "require('./google-client.json').web.client_id" | pnpm exec wrangler pages secret put GOOGLE_CLIENT_ID --project-name=<project>
   node -p "require('./google-client.json').web.client_secret" | pnpm exec wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=<project>
   ```

Only a Pages project that has both secrets lists Google at `/api/auth/providers`, so only there the app offers "Sign in with Google". Google's consent screen starts with the Drive box unticked; a sign-in without it is refused (`signin_error=scope`). Drive keeps the files in one My Drive folder: `Omark Tasks`, or `Omark Tasks Staging` on staging.

## 3. Cloudflare Pages

1. Create a Pages project per environment (for example `my-tasks` and `my-tasks-staging`), or let CI create them: `tools/ci/ensure-pages-project.mjs` makes any that are missing.
2. Set the sign-in helper's secrets on each project. From a checkout with `pnpm i` done and `pnpm exec wrangler login`:

   ```
   pnpm exec wrangler pages secret put MSAL_CLIENT_ID --project-name=<project>
   pnpm exec wrangler pages secret put MSAL_CLIENT_SECRET --project-name=<project>
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   pnpm exec wrangler pages secret put COOKIE_KEY --project-name=<project>
   ```

   Paste the Entra client ID, the secret's Value, and the 44-character line the `node` command printed. Keep no copy of `COOKIE_KEY`; changing it signs every device out. Secrets apply to deployments made after they are set.
3. Optional Pages variables: `MSAL_TENANT` (default `consumers`), `ONEDRIVE_SCOPE` (`full` asks for the whole drive; default is the app folder), `OMARK_APP` (which app the helper serves; default `tasks`).
4. Add your custom domain to each project in the Cloudflare dashboard, or let CI do it for staging (`TASKS_STAGING_DOMAIN` and `CF_TASKS_ZONE_ID` below).

## 4. GitHub Actions

In your fork, Settings → Secrets and variables → Actions.

**Secrets:** `CLOUDFLARE_API_TOKEN` (a token that can edit Pages) and `CLOUDFLARE_ACCOUNT_ID`.

**Variables:** `DEPLOY_ENABLED` = `true` turns on every deploy job. Without it, CI only checks and tests. Then, per app (named `TASKS_*` for Tasks):

| Variable | Meaning |
|---|---|
| `CF_TASKS_PROD_PROJECT`, `CF_TASKS_STAGING_PROJECT` | The Pages projects for production and staging |
| `TASKS_PROD_URL`, `TASKS_STAGING_URL` | Their addresses; CI checks that `/api/auth/login` redirects to the sign-in after each deploy |
| `TASKS_PROD_HOST`, `TASKS_STAGING_HOST` | The hosts the app treats as production and staging (they become `VITE_PROD_HOST`, `VITE_STAGING_HOST`) |
| `TASKS_PREVIEW_HOST_SUFFIXES` | Host suffixes that are previews, comma-separated |
| `TASKS_PROD_FOLDER`, `TASKS_STAGING_FOLDER` | OneDrive folders production and staging read, inside the app folder (from the drive's root with the `full` scope); empty means the app folder's root |
| `TASKS_ONEDRIVE_SCOPE`, `TASKS_MSAL_TENANT` | Must match the Pages variables `ONEDRIVE_SCOPE` and `MSAL_TENANT`; CI fails the deploy when the helper grants another scope |
| `TASKS_STAGING_DOMAIN`, `CF_TASKS_ZONE_ID` | Optional: staging's custom domain and its Cloudflare zone, set up by CI |
| `CF_TASKS_DEMO_PROJECT`, `TASKS_DEMO_URL` | Optional: a public demo's Pages project and address |
| `TASKS_REAL_USE_URL` | Where the demo's "Use it for real" link goes |
| `CF_SITE_PROJECT`, `SITE_URL` | Only for the omark.app landing page |

Each `TASKS_*_URL` must be `https://` followed by the matching `TASKS_*_HOST`; CI and Promote refuse to deploy otherwise.

`.env.example` at the repository root lists every variable the repo reads, with a line on each.

## 5. Deploy

| | When | Data |
|---|---|---|
| Preview | Every push to a pull request from the repository itself (not from forks) | The demo build: sample tasks in the browser, no sign-in, "PREVIEW" in the footer. The link is posted on the PR |
| Staging | Every merge to `main` | Real storage, staging's own folder; "STAGING" in the footer |
| Production | By hand: Actions → **Promote to production** → Run workflow | Real storage |
| Demo | Every merge to `main`, with staging | Sample tasks in the visitor's browser, no sign-in |

Staging and production run the same build. The app picks its environment from the host name (`apps/tasks/src/lib/environment.ts`).

**Promote** asks which app and which commit (empty means what staging runs now). It refuses a commit that isn't on `main` with a passing CI run. It deploys the build staging ran (or rebuilds it if that build expired after 30 days), tags it `tasks-prod-YYYY-MM-DD-n`, and creates a release listing the pull requests merged since the last one.

**Rollback:** run Promote with an older `tasks-prod-` tag. Cloudflare's dashboard rollback also works.

The demo is its own build (`VITE_STORAGE=demo`) without the sign-in helper; CI checks after each deploy that the page loads and `/api/auth` is absent (`tools/ci/check-demo.mjs`).

## Running it locally with sign-in

`pnpm dev` and `pnpm demo` run the demo, with no sign-in. To sign in locally:

1. Put the helper's secrets in `.dev.vars` at the repository root (git-ignored), one `NAME=value` per line: `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET`, `COOKIE_KEY`, and the Google ones if you use Google.
2. Put `VITE_STORAGE=onedrive` in `apps/tasks/.env.development.local`.
3. `pnpm dev:signin` builds the app and serves it with the helper on http://localhost:5173 (`wrangler pages dev`). The localhost redirect URIs from sections 1 and 2 must be registered.

## Keeping it running

- **Client secret expiry.** When the Entra secret expires, token refresh fails with `invalid_client`: the app reads "offline", and the Pages Functions log shows `invalid_client`. Make a new secret, set `MSAL_CLIENT_SECRET`, and redeploy (Promote the current `tasks-prod-` tag again; for staging, re-run the last `main` CI run). Nobody needs to sign in again. Put a reminder in your calendar a month before it expires.
- **Signing a device out:** `fetch('/api/auth/logout', { method: 'POST', headers: { 'X-TaskApp-Auth': '1' } })` in its console, or clear the site's cookies.
- **Each device signs in once.** On the iPhone, open the home-screen app itself and sign in there: it has its own cookies, separate from Safari.
- **Real-OneDrive smoke test**, by hand only, never in CI:
  1. `pnpm e2e:real:login` once: a browser opens, you sign in, and the state is saved to `TASKAPP_E2E_STATE` (default `C:\Users\<you>\.secrets\taskapp-e2e-state.json`, outside the repo, because it holds tokens). It lasts 90 days from its last use. The first run after a scope change needs it again.
  2. Stop `pnpm dev` (the port must be free), then `pnpm e2e:real`. It builds the app with `VITE_STORAGE=onedrive` and the folder `TaskApp-e2e` (`TASKAPP_E2E_FOLDER`) inside the app folder, serves it with the helper on port 5173 (secrets from `.dev.vars`), adds and completes one task, adds and deletes another, and reads `tasks.md` and `done.md` back through Graph.
  3. It removes its own lines but leaves the folder and files behind. Without the saved state it stops and tells you to run `pnpm e2e:real:login`.
- **Google Drive on staging**, by hand: sign in with Google (Drive box ticked), add a task, look in `My Drive/Omark Tasks Staging`, then edit `tasks.md` through Google Drive for desktop and check that the app merges it.

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
- Pages projects `taskapp` (production, https://tasks.alipka.com) and `taskapp-staging` (staging and previews, https://tasks-staging.alipka.com); `omark-tasks-demo` for https://demo-tasks.omark.app, whose domain was set up by hand.
- Production reads OneDrive `ALAI/TaskApp` with the whole-drive scope (`ONEDRIVE_SCOPE=full`), staging `ALAI/TaskApp-staging`. **Refresh staging:** copy the files from `ALAI/TaskApp` over `ALAI/TaskApp-staging` on the PC.
- Rollback to before the monorepo move: Promote an old `prod-` tag.
