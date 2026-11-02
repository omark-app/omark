# Omark Time app shell (#57, T.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/time`, the Omark Time PWA shell: Google sign-in (read-only), first run, storage choice, the sync and colouring loops, rebuild and the offline cache, deployed to `staging-time.omark.app`.

**Architecture:** A Svelte 5 PWA built like `apps/tasks` (Vite, `vite-plugin-pwa`, Playwright `desktop` + `iphone`). The sync is a plain TypeScript module, `src/lib/sync.ts`, that composes `@omark/time-core` (rows, `applyChanges`, `recheckKnown`, `newlyInWindow`, `colourPlan`, the CSV and YAML models) with a `CalendarSource` (`@omark/calendar`: Google, or the fake in e2e) and a `StorageAdapter` (`@omark/storage`: Google Drive, OneDrive, later the local folder, or a fake drive in e2e). The sync state (tokens per calendar, last `today`, the colouring queue) and a copy of the files live in IndexedDB per device (spec 7.4). The UI in this issue is only what the shell needs: first run, a status line with "Sync now", and a minimal settings panel (calendars, colouring, storage, rebuild, sign out). The real screens (hours, charts, fix list, projects, report) are #58.

**Tech Stack:** Svelte 5, TypeScript 5.9, Vite 8, `vite-plugin-pwa`, Vitest 3, Playwright. No new third-party dependency beyond what `apps/tasks` uses.

**Spec:** [`doc/time/spec.md`](../time/spec.md) sections 4, 7, 8 and 10; 3 (decisions), 13 (architecture), 15 (acceptance). Milestone: [53-omark-time-milestone.md](53-omark-time-milestone.md). Calendar: [55-calendar.md](55-calendar.md).

## What changes for AL

- `staging-time.omark.app` opens Omark Time. "Sign in with Google" asks only to see calendars and their events.
- First run: choose where the files go (Google Drive now; OneDrive and a local folder in later steps), then which calendars to read. The app then reads the calendar and writes `projects.csv`, `config.yaml` and `events-YYYY.csv` into an `Omark Time` folder.
- Each open, and "Sync now", reads only what changed. An edit to a past event changes its row.
- Settings: "Colour my events" (off by default) asks Google for edit access, then colours newest first, and carries on after a reload. "Rebuild" reads everything again. "Sign out".
- Every PR gets a preview link (a fake-calendar build, like the Tasks previews).

## Pieces outside this lane

The shell needs four changes outside `apps/time`. The coordinator decides who makes them; this plan orders the work so the shell is built and tested on fakes while they land.

1. **`packages/signin` + `functions/api/auth`: a `time` app.** `APPS.time` with the Google provider for `calendar.calendarlist.readonly calendar.events.owned.readonly`, its own cookie prefix (`omarktime`). One entry in the shared Pages Function.
2. **`packages/signin`: adding Google scopes later** (spec 10.2). `/api/auth/login?provider=google&add=drive` or `&add=edit` asks for the base scopes plus `drive.file` or `calendar.events.owned`, with `include_granted_scopes=true`; the callback checks the added scope was granted and replaces the session; the token call stops sending a narrower `scope` for Google, so the access token carries every granted scope. Tasks is unaffected (it has no optional scopes).
3. **`packages/storage`'s `createAuth`: ask for an added scope.** `signIn(provider, { add })` navigates to the URL above. Small.
4. **A second sign-in at the same time, for OneDrive storage** (spec 4.2: "a Microsoft sign-in too"). Today one app has one session. Time needs a Google session (the calendar) and, with OneDrive storage, a Microsoft one. Proposal: the helper keeps one session per provider (cookie names gain the provider id for every provider but the first, so Tasks' cookies stay as they are), and `createAuth` takes the provider to get a token for. Only Task 8 needs this.

Until 1–3 land, the shell runs on the fake calendar and fake drive, and the staging deploy shows the sign-in failing cleanly.

## Staging setup (T.9's staging part)

Already there: the "Omark Time Staging" Google project has the Calendar and Drive APIs on, and its Web client has `https://staging-time.omark.app/api/auth/callback` as a redirect URI.

Done by Claude (2026-10-27): the Pages project `omark-time-staging` with the custom domain `staging-time.omark.app` (waiting for DNS), and the repository variables `CF_TIME_STAGING_PROJECT`, `TIME_STAGING_HOST`, `TIME_STAGING_URL`, `TIME_STAGING_DOMAIN` and `CF_TIME_ZONE_ID` (the omark.app zone). CI reads only the first three: its Cloudflare token can't change omark.app's DNS, so the jobs pass just the project, as `tasks-demo` does.

AL does (Claude's session may not change DNS or Pages secrets):
- the DNS record: `CNAME staging-time` → `omark-time-staging.pages.dev`, proxied, in the omark.app zone;
- the Pages secrets of `omark-time-staging`: `OMARK_APP=time`, `COOKIE_KEY` (32 random bytes, base64), and `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `~\.secrets\omark-time-staging-google-client.json`.

Only for Task 8 (OneDrive):
- the Entra registration "Omark Time Staging": personal Microsoft accounts, Web redirect URI `https://staging-time.omark.app/api/auth/callback`, `Files.ReadWrite.AppFolder`, and a client secret saved to `~\.secrets\omark-time-staging-entra.txt`. Claude puts it into the Pages secrets.

## Acceptance criteria

- [ ] e2e on the fake calendar (desktop and iPhone): first run (storage, calendars) writes `projects.csv`, `config.yaml` and the year files; an event changed in the fake calendar shows in the files after "Sync now"; rebuild gives the same files.
- [ ] With colouring off, the fake calendar records no `setColour` call, after first run, sync, rebuild and a project change (e2e).
- [ ] Turning colouring on asks for edit access (the stub records the request), colours newest first, and after a reload mid-way colours only what is left (e2e).
- [ ] A device without edit access shows "Colouring needs edit access" with a button, and colours nothing (e2e).
- [ ] Offline: a reload with no network opens from the cache with the last files and "Offline" in the status line (e2e).
- [ ] Two devices: a write that loses the eTag race reloads the file, applies its changes again and retries (unit).
- [ ] A 410 from Google (sync token expired) does a full read of that calendar without losing rows (unit).
- [ ] `tasks-preview`-like `time-preview` job deploys the fake build to `pr-<n>` of the staging project and comments the link; `time-staging` deploys `main` to `staging-time.omark.app` and checks the sign-in helper redirects to Google; both have "Skip if main has moved on" as the `tasks-*` jobs do after #84.
- [ ] Manual on staging with `hello@omark.app`: files appear in Google Drive; an edit to a past event in "Omark Test" changes the CSV on the next open; colouring on colours, off offers to clear.
- [ ] OneDrive (Task 8) and the local folder (Task 9) work the same way, or are moved to a follow-up issue with the reason.

## Global constraints

- Tests and scripts never touch AL's calendar. Staging uses `hello@omark.app`; the manual check reads only "Omark Test".
- Nothing before `track_from` and nothing after 90 days ahead is read, coloured or written (spec 16.3).
- The app owns the year files and rewrites them whole; it merges `projects.csv` and `config.yaml` (unknown columns and keys kept).
- The sync loop never colours with colouring off, and never asks for edit access by itself; only the setting does.
- No sync state in the shared folder (spec 7.4).
- Files are written only when their content changed (time-core's `applyChanges` returns only changed years).

## Review focus

1. **No write to the calendar with colouring off.** The colour step is behind one check of `colour_events`; the e2e asserts the fake's `patches` stays empty across every flow.
2. **Resumable colouring.** The queue (event keys and wanted patches, newest first) is saved to IndexedDB before the first patch and trimmed after each one; a reload continues it, and a sync replans it so a stale entry is never applied.
3. **Our own patch is a change.** After a patch, the next incremental read returns the event (for an instance of a series, Google returned the whole series in the #56 manual check); `colourAction` must return null for it.
4. **Lost write races.** For year files a lost race is repaired by the next sync (spec 16.14); `projects.csv` and `config.yaml` go through the eTag retry.
5. **Window edges.** `newlyInWindow` days are read with `readRange`, since a sync token never returns events that only moved into the window by the date changing.

---

## File structure

```
apps/time/
  package.json            name `time`; deps @omark/time-core, @omark/calendar, @omark/storage, @omark/settings, svelte
  index.html, vite.config.ts, svelte.config.js, tsconfig.json, vitest.config.ts
  playwright.config.ts    desktop + iphone; webServer: the fake build
  public/                 _headers, icons (the Time icons from #64)
  src/main.ts, App.svelte
  src/env.ts              VITE_STORAGE (`fake` | `google`), hosts, folder names
  src/lib/boot.ts         picks auth, calendar source and storage; opens the store
  src/lib/sync.ts         the sync loop (pure but for the injected ports)
  src/lib/colouring.ts    the colouring queue
  src/lib/state.ts        per-device sync state in IndexedDB
  src/lib/files.ts        read / write the three files with eTag retry
  src/lib/store.svelte.ts runes state for the UI
  src/components/FirstRun.svelte, StatusLine.svelte, Settings.svelte
  e2e/*.spec.ts
```

---

## Tasks

### Task 1: The app skeleton, fake build and preview job

**Files:** Create `apps/time/*` as above (empty screens); Modify `CLAUDE.md` (Layout: one line), `.github/workflows/ci.yml` (`time-preview`, after #84 merges).

- [ ] **Step 1: Failing e2e** `e2e/boot.spec.ts`: the fake build opens with the title "Omark Time" and a "Get started" button, on desktop and iPhone.
- [ ] **Step 2–4:** Run (FAIL), build the skeleton, run (PASS).
- [ ] **Step 5:** `time-preview` job modelled on `tasks-preview` as it is after #84 (the fake build, `CF_TIME_STAGING_PROJECT`, comment marker `<!-- time-preview -->`, "Skip if main has moved on" where `tasks-*` has it). `tools/ci/test/workflows.test.ts` gets the new job's checks if it lists jobs.
- [ ] **Step 6: Commit** `Add the Omark Time app skeleton and its preview`.

### Task 2: Files and per-device state

**Files:** Create `src/lib/files.ts`, `src/lib/state.ts`; Test `src/lib/files.test.ts`, `src/lib/state.test.ts`.

- [ ] **Failing tests:** reading a folder with no files gives the defaults (spec 7.2) and the commented `config.yaml`; `projects.csv` and `config.yaml` written with `ifMatch`, and on `PreconditionFailedError` reloaded, the change applied again, written again; year files written only when changed; the state (tokens per calendar, `lastToday`, colouring queue) round-trips through `fake-indexeddb`, one record per storage place.
- [ ] Implement with `FakeGoogleDrive` from `@omark/storage`. Commit `Read and write the Omark Time files`.

### Task 3: The sync loop

**Files:** Create `src/lib/sync.ts`; Test `src/lib/sync.test.ts` (FakeCalendar + FakeGoogleDrive + a fixed clock).

- [ ] **Failing tests:** first sync does a full read per chosen calendar, writes the year files, stores each token; a second sync with no change writes nothing; an edited past event changes its row; a cancelled one drops its rows; a 410 does a full read of that calendar only and keeps the rows of the others; days that entered the window since `lastToday` are read with `readRange`; a project added or archived re-checks `known` and re-reads the window (`recheckKnown`'s note); rebuild clears the files and tokens and gives the same files as a first sync; events before `track_from` and after 90 days give no rows.
- [ ] Implement. Commit `Sync the calendar into the year files`.

### Task 4: The colouring loop

**Files:** Create `src/lib/colouring.ts`; Test `src/lib/colouring.test.ts`.

- [ ] **Failing tests:** with `colour_events: false`, no `setColour` call in any flow; with it on, the plan is newest first and saved before the first patch; after N patches a new instance (a reload) continues with the rest; a sync between replans and drops entries whose wanted colour is now null; `EditAccessRequiredError` stops the loop and reports "needs edit access"; turning it off offers the clear plan (`clearAction`) and runs it only on confirm.
- [ ] Implement. Commit `Colour events when colouring is on`.

### Task 5: First run, status line, settings, offline

**Files:** Create the components, `src/lib/store.svelte.ts`, `src/lib/boot.ts`; e2e `e2e/first-run.spec.ts`, `e2e/sync.spec.ts`, `e2e/colouring.spec.ts`, `e2e/offline.spec.ts`.

- [ ] **Failing e2e** for each acceptance criterion above that is e2e, on the fake build (an auth stub as in `apps/tasks/src/lib/auth-stub.ts`; `window.__omarkTimeFake` exposes the fake calendar and drive).
- [ ] Implement. Commit per screen.

### Task 6: Google sign-in and Google Drive (needs pieces 1–3)

**Files:** Modify `src/lib/boot.ts`, `src/env.ts`.

- [ ] **Failing tests:** boot with a signed-in Google session builds `GoogleCalendarSource` with `auth.getToken` and, for Google Drive, `GoogleDriveAdapter({ folder: 'Omark Time' })`; picking Google Drive with a session lacking `drive.file` calls `signIn('google', { add: 'drive' })`; turning colouring on calls `signIn('google', { add: 'edit' })`; a `signin_error=scope` return shows the right text.
- [ ] Implement. Commit `Sign in with Google and keep the files in Google Drive`.

### Task 7: Staging deploy

**Files:** Modify `.github/workflows/ci.yml` (`time-staging`).

- [ ] `time-staging` modelled on `tasks-staging` after #84: build with the staging host, `ensure-pages-project.mjs` for `CF_TIME_STAGING_PROJECT` and `staging-time.omark.app`, deploy `main`, "Skip if main has moved on", then `check-signin.mjs` (extended, if needed, to accept a Google redirect for `OMARK_APP=time`).
- [ ] Manual check on staging (acceptance above), results in the PR.
- [ ] Commit, push, open the PR (`Closes #57` only if Tasks 8 and 9 are in it; otherwise `Part of #57`), fresh-eyes review.

### Task 8: OneDrive (needs piece 4 and the "Omark Time Staging" Entra registration)

- [ ] **Failing tests:** picking OneDrive starts a Microsoft sign-in beside the Google one; the files go to `Apps/Omark Time`; signing out of one keeps the other.
- [ ] Implement with `OneDriveAdapter`. If piece 4 is not on `main` when Tasks 1–7 are done, this moves to a follow-up issue and the PR says so.

### Task 9: Local folder (needs 3.1 on `main`)

- [ ] **Failing tests:** on desktop Chrome, picking "A folder on this computer" uses 3.1's adapter and folder picking; after a reload the permission is asked again; iPhone does not offer it.
- [ ] Implement. Same rule as Task 8 if 3.1 is not on `main` in time.

## Risks

- **Pieces 1–4 are outside this lane.** The fakes keep the work moving; Task 6 waits only for 1–3, and Tasks 8–9 can move to follow-ups.
- **A renamed never-ending series** may return many instances in one read (spec 15.1, open). Paging handles the size; the sync test covers 5 000 events from one read.
- **Google Drive's conditional write** may be weaker than OneDrive's (launch spec 6.4.1). Year files accept a lost race; the two small files retry.
- **A big first colouring pass** (thousands of events at 300 a minute) takes minutes; the status line shows progress and the queue survives reloads.

## Out of scope

- The hours, charts, fix list, projects and report screens (#58).
- Demo mode and `demo-time.omark.app` (#59).
- Production: the "Omark Time" Google project, `time.omark.app` and Promote for Time (T.9).
- Background sync while the app is closed (spec 14).
