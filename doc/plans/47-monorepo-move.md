# Monorepo move (roadmap 2.8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the repo in the suite layout (`apps/tasks`, `packages/tasks-core`, app-neutral storage and sign-in, CI and Promote per app) with no change anyone can see in Omark Tasks.

**Architecture:** Folders and packages are renamed. Shared code stops naming Tasks' files, cookies and IndexedDB databases: each app passes its own. The one Pages Function at the repo root stays, and picks the app's sign-in settings (provider, cookie prefix) from a per-project variable, `OMARK_APP`, defaulting to `tasks`. CI keeps one workflow file (renaming `ci.yml` would restart the build number); its deploy jobs, artifact, repository variables and release tags gain the app's name.

**Tech Stack:** TypeScript, Svelte 5, Vite, Vitest, Playwright, Cloudflare Pages Functions, GitHub Actions, pnpm 10 workspaces.

**Spec:** [launch spec 6.12](../TaskApp%20open%20source%20launch%20spec.md) (the monorepo). Roadmap: [2.8](open-source-launch-roadmap.md). Issue #47, branch `issue-47-monorepo-move`, one PR, a commit per task.

## What changes for AL

- Nothing in the app. Every device stays signed in and keeps its offline copy.
- Folders: `apps/web` → `apps/tasks`, `packages/core` → `packages/tasks-core`. Commands: `pnpm --filter tasks build` (was `--filter web`).
- Repository variables get a `TASKS_` / `CF_TASKS_` name (table in Task 5). Claude sets the new ones before the PR runs CI and deletes the old ones after staging and production work.
- Promote asks which app (only `tasks` for now). New production tags are `tasks-prod-YYYY-MM-DD-n`; rollback to an old `prod-` tag still works.
- Finished plans and build logs move to `doc/history/`.
- After the merge, AL renames the repo to `omark` (steps at the end).

## Acceptance criteria

- [ ] `pnpm typecheck`, `pnpm test`, `pnpm e2e` and `pnpm --filter tasks build` pass locally and in CI.
- [ ] Shared packages name no Tasks file, cookie or database: `packages/storage` and `packages/signin` contain no `tasks.md`, `done.md`, `config.yaml`, `taskapp` (any case) or `@omark/tasks-core` outside their tests. The one exception is the header `X-TaskApp-Auth`, renamed in 3.7. A test checks this (Tasks 2 and 3).
- [ ] Tasks still uses the cookies `taskapp_session0..3`, `taskapp_login`, `taskapp_hint`, `taskapp_signed_in`, the header `X-TaskApp-Auth`, the IndexedDB names `taskapp:<folder>` and `taskapp`, and the localStorage keys `taskapp:*`, byte for byte.
- [ ] This prints nothing:
  `git grep -nE "apps/web|--filter web|packages/core|@omark/core" -- . ':!doc/history' ':!doc/TaskApp open source launch spec.md' ':!doc/TaskApp cloud environment.md' ':!doc/plans/47-monorepo-move.md' ':!doc/plans/open-source-launch-roadmap.md' ':!tools/ci/promote-check.mjs' ':!tools/ci/test/promote-check.test.ts'`
  The launch spec and roadmap describe the move itself; the cloud environment doc is a dated log; `promote-check` keeps `apps/web` and `web-dist` so rollbacks to old commits work.
- [ ] After the merge: staging deploys from `main` and its sign-in check passes; AL is still signed in on staging; Promote ships it with tag `tasks-prod-…`; the old variables are deleted.

## Global Constraints

- **No behaviour change for users.** Exact names kept: see the acceptance list above. They become per-app settings whose Tasks values are today's. Renaming them waits for the cutover (roadmap 3.7), when everyone signs in on the new host anyway. *(My call; the spec says "cookie names lose `taskapp_`": the shared code loses them, Tasks keeps them for now.)*
- **The sealed cookies use the cookie name as associated data** (`packages/signin/src/crypto.ts`), so a prefix change would sign every device out. The prefix for `tasks` is `taskapp`.
- **`ci.yml` keeps its file name**: `run_number` is the build version shown in the footer.
- **Test first** for every behaviour or contract change; the PR quotes each failing line. Tests whose only change is a path or package name are moved, not rewritten; the PR lists them.
- Package names: `apps/tasks` is `tasks`; `packages/tasks-core` is `@omark/tasks-core`; Vitest project names follow the package names.
- `packages/tasks-core` stays pure: no DOM, network or storage (its `tsconfig.json` keeps `lib: ES2023` without DOM).
- Plain, short English in comments and docs. Commits are short imperative sentences ending with the `Co-Authored-By` line. Never push to `main`, never merge.

## Calls to check (where this plan departs from the spec)

1. **Order:** the move comes before #31 (demo mode), which has only a plan. AL chose this on 2026-10-26. #31 rebases onto the new paths when it resumes.
2. **Names kept:** cookie, header, IndexedDB and localStorage names are per-app settings in the shared code, but Tasks keeps today's values until 3.7, so nobody is signed out.
3. **One shared Pages Function** at the repo root picks the app from `OMARK_APP` (spec 6.12 leaves this to the builder). Per-app `functions/` folders would mean deploying from inside each app folder, which breaks rollbacks to older commits.
4. **`FileName` is a plain `string`** in shared storage; the app keeps its own `TaskFile` union. Generic types (`StorageAdapter<F>`) would touch every signature for little gain.
5. **Claude renames the repository variables** with `gh` (spec: a `needs-human` checklist), because it has the rights. If it doesn't, Task 5 stops with the commands for AL.

## Review Focus

1. **Rollback to a commit from before the move.** Promote with an old `prod-` tag checks out a commit that has `apps/web`, the artifact `web-dist` and `--filter web`. It must still deploy. Tests in Task 5.
2. **An existing session survives the update.** A `taskapp_session0` cookie sealed by today's code is unsealed by the new handler running with the `tasks` settings. Test in Task 3.
3. **A Pages project with `OMARK_APP` unset** (all of today's) behaves as `tasks`. An unknown value is refused with 500 `not_configured` and a log line naming the variable, never a sign-in with the wrong cookies. Tests in Task 3.
4. **The first `tasks-prod-` release** numbers from today and lists the PRs merged since the last legacy `prod-` tag, not since the beginning. Test in Task 5.
5. **CI run with only the old variables set** (the new ones forgotten): the first step of `tasks-preview`, `tasks-staging` and Promote fails, naming the new variable, before anything deploys. Test in Task 5.

---

### Task 1: Rename the folders and packages

**Files:**
- Move: `apps/web/` → `apps/tasks/`, `packages/core/` → `packages/tasks-core/` (`git mv`)
- Modify:
  - `apps/tasks/package.json` (name `tasks`, `--project tasks`, dependency `@omark/tasks-core`), `apps/tasks/vitest.config.ts` (name `tasks`, the comment)
  - `packages/tasks-core/package.json` and `vitest.config.ts` (`@omark/tasks-core`)
  - `packages/storage/package.json`, `tools/todoist-import/package.json` (dependency)
  - every importer of `@omark/core` (40 files: the app's components and `lib/`, `packages/storage/src/workspace.ts` and its tests, `tools/todoist-import/src/convert.ts` and test)
  - root `package.json` (`dev:signin`, `e2e:real`, `e2e:real:login`), `vitest.config.ts` (`apps/tasks`), `pnpm-lock.yaml` (`pnpm install`)
  - `apps/tasks/playwright.real.config.ts` (`--filter tasks`, `apps/tasks/dist-real`)
  - `.github/workflows/ci.yml`, `promote.yml`: `--filter web` → `--filter tasks`, `apps/web` → `apps/tasks` (only these strings; Task 5 does the rest)
  - `tools/ci/test/workflows.test.ts` (lines 51, 100, 107, 116)
  - `.claude/hooks/session-start.sh` (`cd apps/tasks`; the log prefix `Omark session start:`), `.claude/skills/taskapp-factory/SKILL.md` (`pnpm --filter tasks build`)

**Interfaces:**
- Produces: package `tasks` (`pnpm --filter tasks <script>`), package `@omark/tasks-core` (same exports as `@omark/core`).

- [ ] **Step 1: Change the expectations first.** In `tools/ci/test/workflows.test.ts`, expect `pnpm --filter tasks build`, `pnpm --filter tasks e2e --project=${{ matrix.project }}`, and read `apps/tasks/playwright.config.ts` and `apps/tasks/node_modules/@playwright/test/package.json`.
- [ ] **Step 2: Run** `pnpm vitest run --project ci-scripts`. Expected: FAIL on the build command and the missing `apps/tasks` files.
- [ ] **Step 3: Move and rename** as listed; `pnpm install` regenerates the lockfile.
- [ ] **Step 4: Run the four commands** (`pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter tasks build`). Expected: all pass, the same test count as before (830).
- [ ] **Step 5: Commit** "Move apps/web to apps/tasks and packages/core to packages/tasks-core".

### Task 2: Storage without Tasks' files

**Files:**
- Create: `packages/storage/test/app-neutral.test.ts`
- Move: `packages/storage/src/workspace.ts` → `apps/tasks/src/lib/workspace.ts`, `packages/storage/test/workspace.test.ts` → `apps/tasks/src/lib/workspace.test.ts`
- Modify: `packages/storage/src/{adapter,cache,fake-onedrive,file-sync,onedrive-adapter,index}.ts`, `packages/storage/package.json` (drop `@omark/tasks-core`), the storage tests that import `FileName`, and the app files that import `FileName` or the workspace (`boot.ts`, `store.svelte.ts`, `store.test.ts`, `store.svelte.test.ts`, `auth-stub.ts`, `sample-files.ts`)

**Interfaces:**
- Produces, in `@omark/storage`: file names are plain `string` everywhere (`StorageAdapter.read(name: string)`, `write(name: string, …)`, `LocalCache`, `FileSync`, `FakeOneDrive`, `migrateCache(from, to, names: readonly string[])`). `FileName` is no longer exported. `new IdbCache(dbName: string)`: the name is required (no `'taskapp'` default). `createWorkspace`, `Workspace` and `Snapshot` are no longer exported.
- Produces, in `apps/tasks/src/lib/workspace.ts`: `export type TaskFile = 'tasks.md' | 'done.md' | 'config.yaml'`, `export const TASK_FILES: readonly TaskFile[]`, and `createWorkspace`, `Workspace`, `Snapshot` unchanged. `boot.ts` uses `TASK_FILES` instead of its own `FILES` list.

- [ ] **Step 1: Write the failing test** `packages/storage/test/app-neutral.test.ts`:
  - `it('names no app's files, databases or packages')`: for every file in `packages/storage/src` except `auth.ts` (Task 3 removes this exception), the text, with `X-TaskApp-Auth` removed, matches none of `/tasks\.md|done\.md|config\.yaml|taskapp|@omark\/tasks-core/i`, and `package.json` has no `@omark/tasks-core` dependency.
  - `it('stores any file name')`: `FakeOneDrive` and `MemoryCache` round-trip `events-2026.csv` with the text `a,b\n` (this one passes at runtime today; it is there for `pnpm typecheck`, which fails on it while `FileName` is a union).
- [ ] **Step 2: Run** `pnpm vitest run --project @omark/storage test/app-neutral.test.ts` and `pnpm typecheck`. Expected: the first test FAILS naming `adapter.ts` (the `FileName` union), `workspace.ts` and `cache.ts`; typecheck FAILS on `'events-2026.csv'`.
- [ ] **Step 3: Make storage app-neutral** as in Interfaces; move the workspace and its test with `git mv`, changing only import paths.
- [ ] **Step 4: Run the four commands.** Expected: all pass.
- [ ] **Step 5: Commit** "Move the Tasks workspace out of shared storage".

### Task 3: Sign-in with providers and per-app cookies

**Files:**
- Create: `packages/signin/src/providers.ts`, `packages/signin/test/providers.test.ts`
- Modify: `packages/signin/src/handler.ts`, `index.ts`, `packages/signin/test/handler.test.ts` (calls gain the options; existing assertions unchanged), `functions/api/auth/[[path]].ts`, `packages/storage/src/auth.ts` and `test/auth.test.ts`, `apps/tasks/src/lib/boot.ts` (passes `cookiePrefix: 'taskapp'`, `providerName: 'Microsoft'`)

**Interfaces:**
- Produces, in `@omark/signin`:
  ```ts
  export interface Provider {
    /** For logs and errors, e.g. 'Microsoft'. */
    name: string;
    /** Reads this provider's settings; a string is the error to log (the handler returns 500 not_configured). */
    configure(env: Env): ProviderConfig | string;
  }
  export interface ProviderConfig {
    clientId: string; clientSecret: string;
    authorizeUrl: string; tokenUrl: string;
    /** Asked when redeeming a refresh token. */ scope: string;
    /** Asked at sign-in. */ signinScope: string;
    /** Rolling session cookie lifetime, seconds. */ sessionMaxAge: number;
  }
  export const microsoft: Provider; // today's values: MSAL_CLIENT_ID/SECRET, MSAL_TENANT (default consumers, same check), ONEDRIVE_SCOPE, 90 days
  export interface AuthOptions { provider: Provider; cookiePrefix: string }
  export function handleAuth(request: Request, env: Env, options: AuthOptions, deps?: Deps): Promise<Response>;
  export type Env = Record<string, string | undefined>; // COOKIE_KEY is shared; each provider reads its own keys
  ```
  Cookie names are `${cookiePrefix}_session` (chunks `0..3`), `_login`, `_hint`, `_signed_in`; paths unchanged. `CSRF_HEADER` stays `'X-TaskApp-Auth'` (renamed with the cookies in 3.7). Log lines start `Omark sign-in:`. The handler checks `COOKIE_KEY` itself first (`COOKIE_KEY is not set` / `is not 32 base64-encoded bytes`); `configure` reports only its provider's own keys (for Microsoft: `MSAL_CLIENT_ID or MSAL_CLIENT_SECRET is not set`, `MSAL_TENANT is not a tenant name`).
- Produces, in `functions/api/auth/[[path]].ts`: `const APPS = { tasks: { provider: microsoft, cookiePrefix: 'taskapp' } }`; the app is `env.OMARK_APP || 'tasks'`; the lookup uses `Object.hasOwn(APPS, app)`, so `constructor` or `toString` are refused too; an unknown app logs `Omark sign-in: OMARK_APP "<value>" is not an app` and returns 500 `{ error: 'not_configured' }`.
- Produces, in `@omark/storage`: `createAuth(opts)` with new required options `cookiePrefix: string` (reads `${cookiePrefix}_signed_in`) and `providerName: string` (used in the error texts instead of "Microsoft").

- [ ] **Step 1: Write the failing tests:**
  - `providers.test.ts`: `microsoft.configure({})` returns a string naming `MSAL_CLIENT_ID`; with `MSAL_TENANT: 'a/b'` returns a string naming `MSAL_TENANT`; with valid values returns `authorizeUrl` `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`, `scope` `Files.ReadWrite.AppFolder offline_access`, and `Files.ReadWrite offline_access` when `ONEDRIVE_SCOPE: 'full'`.
  - `handler.test.ts`, new: `it('uses the app's cookie prefix')` with `cookiePrefix: 'omark_time'`: login sets `omark_time_login`, callback sets `omark_time_session0` and `omark_time_signed_in`. `it('reads a session sealed before the move')`: a `taskapp_session0` value sealed with today's `seal(key, 'taskapp_session', …)` refreshes successfully with `cookiePrefix: 'taskapp'`.
  - A test for the function file (`packages/signin/test/function.test.ts`, importing `functions/api/auth/[[path]].ts`): `OMARK_APP` unset → `/api/auth/login` redirects to Microsoft and sets `taskapp_login`; `OMARK_APP: 'nope'` and `OMARK_APP: 'constructor'` → 500 `not_configured`.
  - `app-neutral.test.ts`: remove the `auth.ts` exception (FAILS on `taskapp_signed_in`), and add the same check for `packages/signin/src`.
  - `packages/storage/test/auth.test.ts`: with `cookiePrefix: 'omark_time'`, `isSignedIn()` reads `omark_time_signed_in`; `providerName: 'Google'` appears in the `failed` error text.
- [ ] **Step 2: Run** `pnpm vitest run --project @omark/signin` and `--project @omark/storage`. Expected: FAIL (no `providers.ts`, `handleAuth` takes no options, cookie names fixed).
- [ ] **Step 3: Implement** as in Interfaces. Move the Microsoft-only values (tenant check, authority, scopes, 90 days) from `handleAuth` into `microsoft`; the flow itself is unchanged.
- [ ] **Step 4: Run the four commands.** Expected: all pass; existing handler assertions on `taskapp_*` pass unchanged with `cookiePrefix: 'taskapp'`.
- [ ] **Step 5: Commit** "Give the sign-in helper providers and per-app cookie names".

### Task 4: Tidy the Tasks-only names in tools

**Files:**
- Modify: `tools/todoist-import/src/convert.ts:18,82` ("TaskApp" → "Omark Tasks") and its test's expected warning.

- [ ] **Step 1:** In `tools/todoist-import/test/convert.test.ts`, next to the existing time-dropped check (about line 52), add `expect(r.warning).toContain('(Omark Tasks has no times)')`. **Run** it: FAIL.
- [ ] **Step 2:** Change the two strings. **Run** the four commands: pass.
- [ ] **Step 3: Commit** "Name Omark Tasks in the Todoist import warning".

### Task 5: CI and Promote per app

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/promote.yml`, `tools/ci/promote-check.mjs`, `tools/ci/release-notes.mjs`, `tools/ci/test/{workflows,promote-check,release-notes}.test.ts`; README (the variable table, line 32's `MSAL_CLIENT_ID`, line 103's tag format), `doc/TaskApp factory spec.md:152` (tag format)
- Existing tests that change because the behaviour changes (list them in the PR): `workflows.test.ts:49-57` (the Promote rebuild now uses `--filter ${{ steps.check.outputs.filter }}`) and `:53, 68, 89-91, 120, 140` (job names); `promote-check.test.ts:61-85` (results gain `appDir`, `filter`, `artifactName`); `release-notes.test.ts:4-13` (`nextTag` takes the app)

**Repository variables** (the session lead, not a subagent, creates the new ones with `gh variable set` before pushing this task, copying today's values; `DEPLOY_ENABLED` stays shared). Only the `vars.` sources change: the env names inside steps (`CF_STAGING_PROJECT` for `ensure-staging.mjs`, `MSAL_TENANT` and `ONEDRIVE_SCOPE` for `check-signin.mjs`, and so on) stay, so the scripts' inputs don't change.

| Old | New |
|---|---|
| `CF_STAGING_PROJECT`, `CF_PROD_PROJECT`, `CF_ZONE_ID` | `CF_TASKS_STAGING_PROJECT`, `CF_TASKS_PROD_PROJECT`, `CF_TASKS_ZONE_ID` |
| `STAGING_DOMAIN`, `STAGING_HOST`, `STAGING_URL` | `TASKS_STAGING_DOMAIN`, `TASKS_STAGING_HOST`, `TASKS_STAGING_URL` |
| `PROD_HOST`, `PROD_URL` | `TASKS_PROD_HOST`, `TASKS_PROD_URL` |
| `PROD_FOLDER`, `STAGING_FOLDER`, `PREVIEW_HOST_SUFFIXES` | `TASKS_PROD_FOLDER`, `TASKS_STAGING_FOLDER`, `TASKS_PREVIEW_HOST_SUFFIXES` |
| `ONEDRIVE_SCOPE`, `MSAL_TENANT` | `TASKS_ONEDRIVE_SCOPE`, `TASKS_MSAL_TENANT` |
| `MSAL_CLIENT_ID` | deleted (no workflow reads it) |

**Interfaces:**
- Jobs: `preview` → `tasks-preview`, `deploy-staging` → `tasks-staging` (`check`, `e2e`, `stop-on-check-failure` unchanged). `tasks-preview` gains a first step like `tasks-staging`'s, checking `CF_TASKS_STAGING_PROJECT`. Artifact `tasks-dist` from `apps/tasks/dist`. Deploys still run from the repo root, so `functions/` ships as today. The preview comment marker becomes `<!-- tasks-preview -->`, and the old `<!-- taskapp-preview -->` comment is updated too (match either).
- Promote: input `app` (`type: choice`, options `[tasks]`, default `tasks`) next to `commit`; the variable check names `CF_TASKS_PROD_PROJECT`, `TASKS_PROD_HOST`, `TASKS_PROD_URL`.
- `promoteCheck({ repo, token, input, app, fetch })` returns, in addition, `appDir`, `filter` and `artifactName`. The layout comes from `GET /contents/apps/<app>?ref=<sha>`: 200 → `apps/<app>` and `<app>`; 404 → `apps/web` and `web` (before the move). The artifact is `<app>-dist`, else `web-dist`; `artifact` is true when either exists. It accepts `tasks-prod-…` and legacy `prod-…` tags as input, and its refusal text names both. The workflow uses these outputs for the download path, the rebuild filter and the deploy path.
- `nextTag(tags, today, app)` returns `${app}-prod-YYYY-MM-DD-n`. `tagPatterns(app)` returns `['tasks-prod-*', 'prod-*']` for `tasks`, else `[`${app}-prod-*`]`. All three git calls in `main()` (`tag --list`, `describe` with one `--match` per pattern, `for-each-ref`) use it, so the notes and rollback detection see old and new tags. The script takes the app as its second argument: `release-notes.mjs "$SHA" "$APP"`, with `APP: ${{ inputs.app }}`.

- [ ] **Step 1: Write the failing tests:**
  - `workflows.test.ts`: the job names above; `tasks-staging` uploads `tasks-dist`; every `vars.` name used by a deploy job or Promote is in the new column or is `DEPLOY_ENABLED` (none from the old); `promote.yml` has the `app` choice input; the first step of `tasks-staging` names `CF_TASKS_STAGING_PROJECT`, `TASKS_STAGING_HOST`, `TASKS_STAGING_URL` in its error, and the first step of `tasks-preview` names `CF_TASKS_STAGING_PROJECT`.
  - `promote-check.test.ts` (the fake gains a `/contents/apps/<app>` route and a layout field): a run with only `web-dist` → `artifactName: 'web-dist'`, `artifact: true`; a commit whose `/contents/apps/tasks` is 404 → `appDir: 'apps/web'`, `filter: 'web'`; the refusal for an unknown input names both `tasks-prod-` and `prod-` tags.
  - `release-notes.test.ts`: `nextTag(['prod-2026-10-22-1'], '2026-11-02', 'tasks')` is `tasks-prod-2026-11-02-1`; with `['tasks-prod-2026-11-02-1']` it is `…-2`; `tagPatterns('tasks')` is `['tasks-prod-*', 'prod-*']` and `tagPatterns('time')` is `['time-prod-*']`.
- [ ] **Step 2: Run** `pnpm vitest run` for the `tools/ci` project. Expected: FAIL on each.
- [ ] **Step 3: Set the new repository variables** (`gh variable set NAME --body "$(gh variable get OLD)"` for each row). Check with `gh variable list`. If `gh` lacks the rights, stop: add `needs-human` to #47 with these commands for AL.
- [ ] **Step 4: Implement** the workflow and script changes; update the README's variable table.
- [ ] **Step 5: Run the four commands** and `actionlint`. Expected: pass.
- [ ] **Step 6: Commit** "Run CI and Promote per app".

### Task 6: Docs and history

**Files:**
- Create: `doc/history/` with `git mv` of `doc/TaskApp v1 build plan.md`, `doc/TaskApp factory build plan.md`, `doc/plans/open-source-m1-groundwork.md`, and `doc/plans/{19,26,32,35,36,38}-*.md` (all six issues are closed). Update every link to a moved file (`git grep` the old names).
- Modify:
  - `CLAUDE.md`: the layout (`apps/tasks`, `packages/tasks-core`), the commands table (`--filter tasks`), the hard rule's e2e folder ("`TaskApp-e2e` in the app folder", not `ALAI/TaskApp-e2e`)
  - `README.md` (layout, `pnpm dev` folder, `apps/tasks/src/lib/environment.ts`, `OMARK_APP`)
  - `doc/TaskApp v1 spec.md:341,344,355`, `doc/TaskApp factory spec.md:103`, `doc/TaskApp habits spec.md:87`, `doc/Omark settings page spec.md:38`
  - `doc/TaskApp open source launch spec.md` 6.12: record the two calls (cookie and database names are per-app settings, Tasks keeps today's until 3.7; one shared function picks the app from `OMARK_APP`)
  - `doc/plans/open-source-launch-roadmap.md`: 2.8 done; the order note (line 51) says 2.8 went before 2.1 by AL's choice and #31 rebases onto the new paths; 3.7 also renames the Tasks cookies, header, database and tags
  - `doc/plans/31-demo-mode.md` is on #31's branch, not `main`: leave it; the roadmap note covers it.

- [ ] **Step 1: Run the acceptance `git grep`.** Expected: lists the files above.
- [ ] **Step 2: Move and edit** as listed.
- [ ] **Step 3: Run the `git grep` again.** Expected: no output. Run the four commands: pass.
- [ ] **Step 4: Commit** "Point the docs at the new layout and move finished plans to doc/history".

### Task 7: Hand over

- [ ] **Step 1:** Push; open the PR (template: `Closes #47`, size large, plan link, the failing lines from Tasks 1–5, the tests that only moved: `workspace.test.ts` and the path-only edits in `workflows.test.ts`).
- [ ] **Step 2:** Fresh-eyes review subagent with this plan and `git diff main...HEAD`; fix what holds up; re-run the four commands.
- [ ] **Step 3:** CI green; the preview comment links a working preview (fake drive). "Try this": sign in on the preview is stubbed, so the real checks are after the merge (below).

## After the merge (AL, then Claude)

1. **AL:** merge the PR. Staging deploys; CI's "Check the sign-in helper is live" must pass.
2. **AL:** open `tasks-staging.alipka.com` on the phone. Expected: still signed in, the tasks are there, the footer shows the new build number.
3. **AL:** run Promote (Actions → Promote to production → app `tasks`). Expected: production updates, a `tasks-prod-…` release lists this PR.
4. **Claude:** delete the old repository variables (after AL's OK).
5. **AL:** rename the repo: GitHub → `omark-app/tasks` → Settings → General → Repository name `omark` → Rename. (Claude tries `gh api -X PATCH repos/omark-app/tasks -f name=omark` first; the guard may block it.) Old URLs redirect.
6. **Claude:** `git remote set-url origin https://github.com/omark-app/omark.git` in each checkout; a small docs PR points CLAUDE.md's `gh api` example and other `omark-app/tasks` mentions at `omark-app/omark`; update the memory notes.

## Out of scope

- Anything of Omark Time (milestone T), the Google provider (3.8), demo mode (#31), the landing page (2.2).
- Renaming the Tasks cookies, header, IndexedDB names, localStorage keys, `window.__TASKAPP_*__` hooks or Pages secrets (3.7).
- CI path filters that skip unaffected apps (added with the second app, T.5).
- The guard's role-neutral messages (2.5).
