# U.7: CI, hosts and redirects for the one app

Roadmap U.7. Builds [the one app spec](../suite/one-app-spec.md) section 10: one app build, one preview per PR, one staging deploy, one demo deploy, one Promote; the old per-app hosts redirect to their part's path. Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

- `staging-app.omark.app` runs the one app from `main` (real storage, `Apps/Omark Staging`, "Omark Staging" in Google Drive), with its sign-in helper.
- `demo.omark.app` runs Maya's demo world from `main`; `demo.omark.app/time` and `/goals` open those parts.
- `app.omark.app` gets the one app when the founder runs **Promote** with app `omark`.
- PR previews are the one app's demo build, saying PREVIEW.
- The old hosts redirect: `demo-tasks.omark.app` → `demo.omark.app/tasks`, `demo-time.omark.app` → `demo.omark.app/time`, `staging-time.omark.app` → `staging-app.omark.app/time`. A browser that installed the old app gets a service worker that removes itself and reloads, so it reaches the redirect.
- omark.app: the Tasks, Time and Goals cards link to their part in the demo; "Open" stays "Coming soon" until the cutover (3.6).
- The bridge (`tasks.alipka.com`, `tasks-staging.alipka.com`) is unchanged until 3.6.

## CI

| Job | When | Builds | Deploys to |
|---|---|---|---|
| `omark-preview` | Same-repo PR, after `check` | `apps/omark`, `VITE_STORAGE=demo` | `CF_APP_STAGING_PROJECT`, branch `pr-<n>`, comment with the link |
| `omark-staging` | `main`, after `check` and `e2e`, tip only | `apps/omark` with the hosts | `CF_APP_STAGING_PROJECT` from `apps/omark` (its `functions/` ships); artifact `omark-dist`; sign-in check |
| `omark-demo` | `main`, after `check` and `e2e`, tip only | `apps/omark`, `VITE_STORAGE=demo` | `CF_DEMO_PROJECT` from inside `apps/omark/dist`, so no `functions/`; `check-demo.mjs` |
| `tasks-staging` | as today | the bridge | unchanged until 3.6 |
| `site-*` | as today | | |

Retired: `tasks-preview`, `tasks-demo`, `time-preview`, `time-staging`.

**Promote** asks `omark` (default) or `tasks` (the bridge, until 3.7). A first step picks the app's variables; `promote-check.mjs` already handles `apps/omark` and `omark-dist`. Tags `omark-prod-YYYY-MM-DD-n`.

**Sign-in check** (`tools/ci/check-omark-signin.mjs`): `/api/auth/login` goes to Microsoft for the tenant with `Files.ReadWrite.AppFolder`; `?provider=google` to Google with `drive.file` and no calendar; `?provider=googlecal` with the calendar read scopes and no Drive or edit.

**Repository variables** (new set; `TASKS_*` stay for the bridge only; Time's and the Tasks demo's are deleted):

| Variable | Value here |
|---|---|
| `CF_APP_PROJECT`, `CF_APP_STAGING_PROJECT`, `CF_DEMO_PROJECT` | `omark-app`, `omark-app-staging`, `omark-demo` |
| `APP_PROD_HOST`, `APP_STAGING_HOST` | `app.omark.app`, `staging-app.omark.app` |
| `APP_PROD_URL`, `APP_STAGING_URL`, `DEMO_URL` | their `https://` addresses |
| `APP_PREVIEW_HOST_SUFFIXES` | `omark-app-staging.pages.dev` |
| `APP_MSAL_TENANT` | empty (`consumers`) |
| `REAL_USE_URL` | `https://omark.app` |

## Redirects

`tools/ci/redirect-sites.mjs` writes, for each old Pages project, a tiny site: `_redirects` (`/sw.js` served from a kill-switch file, every other path 301 to the part's path) and that `sw.js`. Deployed once by hand to `omark-tasks-demo`, `omark-time-demo`, `omark-time-staging`; the projects themselves are retired in 3.7 (with a zone redirect rule if the hosts should keep redirecting).

## Steps (each test first)

1. `check-omark-signin.mjs` and its test.
2. `redirect-sites.mjs` and its test; deploy the three, check with curl.
3. `workflows.test.ts` for the new jobs, Promote and variables; then `ci.yml`, `promote.yml`.
4. Repository variables set; old ones deleted after the first green deploy.
5. Landing page (cards, Goals card, demo links), its e2e; README, SECURITY, privacy hosts.
6. Docs: `doc/self-hosting.md` for the one app, `doc/factory.md` environments, `.env.example`, `apps/site/README.md`, the one app spec 10 (built), roadmap U.7.
7. Push, watch CI: staging, demo and their checks green; curl the hosts.

## Acceptance

- `staging-app.omark.app` and `demo.omark.app` serve the one app from `main`; their checks pass in CI.
- The three old hosts answer 301 to their part's path; their `/sw.js` is the kill switch.
- Promote can deploy `omark` (run by the founder) and still `tasks`.
- `pnpm typecheck`, `pnpm test`, the builds and the site e2e pass.

## Risks

- **Pages `_redirects` and assets**: redirects win over files, so `/sw.js` needs its own rewrite rule first; checked on the live hosts.
- **Wrangler picking up `functions/`** for the demo: deployed from inside `dist`; `check-demo.mjs` fails the job if the helper is live.
- **Staging's Pages secrets**: if one is missing the sign-in check fails, which is the point; the fix is `.superpowers/u2-setup.ps1`.

## Out of scope

Deleting the old Pages projects, DNS records and Google project (3.7). The one app's STAGING look (title, colour). Redirecting `tasks.alipka.com` (3.6).

## What was built

- `tools/ci/check-omark-signin.mjs` (Microsoft app folder, Google `drive.file` only, `googlecal` calendar read only), used by `omark-staging` and Promote's `omark`. `check-google-signin.mjs` (standalone Time) removed with `time-staging`.
- `ci.yml`: `omark-preview`, `omark-staging` (artifact `omark-dist`, deployed from `apps/omark`), `omark-demo` (deployed from inside `apps/omark/dist`); `tasks-staging` stays as the bridge in its own `bridge-staging` group; `tasks-preview`, `tasks-demo`, `time-preview`, `time-staging` gone. `apps/omark` has the pinned `wrangler` so the deploy action runs there.
- `promote.yml`: `omark` (default) or `tasks`; the first step checks the chosen app's variables and writes its `VITE_*` for a rebuild; a deploy and a sign-in check per app.
- Repository variables `CF_APP_*`, `APP_*`, `CF_DEMO_PROJECT`, `DEMO_URL`, `REAL_USE_URL` set. The old Time and Tasks-demo variables are deleted once CI is green.
- Staging and the demo were first deployed by hand from this checkout, the same way CI does, and checked (`check-omark-signin.mjs`, `check-demo.mjs`).
- Redirects deployed to `omark-tasks-demo`, `omark-time-demo`, `omark-time-staging` and checked with curl: `/` answers 301 to the part, `/sw.js` is the retiring worker.
- Landing page: three cards (Tasks, Time, Goals) with "Try the demo" to `demo.omark.app/<part>` and "Open" coming soon; a Goals icon in the brand family (amber tile `#A84C08`, a dot in the ring); privacy, README and SECURITY name `app.` and `demo.omark.app`. The bridge Tasks build's "Try the demo" goes to `demo.omark.app/tasks`.
- Docs: `doc/self-hosting.md` for the one app, `doc/factory.md`, `.env.example`, `apps/site/README.md`, the one app spec 10, roadmap U.7 and 3.7.
