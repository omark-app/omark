# Milestone 1: groundwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take every value tied to AL's setup out of code and CI, make CI safe for forks, switch the default OneDrive access to the app folder, and rename the app to Omark Tasks, while `tasks.alipka.com` keeps working unchanged on bridge values.

**Architecture:** Staging and production keep sharing one build. The page's host still picks its environment and folder, but the hosts and folders now come from build variables (`VITE_*`, fed from repository variables in CI) instead of constants. The OneDrive root (app folder or whole drive) is chosen in two places that must agree: the client's Graph paths (`VITE_ONEDRIVE_SCOPE`) and the sign-in helper's scope (the `ONEDRIVE_SCOPE` Pages secret). A CI check after every deploy proves they agree. Jobs that need secrets run only in the main repo, and only when `vars.DEPLOY_ENABLED` is set.

**Tech Stack:** TypeScript, Svelte 5, Vite 8, Vitest, Playwright, Cloudflare Pages Functions, GitHub Actions, pnpm 10 workspaces.

**Spec:** [doc/TaskApp open source launch spec.md](../TaskApp%20open%20source%20launch%20spec.md), sections 6.1, 6.2, 6.6. Roadmap: [open-source-launch-roadmap.md](open-source-launch-roadmap.md), items 1.1–1.6.

**Branch and PR:** one issue ("Milestone 1: groundwork", `size:large`, `plan-approved` once AL approves this file), one branch, one PR. The tasks land together because the build variables (Task 1) only take effect once CI passes them (Task 3). Commit per task.

## Global Constraints

- **The four commands pass** before every commit that ends a task: `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter web build`.
- **Test first.** Each behaviour change starts with a failing test, and the PR quotes the failing line. Existing tests change only where this plan changes the behaviour they cover; the PR lists which ones.
- **AL's deployment behaves exactly as today**, with the bridge values from Task 6:
  - production `tasks.alipka.com` reads `ALAI/TaskApp`;
  - staging `tasks-staging.alipka.com` reads `ALAI/TaskApp-staging`;
  - both have whole-drive scope (`Files.ReadWrite`) and tenant `consumers`;
  - `taskapp-staging.pages.dev` and `taskapp-64g.pages.dev` (with subdomains) are previews.
- **Not renamed**, because renaming them would sign users out or orphan offline copies:
  - the cookies `taskapp_session*`, `taskapp_login`, `taskapp_hint`, `taskapp_signed_in`;
  - the header `X-TaskApp-Auth`;
  - the IndexedDB names `taskapp:<folder>` and `taskapp-cache`;
  - the localStorage keys `taskapp:*`;
  - the `window.__TASKAPP_*__` test hooks;
  - the file names `tasks.md`, `done.md`, `config.yaml`;
  - the doc file names (renamed in milestone 2).
- **New defaults:**
  - with no `VITE_PROD_HOST`, `VITE_STAGING_HOST` or `VITE_PREVIEW_HOST_SUFFIXES`, every host is `local`;
  - the folder is `''`;
  - the scope is the app folder (`Files.ReadWrite.AppFolder`);
  - the tenant is `consumers`.
- **No owner-specific value in code, tests or workflows** (`*.md` docs are rewritten in milestone 2). `grep -rniE "alipka|ALAI|alipkagit|47bed4a7|fabcb19d|00596fbc|taskapp-staging|taskapp-64g" --include=*.ts --include=*.mjs --include=*.js --include=*.svelte --include=*.yml --include=*.json --include=*.html --include=*.webmanifest --include=*.sh --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-real .` prints only the one bridge test in Task 1 and the `/alipka|ALAI/i` guard in `tools/ci/test/workflows.test.ts`.
- **Neutral test values:**
  - hosts `tasks.example.test` and `staging-tasks.example.test`;
  - preview suffix `tasks-preview.pages.dev`;
  - folders `Prod/Tasks` and `Prod/Tasks-staging`;
  - Cloudflare zone `zone1`, project `tasks-staging`;
  - repo `owner/repo`.
- **Third-party actions are pinned** to a full commit SHA with the tag as a comment. `actions/*` (first-party) may stay on tags.
- Plain, short English in comments and docs. Commits are short imperative sentences ending with the `Co-Authored-By` line. Never push to `main`, never merge.

## Review Focus

1. **An existing device's offline copy survives the update.** With the bridge values, production must resolve to exactly `ALAI/TaskApp`, so `IdbCache('taskapp:ALAI/TaskApp')` and `taskapp:synced-at:ALAI/TaskApp` are found again. The legacy-cache migration still runs there, and only there. Tests in Task 1.
2. **Helper and client disagree about scope.** For example, the Pages secret is missing on one project: the app would get 403s on every read. The post-deploy check must fail, naming both scopes, before Promote can ship it. Test in Task 3.
3. **Look-alike hosts** are never production or staging. That covers `tasks.example.test.evil.example`, `eviltasks.example.test`, `staging.tasks.example.test`, a trailing dot, upper case, the bare `pages.dev`, and an unlisted `*.pages.dev`. Tests in Task 1.
4. **A whole-drive build with an empty folder** would write `tasks.md` into the OneDrive root. The adapter refuses to start. Test in Task 2.
5. **A fork has no secrets.** Its PR to upstream, and its own push to `main`, must not run any step that needs secrets, and the e2e job must not need write access. Test in Task 3 (the workflow test), then Task 6's fork PR.

---

### Task 1: Host and folder config from build variables; brand module

**Files:**
- Create: `apps/web/src/brand.ts`
- Modify: `apps/web/src/lib/environment.ts` (whole file: constants become `HostConfig`)
- Modify: `apps/web/src/env.ts`
- Modify: `apps/web/src/vite-env.d.ts` (declare the new `VITE_*` variables)
- Modify: `apps/web/src/lib/boot.ts:12,186` (imports; legacy-cache check)
- Modify: `apps/web/playwright.config.ts:16` (webServer env), `apps/web/vite.config.ts:24` (`allowedHosts`)
- Test: `apps/web/src/lib/environment.test.ts` (rewritten with neutral values), `apps/web/e2e/environment.spec.ts`

**Interfaces:**
- Produces, in `environment.ts`:
  - `export interface HostConfig { prodHost: string; stagingHost: string; previewSuffixes: string[]; prodFolder: string; stagingFolder: string }`. An empty string means unset.
  - `export function hostConfig(vars: { readonly [key: string]: unknown }): HostConfig`. It takes `import.meta.env` directly, so it treats non-string values as unset. It reads `VITE_PROD_HOST`, `VITE_STAGING_HOST`, `VITE_PREVIEW_HOST_SUFFIXES` (comma-separated), `VITE_PROD_FOLDER` and `VITE_STAGING_FOLDER`. It trims each value, lower-cases the hosts and drops empty suffixes.
  - `export function envForHost(host: string, cfg: HostConfig): AppEnv`
  - `export function folderFor(env: AppEnv, buildFolder: string, cfg: HostConfig): string`
  - `export function legacyCacheApplies(folder: string, cfg: HostConfig): boolean`
  - `lookFor(env)` keeps its signature. Its staging title becomes `BRAND.stagingApp`.
- Produces, in `brand.ts`: `export const BRAND = { name: 'Omark', app: 'Omark Tasks', stagingApp: 'Omark Tasks Staging', domain: 'omark.app', contact: 'hello@omark.app', security: 'security@omark.app' } as const`
- Produces, in `env.ts`:
  - `export const HOSTS: HostConfig`
  - `APP_ENV` and `ONEDRIVE_FOLDER`, as today but computed with `HOSTS`. `ONEDRIVE_FOLDER` uses `import.meta.env.VITE_ONEDRIVE_FOLDER ?? ''`.
  - `DEFAULT_ONEDRIVE_FOLDER` is removed.

- [ ] **Step 1: Write the failing unit tests** in `environment.test.ts`, replacing the old ones. Use

```ts
const CFG = hostConfig({
  VITE_PROD_HOST: 'tasks.example.test', VITE_STAGING_HOST: 'staging-tasks.example.test',
  VITE_PREVIEW_HOST_SUFFIXES: 'tasks-preview.pages.dev, other-preview.pages.dev',
  VITE_PROD_FOLDER: 'Prod/Tasks', VITE_STAGING_FOLDER: 'Prod/Tasks-staging',
});
const NONE = hostConfig({});
```

Cases:

`envForHost(host, CFG)` as a table:

| Host | Env |
|---|---|
| `tasks.example.test` | production |
| `TASKS.Example.TEST` | production |
| `tasks.example.test.` | production |
| `staging-tasks.example.test` | staging |
| `tasks-preview.pages.dev` | preview |
| `pr-15.tasks-preview.pages.dev` | preview |
| `x.other-preview.pages.dev` | preview |
| `unlisted.pages.dev` | local |
| `pages.dev` | local |
| `tasks.example.test.evil.example` | local |
| `eviltasks.example.test` | local |
| `staging.tasks.example.test` | local |
| `localhost` | local |
| `''` | local |

`envForHost('tasks.example.test', NONE)` is `'local'`.

`hostConfig` parsing: `hostConfig({ VITE_PREVIEW_HOST_SUFFIXES: ' a.pages.dev,,B.pages.dev ' }).previewSuffixes` equals `['a.pages.dev', 'b.pages.dev']`.

`folderFor` cases:

| Call | Result |
|---|---|
| `folderFor('production', 'Other', CFG)` | `'Prod/Tasks'` |
| `folderFor('staging', 'Other', CFG)` | `'Prod/Tasks-staging'` |
| `folderFor('local', 'Dev/Tasks', CFG)` | `'Dev/Tasks'` |
| `folderFor('preview', 'Prod/Tasks', CFG)` | `'Prod/Tasks-staging'` (a preview never gets the production folder) |
| `folderFor('production', '', NONE)` | `''` |
| `folderFor('local', '', NONE)` | `''` |

Bridge values (Review Focus 1): `folderFor(envForHost('tasks.alipka.com', BRIDGE), '', BRIDGE)` equals `'ALAI/TaskApp'`. `BRIDGE` is built inline in this one test from the Task 6 values; it is the only place those values may appear in a test, as the proof that AL's deployment keeps its folder. *(This is the one exception to the neutral-values rule; roadmap item 3.7 deletes it.)*

`legacyCacheApplies` cases:

| Call | Result |
|---|---|
| `legacyCacheApplies('Prod/Tasks', CFG)` | `true` |
| `legacyCacheApplies('Prod/Tasks-staging', CFG)` | `false` |
| `legacyCacheApplies('', NONE)` | `false` |

`lookFor('staging')` equals `{ title: 'Omark Tasks Staging', themeColor: '#F6E7C8', manifest: '/manifest-staging.webmanifest', label: 'STAGING' }`. The other two `lookFor` tests stay.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter web exec vitest run src/lib/environment.test.ts`
Expected: FAIL, with `hostConfig is not exported` and the old signatures.

- [ ] **Step 3: Implement** `brand.ts` and the `environment.ts` functions with the signatures above.
  - `envForHost` normalises the host the way the current code does (lower case, one trailing dot removed). It checks `prodHost`, then `stagingHost` (each only when non-empty), then for each suffix `h === s || h.endsWith('.' + s)`; anything else is `local`.
  - `legacyCacheApplies` returns `cfg.prodFolder !== '' && folder === cfg.prodFolder`.
  - Update the file's top comment: hosts come from build variables (spec 6.1).

- [ ] **Step 4: Wire `env.ts` and `boot.ts`.**
  - `env.ts` declares `export const HOSTS = hostConfig(import.meta.env)` and passes it to `envForHost` and `folderFor`.
  - `boot.ts:186` becomes `if (!legacyCacheApplies(ONEDRIVE_FOLDER, HOSTS)) return;`.
  - `vite-env.d.ts` declares the five variables, plus `VITE_ONEDRIVE_SCOPE` (used in Task 2), as optional strings.

- [ ] **Step 5: Run the unit tests and see them pass**

Run: `pnpm --filter web exec vitest run src/lib/environment.test.ts`
Expected: PASS.

- [ ] **Step 6: Point the staging e2e at a neutral host.**
  - In `e2e/environment.spec.ts`, the resolver rule becomes `MAP staging-tasks.example.test localhost`, and `STAGING` becomes `http://staging-tasks.example.test:4173/`.
  - The expected title, apple title and manifest name become `'Omark Tasks Staging'`.
  - The comment's mention of `tasks-staging.alipka.com` becomes "the staging host".
  - `playwright.config.ts` webServer env becomes `{ VITE_STORAGE: 'fake', VITE_STAGING_HOST: 'staging-tasks.example.test' }`.
  - `vite.config.ts` `preview.allowedHosts` becomes `['staging-tasks.example.test']`.
  - The manifest assertion fails until Task 4 renames `manifest-staging.webmanifest`. Make that one change here (`"name"` and `"short_name"` become `"Omark Tasks Staging"`) so this task ends green.

- [ ] **Step 7: Run the four commands**

Expected: all pass. `pnpm e2e` includes `environment.spec.ts` on chromium.

- [ ] **Step 8: Commit**: `Read hosts and folders from build variables`

### Task 2: App-folder scope and configurable tenant

**Files:**
- Modify: `packages/storage/src/onedrive-adapter.ts:5,10-17,38-42`
- Modify: `packages/storage/src/index.ts` (export `DriveRoot`)
- Modify: `packages/signin/src/handler.ts:5-9,17-20` and the places that use `AUTHORITY` and `SCOPE` (lines 128, 136, 165, 191, 235)
- Modify: `apps/web/src/env.ts`, `apps/web/src/lib/boot.ts:82`
- Modify: `apps/web/e2e-real/state.ts:6`, `apps/web/e2e-real/onedrive.spec.ts:25` (its Graph `item()` URL becomes `.../me/drive/special/approot:/${E2E_FOLDER}/${name}`)
- Test: `packages/storage/test/onedrive-adapter.test.ts`, `packages/signin/test/handler.test.ts`

**Interfaces:**
- Consumes: `env.ts` from Task 1.
- Produces:
  - `export type DriveRoot = 'approot' | 'drive'`
  - `OneDriveAdapterOptions.root?: DriveRoot`, default `'approot'`
  - `Env.ONEDRIVE_SCOPE?: string` (`'full'` means whole drive; anything else means app folder)
  - `Env.MSAL_TENANT?: string` (default `'consumers'`)
  - `env.ts`: `export const ONEDRIVE_ROOT: DriveRoot` (`'drive'` when `VITE_ONEDRIVE_SCOPE === 'full'`, else `'approot'`)
  - `e2e-real/state.ts`: `E2E_FOLDER = process.env.TASKAPP_E2E_FOLDER || 'TaskApp-e2e'`, so the smoke now lands in the app folder by default

- [ ] **Step 1: Write the failing adapter tests** in `onedrive-adapter.test.ts`, using its existing fake fetch:
  - `it('reads from the app folder by default')`: `folder: ''` reads `https://graph.microsoft.com/v1.0/me/drive/special/approot:/tasks.md` (no double slash).
  - `it('puts a folder under the app folder')`: `folder: 'Tasks/Sub'` reads `.../special/approot:/Tasks/Sub/tasks.md`.
  - `it('writes to the drive root path when root is drive')`: `root: 'drive', folder: 'Prod/Tasks'` writes `.../me/drive/root:/Prod/Tasks/tasks.md:/content`.
  - `it('refuses a whole-drive adapter without a folder')` (Review Focus 4): `new OneDriveAdapter({ root: 'drive', folder: '', getToken })` throws `/folder/`.
  - Existing tests that pass an `ALAI/...` folder switch to `root: 'drive', folder: 'Prod/Tasks'`. The URLs they expect keep the `root:/` form.

- [ ] **Step 2: Write the failing helper tests** in `handler.test.ts`, using its `Jar` and `tokenEndpoint` helpers:
  - `it('asks for app-folder access by default')`: the `/api/auth/login` redirect's `scope` is `openid profile Files.ReadWrite.AppFolder offline_access`, and its URL starts with `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`.
  - `it('asks for whole-drive access when ONEDRIVE_SCOPE is full')`: the scope is `openid profile Files.ReadWrite offline_access`.
  - `it('refreshes with the configured scope')`: the token call's `scope` is `Files.ReadWrite.AppFolder offline_access` by default and `Files.ReadWrite offline_access` with `full`.
  - `it('uses MSAL_TENANT for the authority')`: with `MSAL_TENANT: 'common'`, the authorize URL starts with `https://login.microsoftonline.com/common/` and the token endpoint is `.../common/oauth2/v2.0/token`.
  - `it('treats a malformed MSAL_TENANT as missing configuration')`: `MSAL_TENANT: 'a/b'` answers the way the handler answers when a secret is missing (line 91), and makes no call to Microsoft.
  - Existing tests that expect `Files.ReadWrite offline_access` move to `ENV` with `ONEDRIVE_SCOPE: 'full'`, or update their expected scope. The PR says which.

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm --filter @taskapp/storage exec vitest run test/onedrive-adapter.test.ts` and `pnpm --filter @taskapp/signin exec vitest run test/handler.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 4: Implement.**
  - **Adapter:** the base is `https://graph.microsoft.com/v1.0/me/drive/special/approot:/` or `.../me/drive/root:/`, plus the encoded folder segments plus `/` when the folder is non-empty. It throws `Error('A whole-drive OneDrive adapter needs a folder')` for `root: 'drive'` with an empty folder.
  - **Helper:** compute `scope` and `authority` once per request from `env`.
    - The tenant must match `/^[a-z0-9][a-z0-9.-]*$/i`; otherwise it takes the missing-configuration path.
    - `SIGNIN_SCOPE` becomes ``` `openid profile ${scope}` ```.
  - **App:** `boot.ts:82` passes `root: ONEDRIVE_ROOT`.
  - **Real smoke:** `playwright.real.config.ts` is unchanged. With the new defaults, the smoke works in `TaskApp-e2e` inside the app folder of the registration in `.dev.vars`, and `.dev.vars` needs no `ONEDRIVE_SCOPE`. The PR lists `pnpm e2e:real` under "try this". The first run needs `pnpm e2e:real:login` again, because the consent now asks for app-folder access.

- [ ] **Step 5: Run the four commands**

Expected: all pass.

- [ ] **Step 6: Commit**: `Default to the OneDrive app folder and make the tenant configurable`

### Task 3: CI from repository variables, fork-safe, verified sign-in, pinned actions

**Files:**
- Create: `tools/ci/check-signin.mjs`, `tools/ci/test/check-signin.test.ts`, `tools/ci/test/workflows.test.ts`, `.github/dependabot.yml`
- Modify: `tools/ci/ensure-staging.mjs`, `tools/ci/test/ensure-staging.test.ts`, `tools/ci/package.json` (add `yaml`, the version `packages/core` uses)
- Modify: `.github/workflows/ci.yml`, `.github/workflows/promote.yml`
- Modify: `README.md`, the "Environment variables" and "Deploy" tables only (the full rewrite is milestone 2)

**Interfaces:**
- Produces: `export async function checkSignin(opts: { url: string; tenant?: string; scope?: 'appfolder' | 'full'; fetch?: typeof fetch; attempts?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<{ ok: boolean; message: string }>`.
  - Defaults: tenant `'consumers'`, scope `'appfolder'`, 6 attempts, 10 000 ms.
  - Its `main()` reads `SIGNIN_URL`, `MSAL_TENANT` and `ONEDRIVE_SCOPE`, prints `::error::` on failure, and exits 1.
- Produces: `ensureStaging(opts: { token: string; accountId: string; project: string; domain?: string; zone?: string; fetch?; log? })`.
  - Its `main()` reads `CF_STAGING_PROJECT` (required), and `STAGING_DOMAIN` with `CF_ZONE_ID` (both or neither).
- Repository variables the workflows read:

  | Variable | Purpose |
  |---|---|
  | `DEPLOY_ENABLED` | Gates every deploy job |
  | `CF_STAGING_PROJECT`, `CF_PROD_PROJECT` | Cloudflare Pages project names |
  | `STAGING_URL`, `PROD_URL` | Sign-in checks |
  | `STAGING_DOMAIN`, `CF_ZONE_ID` | `ensure-staging.mjs` custom domain and DNS |
  | `PROD_HOST`, `STAGING_HOST`, `PREVIEW_HOST_SUFFIXES`, `PROD_FOLDER`, `STAGING_FOLDER`, `ONEDRIVE_SCOPE`, `MSAL_TENANT` | Build and check |

- [ ] **Step 1: Write the failing `check-signin` tests.** A fake fetch answers `/api/auth/login` with `302` and a `Location` header.
  - `it('passes when login redirects to the tenant with app-folder scope')`
  - `it('passes for whole-drive scope when full is expected')`
  - `it('fails when the helper grants app-folder but full is expected')` (Review Focus 2): `ok` is false, and `message` contains both `Files.ReadWrite.AppFolder` and `full`.
  - `it('fails when the redirect goes to another tenant')`
  - `it('retries until the helper is live')`: two `404` answers, then a good `302`; ok, and 3 calls made.
  - `it('fails after the last attempt')`: six `404` answers, and `sleep` called 5 times.

- [ ] **Step 2: Write the failing workflow test** `workflows.test.ts`. It parses both workflow files with `yaml`.
  - `it('runs no secret-using step for forks')` (Review Focus 5): every step whose `with` or `env` contains `secrets.` must sit in a job whose `if` contains `vars.DEPLOY_ENABLED == 'true'`. A job that runs on `pull_request` must also contain `github.event.pull_request.head.repo.full_name == github.repository`.
  - `it('gives the e2e job no write permission')`
  - `it('never uses pull_request_target')`
  - `it('pins third-party actions to a commit')`: every `uses` not starting with `actions/` matches `/@[0-9a-f]{40}$/`, or `/@sha256:[0-9a-f]{64}$/` for `docker://`.
  - `it('names no project, host or folder')`: neither file's text matches `/--project-name=(?!\$\{\{ vars\.)/` or `/alipka|ALAI/i`.

- [ ] **Step 3: Update `ensure-staging.test.ts` first.**
  - The existing cases pass `project: 'tasks-staging', domain: 'staging-tasks.example.test', zone: 'zone1'`.
  - New: `it('only makes sure the project exists when no domain is given')`: the calls are exactly `GET .../pages/projects/tasks-staging`.
  - New: `it('rejects a domain without a zone')`.

- [ ] **Step 4: Run the CI tests and see them fail**

Run: `pnpm --filter ci-scripts exec vitest run`
Expected: FAIL.

- [ ] **Step 5: Implement `check-signin.mjs` and the `ensure-staging.mjs` changes.**
  - `check-signin` fetches with `redirect: 'manual'`.
    - The check passes when `Location` starts with `https://login.microsoftonline.com/${tenant}/` and the `scope` parameter's words include `Files.ReadWrite.AppFolder` (appfolder), or include `Files.ReadWrite` and no `.AppFolder` word (full).
    - It retries on a wrong answer, since a fresh deploy can still serve the old one.
  - `ensure-staging` loses its three constants and its header comment's names.

- [ ] **Step 6: Rewrite `ci.yml`.**
  - **`check`:** unchanged, except that the actionlint image is pinned by digest.
  - **`e2e`:** `permissions: contents: read` only. The three preview steps are removed.
  - **New `preview` job:**
    - `needs: [check, e2e]`;
    - `if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && vars.DEPLOY_ENABLED == 'true'`;
    - permissions `contents: read`, `pull-requests: write`.
    - Steps: checkout; pnpm and node setup; install; `pnpm --filter web build` with `VITE_STORAGE: fake` and `VITE_PREVIEW_HOST_SUFFIXES: ${{ vars.PREVIEW_HOST_SUFFIXES }}`; `ensure-staging` (with `CF_STAGING_PROJECT`, `STAGING_DOMAIN`, `CF_ZONE_ID` from vars); `pages deploy apps/web/dist --project-name=${{ vars.CF_STAGING_PROJECT }} --branch=pr-${{ github.event.number }}`; the existing comment step.
    - It rebuilds instead of reusing e2e's `dist`, so `e2e` needs nothing from the repo's settings.
  - **`deploy-staging`:**
    - `if` gains `&& vars.DEPLOY_ENABLED == 'true'`.
    - The build step's env maps `VITE_PROD_HOST`, `VITE_STAGING_HOST`, `VITE_PREVIEW_HOST_SUFFIXES`, `VITE_PROD_FOLDER`, `VITE_STAGING_FOLDER` and `VITE_ONEDRIVE_SCOPE` from the vars of the same names.
    - The project name comes from vars.
    - The curl loop becomes `node tools/ci/check-signin.mjs` with `SIGNIN_URL: ${{ vars.STAGING_URL }}`, `MSAL_TENANT` and `ONEDRIVE_SCOPE` from vars.
  - Pin `pnpm/action-setup` and `cloudflare/wrangler-action`. Resolve each SHA with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, dereferencing annotated tags, and put the tag in a trailing comment. Pin the actionlint image digest with `docker buildx imagetools inspect rhysd/actionlint:1.7.7`, or the Docker Hub API.

- [ ] **Step 7: Rewrite `promote.yml` the same way.**
  - The job's `if` becomes `github.ref == 'refs/heads/main' && vars.DEPLOY_ENABLED == 'true'`.
  - Add a first step that fails with `::error::` when `vars.CF_PROD_PROJECT` or `vars.PROD_URL` is empty.
  - The rebuild step gets the same `VITE_*` env as staging.
  - The project comes from `vars.CF_PROD_PROJECT`.
  - The curl loop becomes `check-signin` with `PROD_URL`.
  - Add `.github/dependabot.yml`: `github-actions`, directory `/`, weekly.

- [ ] **Step 8: Update the README tables.**
  - New rows: the `VITE_*` variables, the repository variables, and the Pages secrets `ONEDRIVE_SCOPE` and `MSAL_TENANT` (optional, defaults `appfolder` and `consumers`).
  - `VITE_ONEDRIVE_FOLDER`: default `''` (the app folder's root).

- [ ] **Step 9: Run the CI tests, actionlint and the four commands**

Run: `pnpm --filter ci-scripts exec vitest run`, then the four commands.
Expected: all pass. `check` runs actionlint in CI; locally `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7` reports nothing.

- [ ] **Step 10: Commit**: `Drive CI from repository variables and keep fork PRs green`

### Task 4: Rename to Omark Tasks

**Files:**
- Modify: every `package.json` in the workspace (`@taskapp/core|storage|signin` → `@omark/core|storage|signin`; root `taskapp` → `omark-tasks`), every import of them (about 48 files: `packages/**`, `apps/web/**`, `functions/api/auth/[[path]].ts`, `tools/**`), any `tsconfig*.json` or `vitest.config.ts` that names them, `pnpm-lock.yaml` (via `pnpm install`)
- Modify: `apps/web/index.html:7,10`, `apps/web/vite.config.ts` (manifest `name` and `short_name` from `BRAND.app`), `apps/web/src/App.svelte:141`, the console prefixes in `store.svelte.ts:503` and `boot.ts:103,192` (`BRAND.app`)
- Test: `apps/web/e2e/shell.spec.ts:3-15`

**Interfaces:**
- Consumes: `BRAND` from Task 1.
- Produces: the package names `@omark/core`, `@omark/storage` and `@omark/signin`. Later plans use these.

- [ ] **Step 1: Change `shell.spec.ts` to expect the new name.** The test is `'page title is Omark Tasks'`; it expects `toHaveTitle('Omark Tasks')` and `manifest.name` `'Omark Tasks'`. Add `expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Omark Tasks')`.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm e2e -- shell.spec.ts`
Expected: FAIL, title `TaskApp`.

- [ ] **Step 3: Rename the visible strings** in `index.html`, the manifest in `vite.config.ts` (import `BRAND` from `./src/brand.ts`), and `App.svelte`'s start error (`{BRAND.app} could not start: {error}`). Change the console prefixes.

- [ ] **Step 4: Rename the package scope.**
  - Replace `@taskapp/` with `@omark/` in package names, imports and configs. Rename the root package.
  - Run `pnpm install` to refresh the workspace links and the lockfile.
  - Pnpm filters in scripts and this plan's commands (`--filter @taskapp/...`) change too.

- [ ] **Step 5: Check that nothing else was renamed**

Run: `grep -rn "taskapp" --include=*.ts --include=*.svelte --include=*.mjs --include=*.json --include=*.html apps packages functions tools | grep -v node_modules`
Expected: only the internal names in Global Constraints (cookies, header, IndexedDB and localStorage keys, `__TASKAPP_` hooks), the `taskapp-files` skill path, and doc file paths in comments.

- [ ] **Step 6: Run the four commands**

Expected: all pass.

- [ ] **Step 7: Commit**: `Rename the app to Omark Tasks`

### Task 5: Clean-up

**Files:**
- Modify: `.gitignore`
- Modify: `packages/storage/src/auth.ts:120-133` and its caller (remove `forgetMsalCache`), `apps/web/src/lib/auth-stub.ts:10` (comment)
- Test: `packages/storage/test/auth.test.ts`. Delete only a test that asserts the `msal.` keys are removed (that behaviour is retired on purpose); the PR names it.
- Modify (test data only): `tools/ci/test/promote-check.test.ts:4`, `tools/ci/test/release-notes.test.ts:18-25`, `tools/claude-guard/test/guard.test.ts:44-88`. `alipkagit/TaskApp` becomes `owner/repo`, and `alipkagit/<branch>` becomes `owner/<branch>`. Assertions change only in those strings.

- [ ] **Step 1: Add ignore rules** to `.gitignore`: `.env`, `.env.*`, `!.env.example`, `.secrets/`, `.superpowers/`, `*e2e-state*.json`.

- [ ] **Step 2: Verify the ignore rules**

Run: `git check-ignore -v .env .env.production .secrets/x .superpowers/x taskapp-e2e-state.json apps/web/.env.local` and `git check-ignore .env.example`.
Expected: the first command lists all six paths; the second prints nothing and exits 1.

- [ ] **Step 3: Remove `forgetMsalCache`**, its call and its test. Change the `auth-stub.ts` comment so it no longer mentions MSAL.

- [ ] **Step 4: Run the four commands, then the grep from Global Constraints**

Expected: all pass. The grep prints only `environment.test.ts`'s single bridge test (Task 1) and the `/alipka|ALAI/i` guard in `tools/ci/test/workflows.test.ts`.

- [ ] **Step 5: Commit**: `Ignore local secrets and drop the MSAL leftovers`

### Task 6: Bridge values, merge and check (AL, with Claude where allowed)

No code. This is the `needs-human` list for the PR. It is done **before** the merge, because the merge deploys staging.

- [ ] **Step 1: Pages secret on both of AL's projects.** Set `ONEDRIVE_SCOPE` = `full` on `taskapp-staging` and `taskapp`: `pnpm exec wrangler pages secret put ONEDRIVE_SCOPE --project-name=<project>`. `MSAL_TENANT` stays unset (`consumers`). Then `pnpm exec wrangler pages secret list --project-name=<project>` for both projects lists `ONEDRIVE_SCOPE` before the merge.

- [ ] **Step 2: Repository variables.** Claude sets them with `gh variable set`, after AL says yes in the session:

  | Variable | Value |
  |---|---|
  | `DEPLOY_ENABLED` | `true` |
  | `CF_STAGING_PROJECT` | `taskapp-staging` |
  | `CF_PROD_PROJECT` | `taskapp` |
  | `STAGING_URL` | `https://tasks-staging.alipka.com` |
  | `PROD_URL` | `https://tasks.alipka.com` |
  | `STAGING_DOMAIN` | `tasks-staging.alipka.com` |
  | `CF_ZONE_ID` | the alipka.com zone ID now in `ensure-staging.mjs` |
  | `PROD_HOST` | `tasks.alipka.com` |
  | `STAGING_HOST` | `tasks-staging.alipka.com` |
  | `PREVIEW_HOST_SUFFIXES` | `taskapp-staging.pages.dev,taskapp-64g.pages.dev` |
  | `PROD_FOLDER` | `ALAI/TaskApp` |
  | `STAGING_FOLDER` | `ALAI/TaskApp-staging` |
  | `ONEDRIVE_SCOPE` | `full` |
  | `MSAL_TENANT` | `consumers` |

- [ ] **Step 3: Check the PR.** The preview link comment appears, and the preview shows sample tasks with the PREVIEW label.

- [ ] **Step 4: Fork test** (Review Focus 5). Needs milestone 0's org with private forking allowed. From AL's second GitHub account (`alipka-selsey`), fork the repo and open a PR with a one-line README change. Expected: `check` and `e2e` green, `preview` skipped, no red step.

- [ ] **Step 5: AL merges.**
  - `deploy-staging` runs.
  - `check-signin` prints success for `https://tasks-staging.alipka.com` with scope `full`.
  - On `tasks-staging.alipka.com`: the title is "Omark Tasks Staging", STAGING shows in the footer, the tasks are the staging folder's, and adding and completing a task syncs.

- [ ] **Step 6: AL runs Promote.**
  - The sign-in check passes for `https://tasks.alipka.com`.
  - On the PC and the iPhone, the app opens still signed in with the same tasks, and an edit made offline before the update is still there and syncs. On iOS the home-screen name changes only after re-adding the app; that is expected.

- [ ] **Step 7: Rollback**, if Step 6 fails: run Promote with the previous `prod-` tag. The Pages secret `ONEDRIVE_SCOPE=full` is harmless to the old build, which ignores it.
