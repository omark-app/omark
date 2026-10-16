# TaskApp v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TaskApp v1 — a one-page PWA that keeps dated buckets, a Someday list, recurring tasks and ALWAYS lines in plain markdown files in the user's OneDrive — test-first, deployed to `tasks.alipka.com`.

**Architecture:** A pnpm TypeScript monorepo. `packages/core` is pure logic over text (parse/serialize, buckets, recurrence, stats, three-way merge, config). `packages/storage` moves text between OneDrive (Graph + MSAL), an offline IndexedDB cache and the app, resolving eTag conflicts with core's merge. `apps/web` is a Svelte 5 + Vite PWA whose store turns user actions into core operations. Milestone 1 is a thin slice (deploy + sign-in + read/write `tasks.md` on a real iPhone) to retire the risks in spec §16 before the bulk of the work.

**Tech Stack:** Node 24 LTS, pnpm 10 workspaces, TypeScript (strict), Vitest, Playwright, Svelte 5 (runes), Vite, vite-plugin-pwa, @azure/msal-browser, `yaml` (eemeli), `node-diff3`, `idb-keyval`, `fake-indexeddb` (tests), @fontsource/ibm-plex-mono + @fontsource/geist, GitHub Actions, Cloudflare Pages (wrangler-action).

**Spec:** `doc/TaskApp v1 spec.md` (UI reference: `prototype/taskapp-ui-prototype.html` on branch `prototype/ui`; where they disagree the spec wins). Out-of-scope items go to `doc/TaskApp backlog.md`.

## Global Constraints

- **Runtime:** CI pins Node 24 via `.nvmrc`; local dev runs on the user's Node 22.16 (`engines.node: ">=22"`). pnpm is installed with `npm i -g pnpm@10` if missing.
- **Credentials:** never ask the user to paste a secret into chat. Secrets arrive as files in `C:\Users\alipk\.secrets\` and are read only via redirection inside the command that uses them (`gh secret set NAME < file`, `CLOUDFLARE_API_TOKEN="$(cat file)" npx wrangler …` with output that never echoes them), then the file is deleted after the user's OK.
- **Purity:** `packages/core` has no DOM, network, storage or framework imports. Its `tsconfig.json` sets `"lib": ["ES2023"]` (no `DOM`) so a violation fails typecheck.
- **Dates:** All dates are `ISODate` strings `YYYY-MM-DD` in the device's local time zone. Date arithmetic is done on calendar dates (UTC-based internally), never by adding 24 h to a timestamp. Formatting is `en-GB` (`Thu`, `12 Nov`).
- **Weeks:** Monday–Sunday by default; `firstDayOfWeek` in config shifts them. "This week" means today up to the last day of the week; "Next week" means the 7 days after that.
- **Files:** `tasks.md`, `done.md` and `config.yaml` live in the OneDrive folder `ALAI/TaskApp` (`VITE_ONEDRIVE_FOLDER`, default `ALAI/TaskApp`). Scope: `Files.ReadWrite`. They are read as UTF-8 with any BOM stripped and CRLF normalised to LF, and written as UTF-8 with LF.
- **Canonical task line:** `- [ ] {title} 🔁 {rule} 📅 {date}`. Notes are written as `    - {note}`. Done lines are `- [x] {title} 🔁 {rule} ✅ {date}`. Any 🔁 or 📅 part that doesn't apply is left out.
- **Privacy:** The app talks to `graph.microsoft.com`, `login.microsoftonline.com` and OneDrive download URLs, and nothing else. No analytics, no font CDN (fonts are bundled), no backend.
- **Palette and type:** Use the CSS tokens from the prototype `:root` / dark blocks verbatim (`--bg #F2F4F7`, `--surface #FFFFFF`, `--ink #151A22`, `--muted #677084`, `--faint #A2A9B7`, `--line #DCE0E7`, `--sel #EAEEF4`, `--chip #EEF1F5`, `--accent #2B59D6`, `--danger #C63B3B`, `--good #2C8A55`, plus their dark counterparts). Use IBM Plex Mono for user content and Geist for chrome, with system fallbacks.
- **Breakpoint:** Under 720 px wide is "phone". Phones always get the Task list.
- **Touch constants:** Long-press hold 400 ms, move slop 8 px, swipe starts at 10 px horizontal (and |dx| > 1.3·|dy|), swipe commits at 90 px, autoscroll zones 90 px top / 150 px bottom.
- **Toasts:** Toasts show for 4.2 s. Every state change shows a toast with **Undo**.
- **Empty-bucket copy:** Today `Nothing due. Enjoy it.` · This week `Nothing else this week.` · Next week `Nothing planned yet.` · Later `Nothing scheduled.` · Someday `No someday ideas.`
- **Test ids (shared by all UI tasks):** `add-input`, `bucket-{key}`, `bucket-head-{key}`, `bucket-count-{key}`, `task-row` (with `data-id`), `task-check`, `task-meta`, `detail`, `detail-title`, `detail-notes`, `detail-due`, `detail-repeat`, `always-line`, `always-add`, `stats`, `status`, `toast`, `toast-undo`, `sheet`, `fab`, `config-banner`, `hints`. Bucket keys are `today | week | next | later | someday`.
- **Commands:** `pnpm test` runs all Vitest projects. `pnpm e2e` builds the app with `VITE_STORAGE=fake` and runs Playwright. `pnpm typecheck` runs across the workspace. A task isn't done until all three are green.
- **Commits:** Commit messages are short imperative sentences, matching the existing history (e.g. `Add tasks.md parser`).

## Planning decisions (agreed 2026-10-16, addendum to the spec)

1. **Repeat wording** uses Obsidian Tasks syntax:
   - `every day`
   - `every weekday`
   - `every week on Monday, Thursday`
   - `every month on the 15th`
   - `every year`
   - `every 3 days` and `every 2 weeks`
   - `every 3 days when done` for "N days after completion"

   A 🔁 rule the app can't parse stays as text in the title, and the task is treated as non-repeating.
2. **No IDs in the file.** The merge works on whole task blocks (the task line plus its notes). IDs exist only in memory and carry across reloads by matching block text.
3. **Unknown content round-trips byte-for-byte.** This covers other headings, free text, other emoji fields and odd spacing. A task the app didn't change is written back exactly as it was read.
4. **`- [x]` lines found in `tasks.md`** (e.g. ticked in Obsidian) are moved to `done.md` on the next sync and count in stats.
5. **Un-completing is Undo only** in v1. Undo restores the previous state, including the date of a repeating task and the removal of its `done.md` line.
6. **The undo history is cleared** whenever an outside change is merged in.
7. **Month and year edge cases:** "Monthly on day 31" falls on the last day of shorter months. "Yearly" on 29 Feb falls on 28 Feb in other years.
8. **Later dates in another year** show as `12 Nov '27`.
9. **Folder and Entra client ID are set when the app is built** (`VITE_ONEDRIVE_FOLDER`, `VITE_MSAL_CLIENT_ID`), not in `config.yaml`.
10. **First run** shows a sign-in screen. Any missing file is created: `tasks.md` as `# Always\n\n# Tasks\n`, `done.md` empty, and `config.yaml` as the fully commented defaults.
11. **Status states:** `saved`, `syncing`, `offline`, and `sign in needed` (when the token refresh fails).
12. **Offline:** The cache in IndexedDB holds `{ base, baseEtag, local, dirty }` per file. There is no operation queue: on reconnect, the dirty local text is merged with the remote and written.
13. **Midnight:** Buckets recompute at local midnight and whenever the app regains focus.
14. **Fonts** are self-hosted via @fontsource. **The service worker** auto-updates: a new version takes effect on the next open.
15. **Sundays:** The "This week" chip and option are hidden, and `w` moves the task to Today (as in the prototype).
16. **`dateLabels`** is `short` (`Thu` / `12 Nov`, the default) or `iso` (`2026-10-16`).
17. **`firstDayOfWeek`** is supported generically.
18. **Todoist import:** Open tasks from all projects go into one flat list, subtasks become notes, priorities and labels are dropped, and ALWAYS lines are typed by hand.
19. **The real-OneDrive smoke test** is run by hand only. A nightly run is in the backlog.
20. **The Claude Code skill** lives at `.claude/skills/taskapp-files/SKILL.md`, with a documented step to copy it into `~/.claude/skills/`.
21. **New tasks** are appended at the end of the Tasks section.

## Review Focus

1. **A hand-edited `tasks.md`** with CRLF line endings, a BOM, tab-indented or `*` notes, `📅2026-10-16` without a space, or fields in another order must parse correctly and be written back without losing anything. Tests go in Task 8.
2. **The app left open overnight or across a DST change** must have every task move to the right bucket at midnight and on focus, with no date off by one. Tests go in Task 5 (DST) and Task 19 (`tick`).
3. **The app hidden or killed mid-save on iOS, or two saves in quick succession:** the local text must reach the cache before any network call, writes must not overlap, and the last save wins. Tests go in Task 17.
4. **The same file edited on two devices while one is offline, including adjacent tasks changed on each side:** no edit may be lost, and an unchanged task must never be duplicated. Tests go in Task 14 and Task 17.
5. **A shortcut letter typed into the add input, the detail, an ALWAYS line or a sheet** must type the letter, not trigger a command. Ctrl+Z inside a field must do the browser's text undo. Tests go in Task 21.

---

## Milestone 1 — Thin slice: deployed, signed in, reading and writing `tasks.md`

### Task 1: Monorepo scaffold with CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts` (root, `test.projects` over `packages/*`, `apps/web`, `tools/*`), `.gitignore`, `.nvmrc` (`24`), `.github/workflows/ci.yml`
- Create: `packages/core/{package.json,tsconfig.json,src/index.ts}`, `packages/core/test/smoke.test.ts`

**Interfaces:**
- Produces: the package name `@taskapp/core` (ESM, `exports: "./src/index.ts"`, consumed as source). Root scripts `test`, `typecheck`, `e2e`.

- [ ] **Step 1: Write the failing test** `packages/core/test/smoke.test.ts`: `import { VERSION } from '../src'; expect(VERSION).toBe('0.1.0')`.
- [ ] **Step 2: Run** `pnpm install && pnpm test` → FAIL (`VERSION` not exported).
- [ ] **Step 3: Implement.** Export `VERSION = '0.1.0'`. In `ci.yml`, on every push and PR: checkout, `pnpm/action-setup`, `actions/setup-node` with `.nvmrc` and the pnpm cache, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` → PASS. Push to a branch and confirm the Actions run is green.
- [ ] **Step 5: Commit** `Add pnpm monorepo scaffold with CI`.

### Task 2: Web shell, e2e harness and Cloudflare Pages deploy

**Files:**
- Create: `apps/web/{package.json,vite.config.ts,svelte.config.js,tsconfig.json,index.html,playwright.config.ts}`, `apps/web/src/{main.ts,App.svelte,env.ts}`, `apps/web/src/styles/{tokens.css,base.css}`, `apps/web/public/icons/*` (192, 512, 180 apple-touch), `apps/web/e2e/shell.spec.ts`
- Modify: `.github/workflows/ci.yml` (e2e job, deploy job)

**Interfaces:**
- Produces: `env.ts` exports `STORAGE_MODE: 'fake' | 'onedrive'` (from `VITE_STORAGE`, default `onedrive`), `ONEDRIVE_FOLDER`, `MSAL_CLIENT_ID`. Playwright has the projects `desktop` (Desktop Chrome, 1280×800) and `iphone` (`devices['iPhone 15']`, WebKit), and its webServer runs `VITE_STORAGE=fake vite build && vite preview --port 4173`.

- [ ] **Step 1: Write the failing e2e** `shell.spec.ts`: the page title is `TaskApp`; `<link rel="manifest">` resolves to JSON with `name: 'TaskApp'` and `display: 'standalone'`; the computed `body` background is `rgb(242, 244, 247)` in the light colour scheme. Both projects.
- [ ] **Step 2: Run** `pnpm e2e` → FAIL (no app).
- [ ] **Step 3: Implement** a Svelte 5 + Vite app with vite-plugin-pwa (`registerType: 'autoUpdate'`, the manifest above, `theme_color #F2F4F7`) and the token CSS from the prototype. CI: add an `e2e` job (`pnpm exec playwright install --with-deps chromium webkit`, `pnpm e2e`). Add a `deploy` job that runs only on `main` after `test` and `e2e` pass: it builds with `VITE_MSAL_CLIENT_ID=${{ vars.MSAL_CLIENT_ID }}` and runs `cloudflare/wrangler-action` with `pages deploy apps/web/dist --project-name=taskapp`, using the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- [ ] **Step 4: Run** `pnpm e2e` → PASS.
- [ ] **Step 5: Cloudflare and GitHub setup (controller, not the subagent).** The user has already saved the token file `C:\Users\alipk\.secrets\cloudflare-api-token.txt` (permissions: Pages Edit, Account Settings Read, DNS Edit on `alipka.com`). The controller then:
  1. Looks up the account ID with `npx wrangler whoami`.
  2. Runs `npx wrangler pages project create taskapp --production-branch=main`.
  3. Adds the custom domain `tasks.alipka.com` via the Cloudflare API (`POST /accounts/{id}/pages/projects/taskapp/domains`), plus a proxied CNAME `tasks` → `taskapp.pages.dev` in the `alipka.com` zone.
  4. Sets `gh secret set CLOUDFLARE_API_TOKEN < file` and `gh secret set CLOUDFLARE_ACCOUNT_ID`.
  5. Deletes the token file.

  Then merge to `main` and confirm `https://tasks.alipka.com` serves the shell.
- [ ] **Step 6: Commit** `Add web shell, Playwright harness and Pages deploy`.

### Task 3: Storage adapter contract, fake OneDrive and Graph adapter

**Files:**
- Create: `packages/storage/{package.json,tsconfig.json}`, `packages/storage/src/{index.ts,adapter.ts,errors.ts,fake-onedrive.ts,onedrive-adapter.ts}`
- Test: `packages/storage/test/adapter-contract.ts` (shared suite), `packages/storage/test/fake-onedrive.test.ts`, `packages/storage/test/onedrive-adapter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type FileName = 'tasks.md' | 'done.md' | 'config.yaml';
  interface RemoteFile { text: string; etag: string }
  interface StorageAdapter {
    read(name: FileName): Promise<RemoteFile | null>;                          // null = file does not exist
    write(name: FileName, text: string, ifMatch: string | null): Promise<{ etag: string }>; // null = create only
  }
  class PreconditionFailedError extends Error {}  // eTag mismatch or file already exists on create
  class OfflineError extends Error {}
  class AuthRequiredError extends Error {}
  class FakeOneDrive implements StorageAdapter {
    constructor(files?: Partial<Record<FileName, string>>);
    externalWrite(name: FileName, text: string): void;  // simulates another device
    setOffline(offline: boolean): void;
    peek(name: FileName): string | null;
  }
  class OneDriveAdapter implements StorageAdapter {
    constructor(opts: { folder: string; getToken: () => Promise<string>; fetch?: typeof fetch });
  }
  ```

- [ ] **Step 1: Write the failing contract suite** `adapterContract(make: () => { adapter: StorageAdapter; external(name, text): void; offline(on: boolean): void })`. It covers:
  - Reading a missing file returns `null`.
  - `write(name, 'a', null)` creates the file, and a second create throws `PreconditionFailedError`.
  - Writing with the current eTag succeeds and returns a new eTag.
  - Writing with a stale eTag after `external()` throws `PreconditionFailedError`.
  - `read` returns the externally written text.
  - While `offline(true)`, `read` and `write` throw `OfflineError`.

  Run it from `fake-onedrive.test.ts` against `FakeOneDrive`, and from `onedrive-adapter.test.ts` against `OneDriveAdapter` backed by a `fetch` stub that emulates Graph. Also add Graph-specific tests:
  - `read` does `GET https://graph.microsoft.com/v1.0/me/drive/root:/ALAI/TaskApp/tasks.md` with `Authorization: Bearer <token>`, then fetches `@microsoft.graph.downloadUrl` **without** an Authorization header.
  - `write` does `PUT …/root:/ALAI/TaskApp/tasks.md:/content` with `If-Match` (or `If-None-Match: *` when creating) and `Content-Type: text/plain; charset=utf-8`.
  - A 401 calls `getToken` once more and retries; a second 401 throws `AuthRequiredError`.
  - A `fetch` rejection with `TypeError` throws `OfflineError`.
- [ ] **Step 2: Run** `pnpm --filter @taskapp/storage test` → FAIL.
- [ ] **Step 3: Implement** both adapters. `FakeOneDrive` eTags are `"v1"`, `"v2"`, … per file. Map a Graph 412, or a 409 on create, to `PreconditionFailedError`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `Add storage adapter contract, fake OneDrive and Graph adapter`.

### Task 4: MSAL sign-in and real-device spike

**Files:**
- Create: `packages/storage/src/auth.ts`, `packages/storage/test/auth.test.ts`, `apps/web/src/spike/Spike.svelte`, `doc/TaskApp spike findings.md`
- Modify: `apps/web/src/App.svelte` (render `Spike` for now)

**Interfaces:**
- Produces:
  ```ts
  interface Auth { signIn(): Promise<void>; getToken(): Promise<string>; isSignedIn(): boolean; handleRedirect(): Promise<void> }
  function createAuth(opts: { clientId: string; redirectUri: string; msal?: IPublicClientApplication }): Auth
  ```
  The scopes are `['Files.ReadWrite']`. The authority is `https://login.microsoftonline.com/consumers`. Sign-in uses the **redirect** flow (popups are unreliable in iOS standalone mode), and the token cache is `localStorage`.

- [ ] **Step 1: Write the failing tests** against a stub `IPublicClientApplication`:
  - `getToken` returns `acquireTokenSilent`'s `accessToken`.
  - When silent acquisition throws `InteractionRequiredAuthError`, `getToken` throws `AuthRequiredError` and does **not** redirect on its own.
  - `signIn` calls `loginRedirect` with the scopes.
  - `handleRedirect` sets the active account from `handleRedirectPromise`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `createAuth`.** Build `Spike.svelte`: a sign-in button, a textarea with the contents of `tasks.md` from `OneDriveAdapter`, a Save button that writes with `If-Match`, and a line showing the eTag and the last error.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Entra client ID (controller).** The user has registered "TaskApp" (personal Microsoft accounts only, SPA redirect URIs `https://tasks.alipka.com/` and `http://localhost:5173/`) and pasted the client ID into chat. The controller runs `gh variable set MSAL_CLIENT_ID --body <id>` and writes it to `apps/web/.env.local` (gitignored) for local dev. Merge so the spike deploys.
- [ ] **Step 6: Run the device checks** and record the results in `doc/TaskApp spike findings.md` (each line PASS/FAIL plus a note):
  1. Brave on Windows: install the PWA, sign in, edit, and check that the edit appears in Obsidian.
  2. iPhone: add to the home screen, sign in from standalone mode, and return to the app signed in.
  3. Kill the iPhone app, reopen it after more than one hour, and confirm the silent token refresh works.
  4. Edit in Obsidian, then save in the app: a 412 is raised (confirms `If-Match` works on simple upload).
  5. Deploy a trivial change and confirm the iPhone picks it up on the next open.

  If any check fails, stop and bring the findings to the user before Milestone 2.
- [ ] **Step 7: Commit** `Add MSAL auth and thin-slice spike` (include the findings doc).

## Milestone 2 — `packages/core`

### Task 5: Dates and week context

**Files:**
- Create: `packages/core/src/{model.ts,dates.ts}`
- Test: `packages/core/test/dates.test.ts`

**Interfaces:**
- Produces (in `model.ts`): `ISODate`; `WeekCtx { today: ISODate; weekStart: number /* 0 = Monday … 6 = Sunday */ }`; `BucketKey`.
- Produces (in `dates.ts`): `toISODate(d: Date): ISODate` (local), `addDays(d: ISODate, n: number): ISODate`, `daysBetween(a: ISODate, b: ISODate): number` (b − a), `dayOfWeek(d: ISODate): number` (0 = Mon), `daysInMonth(year: number, month1: number): number`, `weekCtx(now: Date, weekStart?: number): WeekCtx`, `endOfWeek(ctx): ISODate`, `endOfNextWeek(ctx): ISODate`, `hasWeekLeft(ctx): boolean`.

- [ ] **Step 1: Write the failing tests:**
  ```ts
  const fri = { today: '2026-10-16', weekStart: 0 }, sun = { today: '2026-10-18', weekStart: 0 };
  expect(endOfWeek(fri)).toBe('2026-10-18'); expect(endOfNextWeek(fri)).toBe('2026-10-25');
  expect(endOfWeek(sun)).toBe('2026-10-18'); expect(hasWeekLeft(sun)).toBe(false); expect(hasWeekLeft(fri)).toBe(true);
  expect(endOfWeek({ today: '2026-10-16', weekStart: 6 })).toBe('2026-10-17'); // Sunday-start week ends Saturday
  expect(addDays('2026-10-24', 2)).toBe('2026-10-26');   // across the EU DST change (25 Oct 2026)
  expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  expect(daysBetween('2026-10-03', '2026-10-16')).toBe(13);
  expect(dayOfWeek('2026-10-19')).toBe(0);
  expect(daysInMonth(2028, 2)).toBe(29);
  expect(toISODate(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16');
  ```
- [ ] **Step 2: Run** `pnpm --filter @taskapp/core test dates` → FAIL.
- [ ] **Step 3: Implement.** Do the arithmetic via `Date.UTC` on the parsed y/m/d.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add date and week helpers to core`.

### Task 6: Repeat rules — parse and format

**Files:**
- Create: `packages/core/src/repeat-format.ts`; extend `model.ts`
- Test: `packages/core/test/repeat-format.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type RepeatRule =
    | { type: 'daily' } | { type: 'weekdays' } | { type: 'weekly'; days: number[] /* 0 = Mon, sorted, non-empty */ }
    | { type: 'monthly'; day: number /* 1–31 */ } | { type: 'yearly' }
    | { type: 'every'; n: number; unit: 'days' | 'weeks' } | { type: 'after'; n: number };
  parseRepeat(text: string): RepeatRule | null   // file wording, case-insensitive, trims
  formatRepeat(rule: RepeatRule): string          // file wording
  describeRepeat(rule: RepeatRule): string        // UI wording
  ```

- [ ] **Step 1: Write the failing tests** as a round-trip table (`formatRepeat(parseRepeat(s)) === s`):

  | File wording | Rule | `describeRepeat` |
  |---|---|---|
  | `every day` | daily | `every day` |
  | `every weekday` | weekdays | `weekdays` |
  | `every week on Monday, Thursday` | weekly `[0,3]` | `every Mon, Thu` |
  | `every month on the 1st` / `2nd` / `3rd` / `15th` / `22nd` / `31st` | monthly | `every month on the 1st` (etc.) |
  | `every year` | yearly | `every year` |
  | `every 3 days` | every 3 days | `every 3 days` |
  | `every 2 weeks` | every 2 weeks | `every 2 weeks` |
  | `every 3 days when done` | after 3 | `3 days after done` |
  | `every 1 day when done` | after 1 | `1 day after done` |

  Also test:
  - `parseRepeat('Every Week On thursday, monday')` returns days `[0,3]`.
  - `parseRepeat('every 2nd tue')`, `''`, `'every month on the 32nd'` and `'every 0 days'` all return `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add repeat rule parsing and formatting`.

### Task 7: Recurrence — next date and fitting a rule

**Files:**
- Create: `packages/core/src/recurrence.ts`
- Test: `packages/core/test/recurrence.test.ts`

**Interfaces:**
- Produces: `matchesRule(rule, d: ISODate): boolean`, `nextDate(rule, due: ISODate | null, today: ISODate): ISODate`, `fitDate(rule, date: ISODate | null, today: ISODate): ISODate`.

- [ ] **Step 1: Write the failing tests** (spec §6):
  ```ts
  expect(nextDate({ type: 'daily' }, '2026-10-13', '2026-10-16')).toBe('2026-10-17');           // 3 days overdue → tomorrow
  expect(nextDate({ type: 'weekly', days: [0, 3] }, '2026-10-12', '2026-10-14')).toBe('2026-10-15'); // overdue Mon, done Wed → Thu
  expect(nextDate({ type: 'weekdays' }, '2026-10-16', '2026-10-16')).toBe('2026-10-19');
  expect(nextDate({ type: 'monthly', day: 31 }, '2026-10-31', '2026-10-31')).toBe('2026-11-30');
  expect(nextDate({ type: 'monthly', day: 31 }, '2026-11-30', '2026-11-30')).toBe('2026-12-31'); // steps by rule day, not clamped day
  expect(nextDate({ type: 'yearly' }, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
  expect(nextDate({ type: 'every', n: 2, unit: 'weeks' }, '2026-10-02', '2026-10-16')).toBe('2026-10-30');
  expect(nextDate({ type: 'after', n: 3 }, '2026-10-01', '2026-10-16')).toBe('2026-10-19');
  expect(nextDate({ type: 'daily' }, '2026-10-20', '2026-10-16')).toBe('2026-10-21');           // completed early: steps from due date
  expect(fitDate({ type: 'weekly', days: [0] }, '2026-10-16', '2026-10-16')).toBe('2026-10-19');
  expect(fitDate({ type: 'weekly', days: [4] }, '2026-10-16', '2026-10-16')).toBe('2026-10-16'); // already fits → kept
  expect(fitDate({ type: 'weekly', days: [0] }, null, '2026-10-16')).toBe('2026-10-19');
  expect(fitDate({ type: 'after', n: 3 }, null, '2026-10-16')).toBe('2026-10-16');
  expect(fitDate({ type: 'monthly', day: 31 }, '2026-11-05', '2026-10-16')).toBe('2026-11-30');
  ```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Use the prototype's `step`/`matches` approach, but step `monthly` and `yearly` from the rule's anchor day so clamping doesn't drift. `nextDate` loops `step` until the date is after `today`. `fitDate` keeps `date` if it matches the rule, otherwise takes the first matching date on or after it (or after `today` when there's no date). `every` and `after` always match.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add recurrence next-date and fit rules`.

### Task 8: `tasks.md` parse and serialize

**Files:**
- Create: `packages/core/src/tasks-file.ts`; extend `model.ts`
- Test: `packages/core/test/tasks-file.test.ts`, `packages/core/test/fixtures/{spec-example.md,messy.md}`

**Interfaces:**
- Produces:
  ```ts
  interface Task { id: string; title: string; notes: string[]; date: ISODate | null; repeat: RepeatRule | null; raw: string[] | null; rawKey: string | null }
  type Item = { kind: 'task'; task: Task } | { kind: 'done'; entry: DoneEntry; raw: string[] } | { kind: 'raw'; lines: string[] };
  interface TasksDoc { preamble: string[]; always: string[]; items: Item[] }
  parseTasks(text: string, newId?: () => string): TasksDoc
  serializeTasks(doc: TasksDoc): string
  taskKey(t: Pick<Task, 'title' | 'notes' | 'date' | 'repeat'>): string
  ```
  - `items` is everything after `# Tasks`, in file order. `preamble` is anything before `# Always`.
  - A task the app hasn't changed (`taskKey(t) === t.rawKey`) is written back as `raw`. A changed task is written in canonical form.
  - A 🔁 is extracted only if `parseRepeat` accepts it; otherwise its text stays in the title.
  - `DoneEntry` is defined in Task 9. Declare it in `model.ts` now: `{ title: string; repeat: RepeatRule | null; doneOn: ISODate | null }` (`null` for a `- [x]` line with no ✅ date, e.g. ticked in Obsidian without the Tasks plugin).

- [ ] **Step 1: Write the failing tests:**
  - `spec-example.md` (the spec §3.3 block) round-trips byte-for-byte. It parses to 4 tasks; the first has notes `['ask about zirconia', 'bring the old x-ray']` and date `2026-10-16`; the second has repeat weekly `[0]`; the last has date `null`; and `always` is `['Walk before the first coffee', 'One tab at a time']`.
  - The same text with CRLF and a BOM parses to the same doc as the LF version.
  - `messy.md` contains:
    - a `## Errands` heading;
    - a free-text line;
    - blank lines;
    - `- [ ] Fix bike ⏫ #home 📅 2026-10-20`;
    - `- [ ] Pay 📅2026-10-17`;
    - `- [ ] Plants 📅 2026-10-19 🔁 every week on Monday`;
    - a task with tab-indented `* note` lines;
    - `- [ ] Odd 🔁 every 2nd tue`.

    It must round-trip byte-for-byte. Then edit only the `Pay` task's title and serialize: every other line is unchanged, and `Pay` comes out as `- [ ] Pay rent 📅 2026-10-17`.
  - The parsed values from `messy.md`:
    - `Fix bike ⏫ #home` keeps that title with date `2026-10-20`.
    - `Pay` has date `2026-10-17`.
    - `Plants` has repeat weekly `[0]`.
    - The tab-indented notes come out as plain text.
    - `Odd 🔁 every 2nd tue` keeps the 🔁 text in its title, with repeat `null`.
  - A file with no headings (`- [ ] A\n- [ ] B\n`) gives 2 tasks and empty `always`. Serializing gives `# Always\n\n# Tasks\n- [ ] A\n- [ ] B\n`.
  - The line `- [x] Done thing ✅ 2026-10-15` in the Tasks section becomes `{ kind: 'done', entry: { title: 'Done thing', repeat: null, doneOn: '2026-10-15' } }`.
  - IDs are unique, and they come from the injected `newId`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a line-by-line parser with a section state (`preamble | always | tasks`).
  - In the Always section, `- ` lines become always entries.
  - A task block is a `- [ ]` line plus any following indented lines.
  - Any other line is collected into a `raw` item.
  - Field extraction: take the 📅 date and 🔁 rule at whatever position they appear. Strip them from the title and collapse the gap to a single space.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add tasks.md parser and serializer`.

### Task 9: `done.md` parse/serialize and sweeping completed lines

**Files:**
- Create: `packages/core/src/done-file.ts`
- Test: `packages/core/test/done-file.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DoneLine { entry: DoneEntry | null; raw: string }   // entry null = unparseable line, kept as is
  interface DoneDoc { lines: DoneLine[] }
  interface State { doc: TasksDoc; done: DoneDoc }               // in model.ts
  parseDone(text: string): DoneDoc
  serializeDone(doc: DoneDoc): string
  doneLine(task: Task, today: ISODate): DoneLine                 // canonical `- [x] {title} 🔁 {rule} ✅ {today}`
  sweepCompleted(state: State, today: ISODate): State | null      // null = nothing to sweep; undated items are stamped with today
  ```

- [ ] **Step 1: Write the failing tests:**
  - The spec §3.4 block round-trips, and its entries are `{ 'Send the invoice', null, '2026-10-16' }` and `{ 'Water the plants', weekly [0], '2026-10-19' }`.
  - A garbage line is kept with `entry: null`.
  - `doneLine` for a weekly task on `2026-10-16` gives `- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16`.
  - `sweepCompleted` on a doc with one `done` item:
    - removes the item from `items`;
    - appends its raw line(s) to `done.lines`;
    - leaves the `- [ ]` tasks untouched;
    - returns `null` when there are no done items.
  - An undated done item (`- [x] Ticked in Obsidian`, `doneOn: null`) swept on `2026-10-16` appends the canonical `- [x] Ticked in Obsidian ✅ 2026-10-16`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add done.md format and completed-line sweep`.

### Task 10: Buckets, ordering and labels

**Files:**
- Create: `packages/core/src/{buckets.ts,labels.ts}`
- Test: `packages/core/test/{buckets.test.ts,labels.test.ts}`

**Interfaces:**
- Produces:
  ```ts
  const BUCKETS: readonly { key: BucketKey; name: string }[]  // Today, This week, Next week, Later, Someday
  bucketOf(t: Task, ctx: WeekCtx): BucketKey
  dateForBucket(key: Exclude<BucketKey, 'later'>, ctx: WeekCtx): ISODate | null
  allTasks(doc: TasksDoc): Task[]                              // file order
  tasksInBucket(doc: TasksDoc, key: BucketKey, ctx: WeekCtx): Task[]  // date asc, then file order
  bucketRange(key: BucketKey, ctx: WeekCtx): string            // 'Sat–Sun', '19 Oct – 25 Oct', ''
  type DateLabelStyle = 'short' | 'iso';
  interface MetaLabel { text: string | null; overdue: boolean; repeat: boolean }
  metaLabel(t: Task, ctx: WeekCtx, style: DateLabelStyle): MetaLabel
  dueText(t: Task, ctx: WeekCtx): string                       // 'Today · Fri 16 Oct', 'Wed 14 Oct · overdue', 'Someday · no date'
  dayMonth(d: ISODate, ctx: WeekCtx): string                   // '12 Nov', "12 Nov '27"
  weekdayShort(d: ISODate): string                             // 'Thu'
  ```

- [ ] **Step 1: Write the failing tests.** The context is `fri = { today: '2026-10-16', weekStart: 0 }`.

  `bucketOf`:

  | Date | Bucket |
  |---|---|
  | `2026-10-10` | today |
  | `2026-10-16` | today |
  | `2026-10-17` | week |
  | `2026-10-18` | week |
  | `2026-10-19` | next |
  | `2026-10-25` | next |
  | `2026-10-26` | later |
  | `null` | someday |

  `dateForBucket`:
  - `'week'` gives `2026-10-18`, or `2026-10-18` on Sunday 18 Oct, so a task set to "This week" on a Sunday lands in Today.
  - `'next'` gives `2026-10-25`.

  `tasksInBucket('today')` puts the overdue `2026-10-10` first, then tasks due `2026-10-16` in file order.

  `metaLabel`:

  | Date | Repeat | Style | Expected |
  |---|---|---|---|
  | `2026-10-15` | — | short | `{ text: 'Thu', overdue: true }` |
  | `2026-10-03` | — | short | `'3 Oct'`, overdue |
  | `2026-10-16` | — | short | `{ text: null, overdue: false, repeat: false }` |
  | `2026-10-16` | weekly | short | `{ text: null, repeat: true }` |
  | `2026-10-22` | — | short | `'Thu'` |
  | `2026-11-12` | — | short | `'12 Nov'` |
  | `2027-11-12` | — | short | `"12 Nov '27"` |
  | `2026-11-12` | — | iso | `'2026-11-12'` |

  `bucketRange('next', fri)` gives `'19 Oct – 25 Oct'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add bucket rules, ordering and date labels`.

### Task 11: Task operations

**Files:**
- Create: `packages/core/src/ops.ts`
- Test: `packages/core/test/ops.test.ts`

**Interfaces:**
- Consumes: `bucketOf`, `dateForBucket`, `nextDate`, `fitDate`, `doneLine`.
- Produces (all pure; each returns a new `State` and leaves the input unchanged):
  ```ts
  findTask(s: State, id: string): Task | null
  addTask(s: State, title: string, bucket: Exclude<BucketKey, 'later'>, ctx: WeekCtx, newId?: () => string): { state: State; id: string } | null // null for blank title
  setDate(s: State, id: string, date: ISODate | null, beforeId?: string | null): State
  moveToBucket(s: State, id: string, bucket: Exclude<BucketKey, 'later'>, ctx: WeekCtx, beforeId?: string | null): State
  reorder(s: State, id: string, beforeId: string): State     // moves the item before beforeId in items
  completeTask(s: State, id: string, today: ISODate): { state: State; next: ISODate | null }
  deleteTask(s: State, id: string): State
  editTask(s: State, id: string, patch: { title: string; notes: string[] }): State  // blank title → unchanged
  setRepeat(s: State, id: string, rule: RepeatRule | null, today: ISODate): State
  setAlways(s: State, lines: string[]): State                // drops blank lines
  ```

- [ ] **Step 1: Write the failing tests** (state parsed from the spec example; today `2026-10-16`):
  - `addTask(s, '  Buy milk ', 'today', fri)` appends an item at the end with title `Buy milk` and date `2026-10-16`. `addTask(s, '   ', …)` returns `null`.
  - `moveToBucket(…, 'someday', …)` sets the date to `null`. `'next'` sets it to `2026-10-25`. With `beforeId`, the item sits directly before that item in `items`.
  - `completeTask` on `Send the invoice`:
    - removes the task;
    - appends `- [x] Send the invoice ✅ 2026-10-16`;
    - returns `next: null`.
  - `completeTask` on `Water the plants` (weekly Mon, due `2026-10-19`):
    - keeps the task with date `2026-10-26`;
    - appends a done line;
    - returns `next: '2026-10-26'`.
  - The input state is deep-equal before and after every op (immutability).
  - `setRepeat` with weekly `[0]` on a task due `2026-10-16` gives date `2026-10-19`. `setRepeat(null)` keeps the date.
  - `editTask` then `serializeTasks`: only that task's lines change.
  - `setAlways(['a', ' ', 'b'])` gives `always: ['a', 'b']`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add pure task operations`.

### Task 12: Drop rules

**Files:**
- Create: `packages/core/src/drop.ts`
- Test: `packages/core/test/drop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DropTarget { bucket: BucketKey; beforeId: string | null }
  type DropOutcome =
    | { kind: 'none' }
    | { kind: 'reorder'; state: State; sameDate: boolean }
    | { kind: 'move'; state: State; bucket: BucketKey }
    | { kind: 'pickDate'; suggested: ISODate; beforeId: string | null };
  planDrop(s: State, id: string, target: DropTarget, ctx: WeekCtx): DropOutcome
  ```

- [ ] **Step 1: Write the failing tests** (spec §4.4):
  - In the same bucket with no `beforeId`, the outcome is `none`.
  - Dropping onto itself is `none`.
  - Before a same-date task, the outcome is `reorder` with `sameDate: true`, and the item order has changed.
  - Before a task with a different date in the same bucket, the outcome is `reorder` with `sameDate: false`, and the date is unchanged.
  - Dropping from Someday onto `today` is a `move` with date `2026-10-16`. Onto `week` it is date `2026-10-18`. Onto `someday` from Today it is date `null`. Onto `next` with `beforeId: X`, the date is `2026-10-25` and the item sits before X.
  - Dropping onto `later` gives `pickDate`, `suggested: '2026-10-26'`, and keeps `beforeId`.
  - On Sunday (`today: '2026-10-18'`), dropping onto `week` is a `move` whose task ends up in the today bucket.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add drag-and-drop rules to core`.

### Task 13: Stats

**Files:**
- Create: `packages/core/src/stats.ts`
- Test: `packages/core/test/stats.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Stats { today: number; avg: number | null; last7: number; prev7: number | null; trend: 'up' | 'down' | 'flat' | null; all: number }
  computeStats(done: DoneDoc, today: ISODate): Stats
  formatStats(s: Stats): string          // 'Today 4 (3.2) · 7d 23 (19 ↑) · All 412'
  ```

- [ ] **Step 1: Write the failing tests** (today `2026-10-16`):
  - **No entries:** `{ today: 0, avg: null, last7: 0, prev7: null, trend: null, all: 0 }`, which formats as `Today 0 (–) · 7d 0 (–) · All 0`.
  - **Only entries from today (2 of them):** `avg: null`, `all: 2`.
  - **Entries:** 10-14 ×2, 10-15 ×1, 10-16 ×3. Expect `today: 3`, `avg: 1.5` (3 completions over 2 full days, zero days count), `last7: 3`, `prev7: null`, `all: 6`. It formats as `Today 3 (1.5) · 7d 3 (–) · All 6`.
  - **First entry `2026-10-02`, 14 full days:** `prev7` is the sum of 10-02..10-08, and `last7` is the sum of 10-09..10-15. The trend is `up` when last7 > prev7, `down` when less, and `flat` (`→`) when equal.
  - Lines with `entry: null` or `doneOn: null` are not counted.
  - `avg` formats to one decimal place.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add completion stats`.

### Task 14: Three-way merge and ID carry-over

**Files:**
- Create: `packages/core/src/merge.ts` (dependency `node-diff3`)
- Test: `packages/core/test/merge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  toBlocks(text: string): string[]                       // one block per heading line, always line, raw line, or task line + its indented lines
  merge3(base: string[], local: string[], remote: string[]): string[]
  mergeTasksText(base: string, local: string, remote: string): string
  mergeDoneText(base: string, local: string, remote: string): string
  carryIds(prev: TasksDoc, next: TasksDoc): TasksDoc     // reuse prev ids for tasks whose serialized block is identical (first unused match)
  ```

- [ ] **Step 1: Write the failing tests:**
  - An edit on only one side is applied.
  - A delete on one side with no change on the other is deleted.
  - Adds on both sides are both kept.
  - **The same task edited differently on each side gives both versions, adjacent.**
  - **Deleted on one side and edited on the other keeps the edited version.**
  - **Adjacent tasks edited one on each side gives both edits, with no duplicate of either original.**
  - An identical edit on both sides gives one copy.
  - A reorder on one side with an edit to a different task on the other gives both changes.
  - `mergeDoneText`: lines appended on both sides are all present. A line removed locally (undo) is gone.
  - `carryIds`: unchanged tasks keep their old ids, and a changed task gets a new id.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `merge3`** with `diff3Merge(local, base, remote, { excludeFalseConflicts: true })`. Resolve each conflict hunk `{ a: local, o: base, b: remote }` like this:
  ```ts
  const out: string[] = [];
  for (const x of a) if (!o.includes(x) || b.includes(x)) out.push(x);   // local new/edited, or base kept by both
  for (const x of b) if (!o.includes(x) && !out.includes(x)) out.push(x); // remote new/edited
  ```
  Both text merges run `toBlocks` on CRLF-normalised input and join the result with `\n`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add block-level three-way merge`.

### Task 15: Config

**Files:**
- Create: `packages/core/src/config.ts` (dependency `yaml`)
- Test: `packages/core/test/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Command = 'focusAdd' | 'down' | 'up' | 'today' | 'thisWeek' | 'nextWeek' | 'pickDate' | 'someday'
    | 'repeat' | 'complete' | 'edit' | 'delete' | 'deselect' | 'undo' | 'switchView';
  type Shortcuts = Record<Command, string[]>;  // KeyboardEvent.key values
  interface Config {
    shortcuts: Shortcuts; defaultView: 'list' | 'board'; firstDayOfWeek: number /* 0 = Mon */;
    foldedOnOpen: BucketKey[]; theme: 'system' | 'light' | 'dark'; dateLabels: DateLabelStyle;
    newTaskBucket: Exclude<BucketKey, 'later'>; saveDelaySeconds: number;
  }
  interface ConfigError { line: number | null; message: string }
  const DEFAULT_CONFIG: Config
  const DEFAULT_CONFIG_YAML: string   // every setting present, each with a comment line above it
  parseConfig(text: string): { config: Config; error: ConfigError | null }
  ```
  The default shortcuts are:

  | Command | Keys |
  |---|---|
  | `focusAdd` | `['/', 'n']` |
  | `down` | `['j', 'ArrowDown']` |
  | `up` | `['k', 'ArrowUp']` |
  | `today` | `['t']` |
  | `thisWeek` | `['w']` |
  | `nextWeek` | `['e']` |
  | `pickDate` | `['d']` |
  | `someday` | `['s']` |
  | `repeat` | `['r']` |
  | `complete` | `['x']` |
  | `edit` | `['Enter']` |
  | `delete` | `['Delete', 'Backspace']` |
  | `deselect` | `['Escape']` |
  | `undo` | `['z']` |
  | `switchView` | `['v']` |

  In YAML, `firstDayOfWeek` is written as a day name (`monday` … `sunday`), and a shortcut can be a single string or a list.

- [ ] **Step 1: Write the failing tests:**
  - `parseConfig('')` gives `DEFAULT_CONFIG` with no error.
  - `parseConfig(DEFAULT_CONFIG_YAML)` deep-equals `DEFAULT_CONFIG`.
  - `'theme: dark\n'` gives defaults with `theme: 'dark'`.
  - `'shortcuts:\n  complete: c\n'` gives `complete: ['c']`, with the other shortcuts at their defaults.
  - `'theme: [\n'` gives defaults plus an error with `line: 1`.
  - `'saveDelaySeconds: -1\n'` gives defaults plus an error on line 1 naming `saveDelaySeconds`.
  - `'foo: 1\n'` gives an error `Unknown setting "foo"` on line 1.
  - Two commands bound to the same key give an error naming both.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `parseDocument` from `yaml`, using `linePos` for line numbers.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add config defaults, parsing and validation`.

## Milestone 3 — `packages/storage`: cache, sync, workspace

### Task 16: Local cache

**Files:**
- Create: `packages/storage/src/cache.ts`
- Test: `packages/storage/test/cache.test.ts` (runs against both implementations; `fake-indexeddb/auto` for IndexedDB)

**Interfaces:**
- Produces:
  ```ts
  interface CachedFile { base: string; baseEtag: string | null; local: string; dirty: boolean }
  interface LocalCache { get(name: FileName): Promise<CachedFile | null>; put(name: FileName, f: CachedFile): Promise<void>; clear(): Promise<void> }
  class MemoryCache implements LocalCache {}
  class IdbCache implements LocalCache { constructor(dbName?: string) }   // idb-keyval store 'taskapp'
  ```

- [ ] **Step 1: Write the failing tests:**
  - `get` on an empty cache returns `null`.
  - A `put` followed by `get` round-trips.
  - `clear` empties the cache.
  - The data survives a new `IdbCache` instance.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add local file cache`.

### Task 17: File sync engine

**Files:**
- Create: `packages/storage/src/file-sync.ts`
- Test: `packages/storage/test/file-sync.test.ts` (integration: `FakeOneDrive` + `MemoryCache` + core merge)

**Interfaces:**
- Produces:
  ```ts
  type SyncStatus = 'saved' | 'syncing' | 'offline' | 'signin';
  class FileSync {
    constructor(opts: { name: FileName; adapter: StorageAdapter; cache: LocalCache; merge: (base: string, local: string, remote: string) => string; initial: string });
    text(): string;
    status(): SyncStatus;
    onStatus(cb: (s: SyncStatus) => void): () => void;
    open(): Promise<string>;                                   // cached local first; then pull; creates remote with `initial` if missing
    pull(): Promise<{ text: string; changed: boolean }>;       // changed = remote content altered our text
    save(text: string): Promise<void>;                         // cache.put(dirty) BEFORE any network call
  }
  ```

- [ ] **Step 1: Write the failing integration tests:**
  - **Opening with no remote and no cache** creates the remote with `initial` and reaches status `saved`.
  - **An external write followed by `pull()`** returns `changed: true` with the external text.
  - **A local save after a remote change (412)** writes the merged text containing both edits, and the cache is no longer dirty.
  - **Saving while offline** sets status `offline`, leaves the cache dirty, and leaves the remote unchanged. After going back online, `pull()` makes the remote equal the local text.
  - **Both sides edit the same task while offline:** after reconnecting, the remote contains both versions.
  - **Opening while offline with a cache** returns the cached local text, with status `offline`.
  - **Crash safety:** an adapter whose `write` never resolves still leaves `cache.local` equal to the saved text. A new `FileSync` on the same cache opens with that text.
  - **Two saves in quick succession** are serialized: the writes don't overlap, and the final remote is the second text.
  - **`pull()` while dirty, with the remote unchanged,** keeps the local text and returns `changed: false`.
  - **`AuthRequiredError`** sets status `signin`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Serialize operations through one promise chain. A merge uses `base` (the last synced text). On a 412, retry the pull, merge and write up to 3 times.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add file sync with eTag conflicts and offline cache`.

### Task 18: Workspace

**Files:**
- Create: `packages/storage/src/workspace.ts`
- Test: `packages/storage/test/workspace.test.ts`

**Interfaces:**
- Consumes: `FileSync`, `mergeTasksText`, `mergeDoneText`, `DEFAULT_CONFIG_YAML`.
- Produces:
  ```ts
  interface Snapshot { tasks: string; done: string; config: string }
  interface Workspace {
    open(): Promise<Snapshot>;
    refresh(): Promise<Snapshot & { changed: boolean }>;   // re-reads all three files
    save(files: { tasks?: string; done?: string }): Promise<void>; // tasks.md first, then done.md
    status(): SyncStatus;                                   // worst of the three: signin > offline > syncing > saved
    onStatus(cb: (s: SyncStatus) => void): () => void;
  }
  createWorkspace(adapter: StorageAdapter, cache: LocalCache): Workspace
  ```
  `config.yaml` is never written after it's created. Its merge function returns the remote text.

- [ ] **Step 1: Write the failing tests:**
  - First run on an empty drive creates `tasks.md` = `# Always\n\n# Tasks\n`, `done.md` = `''` and `config.yaml` = `DEFAULT_CONFIG_YAML`.
  - Existing files are not overwritten.
  - `refresh` after an external edit to `config.yaml` returns `changed: true` with the new text.
  - `status` aggregates: one file offline means `offline`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add workspace over the three files`.

## Milestone 4 — `apps/web`

### Task 19: App store, messages and the fake-storage entry

**Files:**
- Create: `apps/web/src/lib/{store.svelte.ts,messages.ts,clock.ts,boot.ts}`
- Test: `apps/web/src/lib/{store.test.ts,messages.test.ts}`

**Interfaces:**
- Consumes: core ops, `planDrop`, `sweepCompleted`, `carryIds`, `parseConfig`, `computeStats`, and `Workspace`.
- Produces:
  ```ts
  interface Clock { now(): Date }
  interface AppStore {
    readonly state: State; readonly ctx: WeekCtx; readonly config: Config; readonly configError: ConfigError | null;
    readonly selectedId: string | null; readonly folded: Record<BucketKey, boolean>; readonly view: 'list' | 'board';
    readonly toast: { message: string; undo: boolean } | null; readonly status: SyncStatus; readonly stats: Stats;
    add(title: string, bucket?: Exclude<BucketKey, 'later'>): void;
    select(id: string | null): void; selectNext(delta: 1 | -1): void;
    moveTo(id: string, bucket: Exclude<BucketKey, 'later'>): void;
    setDate(id: string, date: ISODate | null, beforeId?: string | null): void;
    drop(id: string, target: DropTarget): DropOutcome;      // applies move/reorder; returns pickDate for the UI to open
    complete(id: string): void; remove(id: string): void;
    edit(id: string, patch: { title: string; notes: string[] }): void;
    setRepeat(id: string, rule: RepeatRule | null): void; setAlways(lines: string[]): void;
    undo(): void; toggleFold(key: BucketKey): void; switchView(): void;
    refresh(): Promise<void>; flush(): Promise<void>; tick(): void;
  }
  createStore(deps: { workspace: Workspace; clock: Clock; isPhone: () => boolean }): Promise<AppStore>
  boot(): Promise<AppStore>   // VITE_STORAGE=fake → FakeOneDrive(window.__TASKAPP_SEED__) + exposes window.__taskappFake; else OneDriveAdapter+IdbCache
  ```
  - `messages.ts` has one function per toast:
    - `added(bucketName)` → `Added to Today`
    - `moved(bucketName, label)` → `Moved to Next week · Sun`
    - `doneRepeat(next, ctx)` → `Done · next Mon 19 Oct`
    - `done(title)` → `Done · {title}`
    - `deleted(title)` → `Deleted · {title}`
    - `reordered(sameDate)` → `Reordered`, or `Tasks sort by date first, so it stays among its own date`
    - `saved()` → `Saved`
    - `repeats(rule)` → `Repeats every Mon, Thu`
    - `repeatRemoved()` → `Repeat removed`
    - `undone()` → `Undone`
    - `nothingToUndo()` → `Nothing to undo`
  - In the store:
    - The view starts at `config.defaultView`, but is `list` on a phone.
    - The fold state starts at `config.foldedOnOpen`.
    - Undo is a stack of previous `State`s.
    - Saves are debounced by `saveDelaySeconds`.
    - When a task leaves the visible list, the selection moves to the next visible task (prototype `selectAfterLeaving`).

- [ ] **Step 1: Write the failing tests** (Vitest with fake timers; workspace = `createWorkspace(new FakeOneDrive(seed), new MemoryCache())`; clock fixed at `2026-10-16T09:00`):
  - `add('Buy milk')` puts the task in Today, shows the toast `Added to Today`, and writes it to the fake drive after 1000 ms (not before).
  - `complete` on a weekly task shows the toast `Done · next Mon 26 Oct`. `done.md` gains a line.
  - `undo()` restores both files' content, and the toast reads `Undone`.
  - With `config.yaml` `newTaskBucket: someday`, `add('x')` puts the task in Someday.
  - `refresh()` after `externalWrite('tasks.md', …)` shows the new task, keeps the selected task's id when it is unchanged, and clears the undo stack (so `undo()` gives `Nothing to undo`).
  - A seed with a `- [x]` line in `tasks.md` is moved to `done.md` on open, and `stats.today` counts it if it's dated today.
  - `tick()` after moving the clock to `2026-10-17T00:00:05` moves a task due 10-17 from week to today.
  - An invalid config sets `configError` and uses `config = DEFAULT_CONFIG`.
  - `drop` onto `later` returns `pickDate` and changes nothing.
- [ ] **Step 2: Run** `pnpm --filter web test` → FAIL.
- [ ] **Step 3: Implement** with Svelte 5 `$state` and `$derived` in `.svelte.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add app store and toast messages`.

### Task 20: Task list view (read-only render)

**Files:**
- Create: `apps/web/src/components/{TaskListView.svelte,Bucket.svelte,TaskRow.svelte,AlwaysList.svelte,Stats.svelte,Toast.svelte,Hints.svelte,StatusLine.svelte}`, `apps/web/e2e/helpers.ts`, `apps/web/e2e/list.spec.ts`
- Modify: `apps/web/src/App.svelte` (`boot()`; remove the spike)

**Interfaces:**
- Produces in `e2e/helpers.ts`:
  - `openApp(page, opts?: { files?: Partial<Record<FileName, string>>; now?: string /* default '2026-10-16T09:00:00' */ })`, which uses `page.clock.setFixedTime` and `addInitScript` to seed `window.__TASKAPP_SEED__`.
  - `driveFile(page, name): Promise<string>`.
  - `externalWrite(page, name, text)`.
  - `SPEC_TASKS` (the spec §3.3 example).

- [ ] **Step 1: Write the failing e2e** `list.spec.ts` (desktop project), seeded with `SPEC_TASKS` plus `- [ ] Old thing 📅 2026-10-03` and `- [ ] Big trip 📅 2026-11-12`:
  - The bucket counts are Today 2, This week 0, Next week 2, Later 1, Someday 1.
  - Later and Someday are folded on open (their rows are hidden) but still show counts.
  - Clicking the Someday head unfolds it.
  - The Today rows are ordered `Old thing` then `Call the dentist…`.
  - The `Old thing` meta reads `3 Oct` and has class `over`.
  - The dentist row shows `≡`.
  - The `Water the plants` meta reads `↻ Mon`.
  - The `Big trip` meta reads `12 Nov`.
  - The `This week` bucket shows `Nothing else this week.`
  - There are two `always-line`s.
  - `stats` reads `Today 0 (–)`, `7d 0 (–)` and `All 0`.
  - `status` reads `saved`.
  - The pane legends are `tasks` and `always`.
  - Hovering the dentist row's empty meta shows a faint `today`. On an unfolded Someday row it shows `no date`.
  - `hints` is visible below the sheet.
  - Reloading the page resets the folds to their defaults.
- [ ] **Step 2: Run** `pnpm e2e list` → FAIL.
- [ ] **Step 3: Implement** the layout from the prototype's `renderA` and CSS (framed sheet, two panes, `statsbox` at the bottom of the right pane, footer with hints and status). Bundle the fonts via `@fontsource`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add task list view`.

### Task 21: Add input, selection and keyboard

**Files:**
- Create: `apps/web/src/lib/keys.ts`, `apps/web/src/lib/keys.test.ts`, `apps/web/src/components/AddInput.svelte`, `apps/web/e2e/keyboard.spec.ts`
- Modify: `TaskListView.svelte`, `App.svelte` (one global `keydown` handler)

**Interfaces:**
- Produces: `commandFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; typing: boolean }, shortcuts: Shortcuts): Command | null`. `typing` is true for input, textarea, select, contenteditable, and any open sheet.

- [ ] **Step 1: Write the failing unit tests** for `commandFor`:
  - `j` gives `down`. `ArrowUp` gives `up`.
  - `j` with `typing` gives `null`.
  - `Ctrl+z` gives `undo`. `Ctrl+z` with `typing` gives `null`.
  - `x` with `altKey` gives `null`.
  - With `shortcuts.complete = ['c']`, `c` gives `complete` and `x` gives `null`.
- [ ] **Step 2: Write the failing e2e** (desktop):
  - Pressing `/` focuses `add-input`.
  - Typing `Buy milk` then Enter adds it to Today, keeps the input focused and empty, and shows the toast `Added to Today`.
  - Typing `jx` in the input leaves the text `jx` and changes no selection.
  - Escape blurs the input.
  - `j` selects the first visible row, and `j` `k` move the selection.
  - With a task selected:
    - `e` moves it to Next week (toast `Moved to Next week · Sun`);
    - `s` moves it to Someday, which is folded, so the selection moves to a neighbour;
    - `t` moves it to Today;
    - `x` completes it (`done.md` on the drive gains a line once the save delay has passed);
    - `Delete` removes it with the toast `Deleted · …`;
    - `z` brings it back.
  - With a Sunday clock (`2026-10-18T09:00`), `w` lands the task in Today.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `pnpm test && pnpm e2e keyboard` → PASS.
- [ ] **Step 6: Commit** `Add quick add, selection and keyboard commands`.

### Task 22: Task detail pane, toasts and undo

**Files:**
- Create: `apps/web/src/components/TaskDetail.svelte`, `apps/web/e2e/detail.spec.ts`
- Modify: `TaskListView.svelte` (right pane: detail above ALWAYS when a task is selected)

- [ ] **Step 1: Write the failing e2e** (desktop):
  - Clicking a row selects it. The legend reads `task`, and the detail shows `Task · Today`, the title, the notes (one per line), Due `Today · Fri 16 Oct`, the chips Today / This week / Next week / Someday, Repeat `No repeat`, Complete, Delete and `esc`.
  - ALWAYS is shown below the detail.
  - Enter on a selected row focuses `detail-title`. Typing ` now` then Enter saves the title, the row updates, and the toast reads `Saved`.
  - Shift+Enter in the title moves to a new note line. Ctrl+Enter in the notes saves.
  - Esc in a field leaves it and saves. Esc again deselects, and the legend reads `always`.
  - Double-clicking a row focuses the title.
  - On an overdue task, `detail-due` has class `over`.
  - The Next week chip moves the task.
  - The toast Undo button reverts the last change.
  - After 1000 ms of no typing in the notes, the drive file contains the new note.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** following the prototype's `detailHTML`. On blur, the detail calls `store.edit`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add task detail pane`.

### Task 23: Sheets — date picker and repeat picker

**Files:**
- Create: `apps/web/src/components/{Sheet.svelte,DatePicker.svelte,RepeatPicker.svelte}`, `apps/web/e2e/pickers.spec.ts`

**Interfaces:**
- Produces:
  - `Sheet` (props `open`, `onclose`, a slot) is a bottom sheet on phones and a centred dialog on desktop, with focus trap and return, and closes on Esc or a backdrop click. A backdrop click within 400 ms of opening is ignored.
  - `DatePicker` (props `taskId`, `suggested?: ISODate`, `beforeId?`) shows the chips Today, `Tomorrow · Sat`, `This week · Sun` (hidden on Sundays), `Next week · Sun` and Someday, plus a date field and Set date.
  - `RepeatPicker` (prop `taskId`) offers the seven rule types plus No repeat, as in the prototype's `repeatSheet`.

- [ ] **Step 1: Write the failing e2e:**
  - `d` on a selected task opens the date picker.
  - `Tomorrow · Sat` sets `2026-10-17`, the row moves to This week, and the toast reads `Moved to This week · Sat`.
  - Clicking a row's `task-meta` opens the picker for that task.
  - The date field set to `2026-12-01` puts the task in Later with meta `1 Dec`.
  - `r` opens the repeat picker. Choosing Every week on Mo + Th and Save gives the meta `↻ Mon` and the toast `Repeats every Mon, Thu`. The drive's `tasks.md` contains `🔁 every week on Monday, Thursday`.
  - Choosing `3 days after I complete it` writes `🔁 every 3 days when done`.
  - Esc closes a sheet without changing anything.
  - Keys typed inside a sheet don't trigger commands.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add date and repeat pickers`.

### Task 24: ALWAYS editing

**Files:**
- Modify: `apps/web/src/components/AlwaysList.svelte`
- Test: `apps/web/e2e/always.spec.ts`

- [ ] **Step 1: Write the failing e2e:**
  - Clicking a line edits it inline. Enter or blur saves it, and `tasks.md` has the new text under `# Always`.
  - `+ Add a line` focuses a new empty line, and typing then Enter adds it.
  - Emptying a line and blurring removes it.
  - Keys typed in a line (`x`, `j`) are just text.
  - The ALWAYS lines appear in no bucket count or stat.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `contenteditable` lines calling `store.setAlways` on blur.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add inline ALWAYS editing`.

### Task 25: Week board and view switch

**Files:**
- Create: `apps/web/src/components/WeekBoardView.svelte`, `apps/web/e2e/board.spec.ts`

- [ ] **Step 1: Write the failing e2e** (desktop):
  - `v` switches to the board:
    - the rail shows `taskapp · Fri 16 Oct`, the stats, an Always box, the hints and the status;
    - there are four columns: Today | This week | Next week | Later + Someday;
    - the first three columns have no fold control;
    - Later and Someday start folded.
  - Selecting a task replaces the Always box with the detail. Esc brings Always back.
  - `j` walks the visible rows column by column.
  - With `config.yaml` `defaultView: board`, the app opens on the board.
  - At a 1000 px viewport, the columns wrap two per row.
  - In the `iphone` project, `v` does nothing and the list stays visible.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** following the prototype's `renderC` and CSS.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add week board view`.

### Task 26: Desktop mouse drag

**Files:**
- Create: `apps/web/src/lib/drag/mouse-drag.ts`, `apps/web/e2e/drag-desktop.spec.ts`
- Modify: `Bucket.svelte`, `TaskRow.svelte`

**Interfaces:**
- Consumes: `store.drop(id, target)`. On `pickDate`, open `DatePicker` with `suggested` and `beforeId`.
- Produces: the drag uses HTML5 DnD. During `dragover`, the bucket under the pointer gets class `drop-into` (unless it's the task's own bucket), and the row under the pointer gets class `drop-before`.

- [ ] **Step 1: Write the failing e2e** (desktop; the core drop rules are already unit-tested in Task 12, so this is a smoke test):
  - Dragging a Someday task (unfold Someday first) onto the folded `Next week` head moves it to Next week. The toast reads `Moved to Next week · Sun`.
  - Dragging a Today task onto `bucket-head-later` opens the date picker pre-filled with `2026-10-26`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add desktop drag and drop`.

### Task 27: Phone layout, sheets and swipe

**Files:**
- Create: `apps/web/src/lib/gestures.ts`, `apps/web/src/lib/gestures.test.ts`, `apps/web/src/components/{AddSheet.svelte,EditSheet.svelte,MoveSheet.svelte,Fab.svelte}`, `apps/web/e2e/phone.spec.ts`
- Modify: `TaskListView.svelte` (phone layout: stats line on top, ALWAYS at the bottom, no detail pane, no add input, no hints)

**Interfaces:**
- Produces:
  ```ts
  type GestureResult = 'tap' | 'swipeRight' | 'swipeLeft' | 'drop' | 'none';
  type GesturePhase = 'pending' | 'scroll' | 'swipe' | 'drag' | 'ended';
  class GestureTracker {
    constructor(opts?: { holdMs?: number; slop?: number; swipeStart?: number; swipeCommit?: number }); // 400, 8, 10, 90
    down(x: number, y: number, t: number): void;
    move(x: number, y: number, t: number): GesturePhase;
    tick(t: number): GesturePhase;              // turns pending into drag once holdMs passes with no movement beyond slop
    up(t: number): GestureResult;
    readonly dx: number;
  }
  ```

- [ ] **Step 1: Write the failing unit tests** for `GestureTracker`:
  - down, up at 120 ms → `tap`.
  - down, move dx 120 at 60 ms, up → `swipeRight`. dx −120 → `swipeLeft`.
  - dx 50, up → `none`.
  - Move dy 30 at 60 ms → phase `scroll`, then up → `none`.
  - `tick(420)` with no movement → phase `drag`. Moving 200 px after that stays in `drag`, and up → `drop`.
  - Move 9 px at 200 ms, then `tick(500)` → never `drag`.
  - A swipe never turns into `drag`.
- [ ] **Step 2: Write the failing e2e** (`iphone` project):
  - The stats line is at the top and ALWAYS at the bottom. There's no `add-input` and no `detail`.
  - `fab` opens the add sheet with chips Today (on), This week, Next week and Someday. Typing a title, choosing Someday and tapping Add puts the task in Someday.
  - Tapping a row opens the edit sheet. Editing the notes and tapping Save shows `≡`.
  - Tapping `task-meta` opens the date picker directly.
  - Swiping a row right (dispatch touch events, 120 px) completes it.
  - Swiping left opens the move sheet with Today, This week, Next week, `Pick a date…`, Someday, `Repeat…` and Delete.
  - The task rows' computed `-webkit-touch-callout` is `none`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** the tracker, then wire it to the rows with pointer events (swipe and tap).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `Add phone layout, sheets and swipe gestures`.

### Task 28: Long-press drag on touch

**Files:**
- Create: `apps/web/src/lib/drag/touch-drag.ts`, `apps/web/e2e/drag-phone.spec.ts`

**Interfaces:**
- Consumes: `GestureTracker` (a `drag` phase lifts the row), `store.drop`.
- Produces:
  - A floating clone `.drag-ghost` follows the finger.
  - The original row gets `.lifted`.
  - A non-passive `touchmove` listener calls `preventDefault` only while the phase is `drag`.
  - A `requestAnimationFrame` autoscroll runs while the finger is in the edge zones.
  - The drop target is found with `elementFromPoint` and marked with the same `drop-into` / `drop-before` classes.
  - The click that follows a release is swallowed.

- [ ] **Step 1: Write the failing e2e smoke test** (`iphone`; spec §15 accepts weak emulation, so this is the only one): hold a Today row for 500 ms using `touchstart` via CDP/dispatchEvent with the clock running, move it onto `bucket-head-next`, and release. The task is now in Next week.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, starting from the prototype's `lp*` functions.
- [ ] **Step 4: Run** → PASS. Then do the manual check on a real iPhone: hold vs scroll vs swipe each behave as intended, the page doesn't scroll during a drag, and autoscroll works.
- [ ] **Step 5: Commit** `Add long-press drag on touch`.

### Task 29: Sign-in, status, config banner, theme and refresh on focus

**Files:**
- Create: `apps/web/src/components/{SignIn.svelte,ConfigBanner.svelte}`, `apps/web/src/lib/lifecycle.ts`, `apps/web/e2e/lifecycle.spec.ts`
- Modify: `App.svelte`, `StatusLine.svelte`, `boot.ts`

**Interfaces:**
- Produces: `installLifecycle(store: AppStore, auth?: Auth): () => void`. It wires:
  - `visibilitychange` → visible calls `store.refresh()`; hidden calls `store.flush()`;
  - `focus` → `store.refresh()`;
  - `pagehide` → `store.flush()`;
  - `online` → `store.refresh()`;
  - a timer set for the next local midnight → `store.tick()`.

  Theme: `config.theme` sets `document.documentElement.dataset.theme`, except for `system`.

- [ ] **Step 1: Write the failing e2e:**
  - `externalWrite('tasks.md', …+ '- [ ] From Obsidian')`, then dispatch `visibilitychange` (visible) and focus: the row appears.
  - `externalWrite('config.yaml', 'theme: [')` then focus: `config-banner` mentions `line 1`, and the app still works.
  - `externalWrite('config.yaml', 'theme: dark')` then focus: `html[data-theme=dark]`, with a body background of `rgb(13, 16, 21)`.
  - `__taskappFake.setOffline(true)`, then add a task: `status` reads `offline`. Going back online and focusing: `status` reads `saved` and the drive has the task.
  - Under `boot` in onedrive mode with no account (stubbed via `window.__TASKAPP_AUTH_STUB__ = 'signed-out'`), the sign-in screen shows a `Sign in with Microsoft` button.
  - An `AuthRequiredError` makes `status` read `sign in needed`, and clicking it starts sign-in.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add sign-in screen, sync status, config banner and focus refresh`.

### Task 30: Offline PWA

**Files:**
- Modify: `apps/web/vite.config.ts` (Workbox precache of the app shell and fonts; no runtime caching of Graph)
- Test: `apps/web/e2e/offline.spec.ts` (desktop project; Chromium supports SW in Playwright)

- [ ] **Step 1: Write the failing e2e:**
  - Load the app, add a task, and wait for `navigator.serviceWorker.ready`.
  - `context.setOffline(true)` plus `__taskappFake.setOffline(true)`, then reload: the app renders from the precached shell, the cached task is visible, and `status` reads `offline`.
  - Fonts load from the same origin; no request goes to `fonts.googleapis.com` (checked with `page.on('request')`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Then do the manual iPhone check: in airplane mode, open the home-screen app, add a task, go back online, and see it in Obsidian.
- [ ] **Step 5: Commit** `Make the app work offline`.

## Milestone 5 — Tools, skill and release

### Task 31: Todoist import script

**Files:**
- Create: `tools/todoist-import/{package.json,tsconfig.json}`, `tools/todoist-import/src/{convert.ts,fetch.ts,main.ts}`, `tools/todoist-import/test/{convert.test.ts,fixtures/tasks.json}`

**Interfaces:**
- Consumes: `formatRepeat`, `serializeTasks` from core.
- Produces:
  ```ts
  interface TodoistTask { id: string; content: string; description: string; parent_id: string | null; due: { date: string; string: string; is_recurring: boolean } | null }
  convertDue(due: TodoistTask['due']): { date: ISODate | null; repeat: RepeatRule | null; warning: string | null }
  buildTasksMd(tasks: TodoistTask[]): { text: string; warnings: string[] }
  ```
  `main.ts` reads `TODOIST_TOKEN` from the environment (never written to disk) and fetches all open tasks from Todoist API v1 (`GET https://api.todoist.com/api/v1/tasks`, following `next_cursor`). It writes to the path given as `--out`, and refuses to overwrite an existing file unless `--force` is passed. It prints the warnings.

- [ ] **Step 1: Write the failing tests:**

  | Todoist `due.string` | Rule |
  |---|---|
  | `every day` | daily |
  | `every weekday` / `every workday` | weekdays |
  | `every mon, thu` | weekly `[0,3]` |
  | `every 15` / `every 15th` | monthly 15 |
  | `every year` | yearly |
  | `every 3 days` | every 3 days |
  | `every 2 weeks` | every 2 weeks |
  | `every! 3 days` | after 3 |
  | `every 2nd tue` | `repeat: null`, with a warning naming the task and the string, and the date kept |

  Also test:
  - A task with no due date gets `date: null`.
  - Description lines become notes.
  - A subtask becomes a note `- {content}` under its parent, after the description lines.
  - The fixture produces `# Always\n\n# Tasks\n` plus the expected lines, and the output parses back with `parseTasks` to the same titles.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add one-time Todoist import script`.

### Task 32: Claude Code skill for the file formats

**Files:**
- Create: `.claude/skills/taskapp-files/SKILL.md`, `packages/core/test/skill-examples.test.ts`

**Interfaces:**
- Produces: a skill with frontmatter `name: taskapp-files` and the description "Use when reading or editing TaskApp's tasks.md, done.md or config.yaml". The body covers:
  - the file location `C:\Users\alipk\OneDrive\ALAI\TaskApp\`;
  - the line format;
  - the repeat wording table (Task 6);
  - how to complete a task (move the line to `done.md` with `✅ today`; for a repeating task, append a done line and set `📅` to the next date);
  - the next-date rule with worked examples;
  - how to move a task to a bucket (Today, This week, Next week, Someday dates);
  - a rule never to add IDs or reformat lines it isn't changing.

- [ ] **Step 1: Write the failing test.** It reads `SKILL.md`. Every fenced block tagged `markdown` must round-trip through `parseTasks`/`serializeTasks` (or `parseDone`/`serializeDone` when it starts with `- [x]`). Every row of the `| rule | due | completed on | next |` table must match `nextDate(parseRepeat(rule), due, completedOn)`.
- [ ] **Step 2: Run** → FAIL (no file).
- [ ] **Step 3: Write `SKILL.md`** with at least the five next-date examples from Task 7 in the table. Use `mattpocock-skills:writing-for-agents` for its style. Add a README section on copying it to `~/.claude/skills/taskapp-files/`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add Claude Code skill for TaskApp files`.

### Task 33: Real-OneDrive smoke and v1 acceptance

**Files:**
- Create: `apps/web/e2e-real/onedrive.spec.ts`, `apps/web/playwright.real.config.ts`, `README.md`
- Modify: `doc/TaskApp backlog.md` (if anything was cut during the build)

- [ ] **Step 1: Write the smoke spec.** It runs only with `pnpm e2e:real` and uses a saved `storageState` from a manual sign-in to the dedicated test account. It checks:
  - the app opens and shows `saved`;
  - adding a task named with a unique timestamp makes it appear in `tasks.md` read back through Graph;
  - completing it moves it to `done.md`;
  - deleting it cleans up.
- [ ] **Step 2: Run** `pnpm e2e:real` after a manual sign-in → PASS. Record the date in the README.
- [ ] **Step 3: Write the README:** setup, the environment variables, the user steps (Entra, Cloudflare), the commands, installing the skill, and running the import.
- [ ] **Step 4: Acceptance on devices** (the user and the agent, from the spec):
  - Brave PWA pinned to the taskbar: every key in §9.1 works.
  - iPhone home screen: everything in §9.2 works.
  - An edit in Obsidian shows up on focus.
  - Claude Code completes a task using the skill, and the app shows it.
  - The Todoist import is run for real and its warnings are reviewed.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm test && pnpm e2e` → all green.
- [ ] **Step 6: Commit** `Add real-OneDrive smoke test and README`.
