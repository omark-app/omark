# Google Drive storage (#61) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Omark Tasks can keep its files in `My Drive/Omark Tasks` on Google Drive, through a Google provider in `@omark/signin` and a shared `GoogleDriveAdapter` in `packages/storage`.

**Architecture:** The sign-in helper serves several providers per app (Tasks: Microsoft and Google). The provider id travels in the sealed login and session cookies, and the readable `taskapp_signed_in` cookie holds it, so the app knows which adapter to open. The adapter writes conditionally through Drive API v2 (`If-Match` → 412), and reads exactly the head revision's content through v3. Google Drive shows up only where the Pages project has the Google secrets (`GET /api/auth/providers`), so production stays Microsoft-only until 3.2.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Playwright, Cloudflare Pages Functions, Google OAuth 2.0, Drive API v2 + v3.

**Spec:** `doc/TaskApp open source launch spec.md` 6.4.1; `doc/Omark Time spec.md` 10.1–10.2 (the shared provider).

## What changes for AL

- Nothing on `tasks.alipka.com`: production has no Google secrets, so its sign-in screen is unchanged.
- On staging (`tasks-staging.alipka.com`, later `staging-tasks.omark.app`), the sign-in screen gets a second button, **Sign in with Google**. Signing in with the test account creates `My Drive/Omark Tasks Staging` with `tasks.md`, `done.md` and `config.yaml`. Signing in with Microsoft again switches back. Neither copies nor deletes files.
- The sync banner and messages name the storage in use ("Can't reach Google Drive").

## Spike findings (2026-10-26, `hello@omark.app`, "Omark Tasks Staging" client)

| Question | Finding |
|---|---|
| Conditional writes, v3 | **Not supported.** `PATCH upload/drive/v3/files/{id}` with a stale or made-up `If-Match` returned 200 and overwrote the file. v3 sends no `ETag` header. |
| Conditional writes, v2 | **Supported.** `PUT upload/drive/v2/files/{id}?uploadType=media` with the file's `etag`: current → 200 with a new etag; stale → **412 `conditionNotMet`**; a made-up value → 500. The etag also changes on metadata-only edits (a description change made an older etag fail with 412), so a rename or move elsewhere costs one extra merge, never a lost write. |
| Reading text that matches its etag | v2 metadata gives `etag` and `headRevisionId` together. `GET drive/v3/files/{id}/revisions/{headRevisionId}?alt=media` returns that revision's exact content, so a write landing between the two calls cannot pair new text with an old etag (the problem OneDrive solves with `quickXorHash`). |
| CORS | The preflight for `PUT` and `GET` with `authorization, content-type, if-match` from `https://staging-tasks.omark.app` is allowed. |
| Refresh tokens | Google does not rotate them. A refresh with `scope` = `drive.file` works; one asking for a scope never granted fails with `invalid_scope`. |
| Consent screen | Google's granular consent shows the Drive box **unticked**. A user can finish sign-in without Drive access, so the helper must check the granted `scope`. |
| `response_mode=query` | Accepted by Google's authorize endpoint, so the helper can keep sending it for every provider. |
| Desktop edits keep the file id | **Not checked.** AL chose to make it the manual staging step (acceptance below). If an app saving through Drive for desktop changes the id, `drive.file` loses the file. The app would then find no `tasks.md` and create a new one (nothing deleted, the old file stays in the folder). We'd see that in the manual step and file a follow-up. |

## Acceptance criteria

- [ ] `@omark/signin` exports `google({ scopes })`, reading `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Each app passes its own scopes (Tasks: `drive.file`); none is hard-coded in the provider.
- [ ] The helper serves several providers per app: `/api/auth/login?provider=google`, `/api/auth/providers`, and the provider id is kept in the sealed login and session cookies. Existing Microsoft sessions (no provider id, `signed_in=1`) keep working without signing in again.
- [ ] A Google sign-in without the Drive box ticked does not create a session; the app says what to tick.
- [ ] `GoogleDriveAdapter` passes `adapter-contract.ts` against `FakeGoogleDrive`, plus its own tests: the 412 path, folder and file creation, a two-device first-run race, a trashed file, and auth errors.
- [ ] The app opens the Google adapter when signed in with Google, in its own IndexedDB cache (`taskapp:google:<folder>`), never the OneDrive one.
- [ ] e2e (desktop and iphone): the sign-in screen with both providers; first run on Google Drive (fake storage) creating the folder and files; an outside edit merged; the banner naming Google Drive.
- [ ] Pages secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set on `taskapp-staging` from the JSON file, never printed. The staging callback is added to the Google client's redirect URIs.
- [ ] Manual on staging (AL, with `hello@omark.app`): the files appear in `My Drive/Omark Tasks Staging`. An edit made through Google Drive for desktop (Obsidian or Notepad) is merged, and the file keeps its id.
- [ ] Docs: README (Google secrets, `VITE_GOOGLE_FOLDER`), `.env.example`, the v1 spec's storage section, these findings in the launch spec 6.4.1.

## Tests I'll write first

One per behaviour, each run red before the code (the PR quotes the failing lines):

- `packages/signin/test/providers.test.ts`: `google` config, missing settings, scopes from the caller.
- `packages/signin/test/handler.test.ts`: login with `?provider=google`; an unknown provider; the callback uses the provider from the login cookie; the token route uses the one in the session; an old session without one → Microsoft; `signed_in` holds the id; `/api/auth/providers`; missing Drive scope → `signin_error=scope`.
- `packages/signin/test/function.test.ts`: Tasks offers `microsoft` and `google`.
- `packages/storage/test/google-drive-adapter.test.ts`: the contract, plus the Drive specifics in Task 4.
- `packages/storage/test/auth.test.ts`: `signIn('google')`, `signedInProvider()`, `availableProviders()`, provider names in errors.
- `apps/tasks/src/lib/environment.test.ts`: `googleFolderFor`, `cacheName`.
- `apps/tasks/src/lib/sync-banner.test.ts`: texts with `Google Drive`.
- `apps/tasks/e2e/google-drive.spec.ts`: the four e2e cases above.

Existing tests stay as they are. Three files change shape but not behaviour: `handler.test.ts` (`TASKS` moves to `providers: { microsoft }`), `boot.ts` and `SignIn.svelte` (new props). The PR lists them.

## Risks

- **Drive API v2 retires.** Google calls v3 current but still serves v2, with no end date announced. If v2 goes, the fallback is check-then-write on v3: read `headRevisionId`, write, then look in the revision list for a revision between ours and the base, and treat that as a 412. Only `write` in the adapter changes.
- **Desktop edits change the file id** (not checked, above). The worst case is a second `tasks.md`; nothing is lost.
- **Two devices' first run while Drive's list lags**, or restoring an older "Omark Tasks" folder from the trash, can leave two files with the same name. On the next start the app uses the oldest, and edits saved only in the newer file drop out of the app. They are still in Drive, in that file. Follow-up #67 covers merging them. The usual case (both devices see each other) ends with one file and a 412 merge.
- **Testing-mode refresh tokens expire after 7 days** on the staging project. The app then shows "Sign in again", as for an expired Microsoft session.
- **Merge conflicts** with 2.1 (`boot.ts`'s fake branch, `.env.example`) and #45 (`SignIn.svelte` neighbours). My edits there stay small; I merge main before the PR.

## Out of scope

- The first-run choice screen and a setting to switch storage (3.2), and copying files between storages.
- Asking for more scopes later (incremental consent, Time 10.2): T.4/T.5 add it on top of `google({ scopes })`.
- Production Google project and secrets (3.9), `staging-tasks.omark.app` (3.3).
- Google Picker or opening files the app didn't create.

## Global Constraints

- Scope for Tasks: `https://www.googleapis.com/auth/drive.file`, plus `openid email` at sign-in only. No other scope (the 2.2 privacy page lists exactly these).
- Folder names: production `Omark Tasks` (`BRAND.app`), staging `Omark Tasks Staging` (`BRAND.stagingApp`), preview and local `VITE_GOOGLE_FOLDER` or `Omark Tasks Dev`.
- Provider ids: `microsoft`, `google`. The first provider in an app's map is its default.
- Cookie prefix stays `taskapp` (3.7 renames it).
- Nothing logs a token; secrets are read by redirection and never printed.
- Never touch `ALAI/TaskApp` or AL's real Google data.

## Review Focus

1. **The user unticks Drive on Google's consent screen**: no session, and the error says to tick the box (Task 2 test).
2. **Existing Microsoft sessions after the deploy** (`signed_in=1`, session without `p`): still signed in, token route still Microsoft (Tasks 2, 5).
3. **The user trashes `tasks.md` or the whole folder in Drive while the app is open**: the next read returns null and the sync recreates the file, instead of failing every minute (Task 4).
4. **Two devices' first run at once**: one folder and one file each in the end, the loser gets a 412 and merges (Task 4).
5. **Signed in with Google on a browser that also has OneDrive edits cached**: the Google adapter never sees them, because the cache names differ (Task 6).

---

### Task 1: Google provider

**Files:**
- Modify: `packages/signin/src/providers.ts`, `packages/signin/src/index.ts`
- Test: `packages/signin/test/providers.test.ts`

**Interfaces:**
- Produces: `google(opts: { scopes: readonly string[] }): Provider` with `name: 'Google'`. `ProviderConfig` gains `authorizeParams?: Record<string, string>` (extra query parameters on `/authorize`) and `requiredScopes?: readonly string[]` (must all be in the granted `scope` at the callback).

- [ ] **Step 1: Write the failing tests** in `describe('google')`:
  - `google({ scopes: [DRIVE] }).configure({})` returns a string containing `GOOGLE_CLIENT_ID`.
  - With `{ GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret' }` it equals:
    ```ts
    { clientId: 'gid', clientSecret: 'gsecret',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: DRIVE, signinScope: `openid email ${DRIVE}`,
      sessionMaxAge: 180 * 86400,
      authorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      requiredScopes: [DRIVE] }
    ```
  - Two scopes are joined with a space in `scope` and `signinScope`, and both are required.
  - The existing `microsoft` test still passes unchanged (no `authorizeParams`, no `requiredScopes`).
- [ ] **Step 2:** `pnpm test -- packages/signin/test/providers.test.ts`, expect FAIL (`google` is not exported).
- [ ] **Step 3: Implement** `google` in `providers.ts`. `prompt=consent` because Google sends a refresh token only on a consent; the comment says so. Export it from `index.ts`.
- [ ] **Step 4:** Run again, expect PASS.
- [ ] **Step 5: Commit** "Add a Google sign-in provider".

### Task 2: Several providers per app in the helper

**Files:**
- Modify: `packages/signin/src/handler.ts`, `functions/api/auth/[[path]].ts`
- Test: `packages/signin/test/handler.test.ts`, `packages/signin/test/function.test.ts`

**Interfaces:**
- Consumes: `google`, `ProviderConfig.authorizeParams`, `requiredScopes` (Task 1).
- Produces: `AuthOptions = { providers: Record<string, Provider>; cookiePrefix: string }`, where the first key is the default. Routes: `GET /api/auth/login[?provider=<id>]`, `GET /api/auth/providers` → `{ providers: string[] }` (configured ones, in order), and the callback error `scope`. The callback appends `&provider=<id>` to `/?signin_error=` when it knows the provider. `<prefix>_signed_in` holds the provider id.

- [ ] **Step 1: Write the failing tests** (a second token-endpoint mock for Google's URL; `TASKS` becomes `{ providers: { microsoft, google: google({ scopes: [DRIVE] }) }, cookiePrefix: 'taskapp' }` and `ENV` adds the Google settings):
  - `login?provider=google` redirects to `https://accounts.google.com/o/oauth2/v2/auth?` with `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, `scope=openid email <DRIVE>`, and the PKCE parameters.
  - `login` without `provider` still goes to Microsoft (the existing tests cover it).
  - `login?provider=dropbox` → 400 `{ error: 'unknown_provider' }`, no cookies.
  - `login?provider=google` when the Google settings are missing → 500 `not_configured`; Microsoft still works with the same env.
  - A Google round trip (login → callback → token) calls only Google's token URL, and `taskapp_signed_in` is `google`.
  - The callback with granted `scope` lacking `DRIVE` → redirect `/?signin_error=scope&provider=google`, no session cookies.
  - A session sealed the old way (`{ rt, exp }`, no `p`) refreshes against Microsoft; `taskapp_signed_in` becomes `microsoft`.
  - `login_hint` from a hint sealed for another provider is not sent.
  - `GET /api/auth/providers` → `{ providers: ['microsoft', 'google'] }`, or `['microsoft']` without the Google settings. `POST` → 405.
  - `function.test.ts`: with the Google settings, `/api/auth/providers` lists both for `tasks`.
- [ ] **Step 2:** Run the signin project, expect the new tests to FAIL.
- [ ] **Step 3: Implement.** `LoginState`, `Session` and `Hint` gain `p?: string`; absent means the default provider. Configure only the provider in use per request. The `providers` route needs no cookie key. In `functions/api/auth/[[path]].ts` Tasks becomes `{ providers: { microsoft, google: google({ scopes: [DRIVE_FILE] }) }, cookiePrefix: 'taskapp' }`, with `DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'`.
- [ ] **Step 4:** `pnpm test` for signin and `tools/ci` (`check-signin.mjs` still expects Microsoft by default), expect PASS.
- [ ] **Step 5: Commit** "Let the sign-in helper serve Microsoft and Google".

### Task 3: Shared HTTP plumbing for the drive adapters

**Files:**
- Create: `packages/storage/src/http.ts`
- Modify: `packages/storage/src/onedrive-adapter.ts`
- Test: the existing `packages/storage/test/onedrive-adapter.test.ts`, unchanged

**Interfaces:**
- Produces: `createHttp(opts: { getToken(o?: { fresh?: boolean }): Promise<string>; fetch?: typeof fetch; timeoutMs: number }): Http`, where `Http = { authed(url: string, init: RequestInit): Promise<Reply>; send(url: string, init: RequestInit): Promise<Reply> }` and `Reply = { status: number; ok: boolean; text: string; bytes: Uint8Array }`. It does today's `graph`/`send`/`withTimeout`: one retry with a fresh token on 401 then `AuthRequiredError`, a TypeError → `OfflineError`, and a timeout → `OfflineError`.

- [ ] **Step 1:** Move the three private methods into `http.ts` unchanged and make `OneDriveAdapter` use them.
- [ ] **Step 2:** `pnpm test -- packages/storage`, expect all OneDrive tests to PASS untouched (a pure refactor: no failing test first).
- [ ] **Step 3: Commit** "Share the drive adapters' HTTP code".

### Task 4: `FakeGoogleDrive` and `GoogleDriveAdapter`

**Files:**
- Create: `packages/storage/src/fake-google-drive.ts`, `packages/storage/src/google-drive-adapter.ts`
- Modify: `packages/storage/src/index.ts`
- Test: `packages/storage/test/google-drive-adapter.test.ts`

**Interfaces:**
- Consumes: `createHttp` (Task 3).
- Produces:
  - `new GoogleDriveAdapter({ folder: string; getToken; fetch?; timeoutMs? })` implementing `StorageAdapter`; `folder` is one folder name in My Drive (throws on `/`, empty, `.` or `..`).
  - `new FakeGoogleDrive(files?: Record<string, string>, folder = 'Omark Tasks')` with `fetch: typeof fetch`, `externalWrite(name, text)`, `peek(name): string | null`, `setOffline(on)`, `touchMetadata(name)` (a rename-like change: new etag, same text), `trash(name)`, `folders(): string[]`, `calls: { method: string; url: string; headers: Record<string, string> }[]`. `externalWrite`, `peek` and `setOffline` match `FakeOneDrive`, so the e2e helpers work on both.

The adapter's requests (the fake implements exactly these and throws on any other, so a changed query fails the tests):

| Step | Request |
|---|---|
| Find the folder | `GET drive/v3/files?q=name='<folder>' and mimeType='application/vnd.google-apps.folder' and trashed=false&orderBy=createdTime&fields=files(id)&spaces=drive` |
| Create the folder | `POST drive/v3/files?fields=id` `{ name, mimeType: folder }`, then find again and take the first (oldest) |
| Find a file | `GET drive/v3/files?q=name='<name>' and '<folderId>' in parents and trashed=false&orderBy=createdTime&fields=files(id)&spaces=drive` |
| Read metadata | `GET drive/v2/files/<id>?fields=etag,headRevisionId,labels/trashed` |
| Read text | `GET drive/v3/files/<id>/revisions/<headRevisionId>?alt=media` |
| Create a file | `POST upload/drive/v2/files?uploadType=multipart&fields=id,etag` (metadata `{ title, parents: [{ id }], mimeType }`), then find the file again |
| Update a file | `PUT upload/drive/v2/files/<id>?uploadType=media&fields=etag` with `If-Match` |
| Trash a duplicate | `PATCH drive/v3/files/<id>` `{ trashed: true }` |

Names in `q` escape `\` and `'`. Folder and file ids are kept in memory; a 404 or `labels.trashed` forgets the id and looks it up once more. Content type: `.md` → `text/markdown`, else `text/plain`, with `; charset=utf-8`.

- [ ] **Step 1: Write the failing tests:**
  - `adapterContract(...)` on a `FakeGoogleDrive`.
  - The first write creates the folder `Omark Tasks` once; a second adapter on the same fake reuses it (`folders()` is `['Omark Tasks']`).
  - A write sends `If-Match: <etag>` to the v2 upload URL; a stale etag → `PreconditionFailedError`.
  - After `touchMetadata('tasks.md')`, a write with the old etag → `PreconditionFailedError`, and a read returns the same text with a new etag.
  - A read asks for the head revision's content, not `alt=media` on the file.
  - Two adapters both create `tasks.md` with `ifMatch` null before either finds the other's (the fake holds the first create's list reply): one succeeds, the other throws `PreconditionFailedError`, and the fake ends with one untrashed `tasks.md`.
  - The same race for the folder: both adapters end up writing into the oldest folder.
  - `trash('tasks.md')` after a read: the next read returns null, and `write(…, null)` creates it again.
  - 401 twice → `AuthRequiredError`; 403 `insufficientPermissions` → `AuthRequiredError`; 403 `rateLimitExceeded` and 429 → a plain `Error` (the sync retries); offline → `OfflineError`.
  - The constructor refuses `a/b`, `''`, `.` and `..`.
- [ ] **Step 2:** Run, expect FAIL (module missing).
- [ ] **Step 3: Implement** the fake, then the adapter.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5: Commit** "Add a Google Drive storage adapter".

### Task 5: Client sign-in with a provider

**Files:**
- Modify: `packages/storage/src/auth.ts`
- Test: `packages/storage/test/auth.test.ts`

**Interfaces:**
- Consumes: the helper routes from Task 2.
- Produces: `AuthOptions.providers: Record<string, string>` (id → display name, first = default) replacing `providerName`. `Auth` gains:
  - `signIn(provider?: string)`, which navigates to `/api/auth/login?provider=<id>`. Without an argument it uses the provider last seen signed in, else the default (bare `/api/auth/login` for the default keeps today's URL).
  - `signedInProvider(): string | null`, where `1` maps to the default.
  - `availableProviders(): Promise<string[]>`, from `GET /api/auth/providers`; on any failure, `[default]`.
  - `isSignedIn()` stays `signedInProvider() !== null`.
  - `handleRedirect` names the provider from `?provider=` in its error, and knows `scope`: "Sign in again and allow access to your files in Google Drive" (worded with the display name).

- [ ] **Step 1: Write the failing tests** for each line above, including `taskapp_signed_in=1` → `'microsoft'` and `taskapp_signed_in=google` → `'google'`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5: Commit** "Sign in with a chosen provider".

### Task 6: Names, folders and caches per storage

**Files:**
- Modify: `apps/tasks/src/lib/environment.ts`, `apps/tasks/src/env.ts`, `apps/tasks/src/lib/sync-banner.ts`, `apps/tasks/src/App.svelte` (the unsaved-changes confirm), `apps/tasks/src/lib/boot.ts` (`CACHE_WARNING`)
- Test: `apps/tasks/src/lib/environment.test.ts`, `apps/tasks/src/lib/sync-banner.test.ts`

**Interfaces:**
- Produces:
  - `googleFolderFor(env: AppEnv, buildFolder: string): string`: production `BRAND.app`, staging `BRAND.stagingApp`, else `buildFolder || \`${BRAND.app} Dev\``.
  - `cacheName(provider: 'microsoft' | 'google', folder: string): string`: `taskapp:<folder>` for Microsoft (today's name), `taskapp:google:<folder>` for Google.
  - `STORAGE_NAMES = { microsoft: 'OneDrive', google: 'Google Drive' }`.
  - `env.ts`: `GOOGLE_FOLDER = googleFolderFor(APP_ENV, import.meta.env.VITE_GOOGLE_FOLDER ?? '')`.
  - The banner and the confirm text take `storageName: string` (default `'OneDrive'`, so today's tests stay green).

- [ ] **Step 1: Write the failing tests:** the three folders; the two cache names differ for the same folder; banner texts with `Google Drive` for offline, slow and sign-in.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5: Commit** "Name the storage in use and keep its own cache".

### Task 7: Boot, sign-in screen and e2e

**Files:**
- Modify: `apps/tasks/src/lib/boot.ts`, `apps/tasks/src/lib/auth-stub.ts`, `apps/tasks/src/components/SignIn.svelte`, `apps/tasks/src/App.svelte`
- Create: `apps/tasks/e2e/google-drive.spec.ts`
- Modify: `apps/tasks/e2e/helpers.ts` (an option for provider and stub)

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - `BootResult`: `{ kind: 'signin'; auth; providers: string[] }` and `ready` with `storageName: string`.
  - Real mode: `signedInProvider()` picks `GoogleDriveAdapter({ folder: GOOGLE_FOLDER })` or today's OneDrive adapter, with `cacheName(...)` and a synced-at key per cache.
  - Fake mode: a new stub state `'google'` (signed in with Google, tokens granted) builds a `GoogleDriveAdapter` over a `FakeGoogleDrive` exposed as `window.__taskappFake`.
  - `window.__TASKAPP_PROVIDERS__?: string[]` (default `['microsoft']`) is what the stub's `availableProviders()` returns.
  - `SignIn.svelte` props: `{ providers: string[]; onsignin(provider: string): void; error }`. With one provider, today's text and button. With two: "Your tasks live in plain files in your OneDrive or Google Drive. Sign in to open them." and the buttons "Sign in with Microsoft" and "Sign in with Google".

- [ ] **Step 1: Write the failing e2e tests** (both projects):
  - With providers `['microsoft', 'google']` and the stub signed out: both buttons show; clicking Google records `signIn('google')` on `window.__taskappAuth`.
  - With the default providers: no Google button.
  - Stub `'google'`, empty drive: the list shows the Always and Tasks headings; adding "Buy milk" puts it in `__taskappFake.peek('tasks.md')`; `__taskappFake.folders()` is `['Omark Tasks Dev']`.
  - Stub `'google'`: `externalWrite('tasks.md', …)` plus the usual sync trigger shows the outside task next to a local one (the 412 merge path).
  - Stub `'google'` and `setOffline(true)`: the banner reads "Can't reach Google Drive".
- [ ] **Step 2:** `pnpm e2e`, expect the new tests to FAIL.
- [ ] **Step 3: Implement.** The `boot.ts` fake-branch edit stays one small `if` (2.1 rewrites that branch).
- [ ] **Step 4:** Run all four commands, expect PASS.
- [ ] **Step 5: Commit** "Open Google Drive when signed in with Google".

### Task 8: Docs, staging secrets and the redirect URI

**Files:**
- Modify: `README.md` (sign-in and environment variables), `.env.example` (after merging main, if 2.1 has landed), `doc/TaskApp v1 spec.md` (storage), `doc/TaskApp open source launch spec.md` 6.4.1 (one paragraph of findings)

- [ ] **Step 1:** Document `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `VITE_GOOGLE_FOLDER`; the `/api/auth/providers` switch; and the two-provider sign-in.
- [ ] **Step 2:** Set the Pages secrets on `taskapp-staging` from `C:\Users\alipk\.secrets\omark-tasks-staging-google-client.json`, by piping `node -p` output into `wrangler pages secret put`, never echoed.
- [ ] **Step 3:** Add `https://tasks-staging.alipka.com/api/auth/callback` to the "web v2" client's redirect URIs (Google Cloud console, `hello@omark.app`, browser pane). `staging-tasks.omark.app` is already there for 3.3.
- [ ] **Step 4:** Check `curl -sI https://tasks-staging.alipka.com/api/auth/providers` after the merge, once staging deploys. Until then, check locally with `wrangler pages dev` on port 8788 and the same secrets in `.dev.vars` (git-ignored).
- [ ] **Step 5: Commit** "Document Google Drive storage".

### Final review

- [ ] All four commands green; merge main; a fresh-eyes review subagent checks `git diff main...HEAD` against this plan; fix, re-run, push; PR with `Closes #61`, the failing lines, and "try this": `pnpm e2e:real` is Microsoft-only, and the Google manual steps are below.
- [ ] `NEEDS AL`: sign in on staging with `hello@omark.app` (consent with the Drive box ticked), add a task, check `My Drive/Omark Tasks Staging`, then edit `tasks.md` through Google Drive for desktop and check the app merges it.
