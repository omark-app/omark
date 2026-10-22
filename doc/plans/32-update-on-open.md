# 32: Load the newest build on open, on return and on long-open pages

Issue #32. Branch `issue-32-update-on-open`. The design was agreed with AL in the session on 2026-10-22.

## What changes for AL

- **Opening or returning to the app while online**: if a newer build is deployed, the app saves your edits and reloads into it within about a second, before you can tick anything. A brief "Updating…" shows.
- **A page that stays open** (desktop tab, iPad on a stand) checks every 30 minutes while visible, and when the window regains focus or the device comes back online. It reloads only when nothing is in progress:
  - no quick add, editor or dialog open;
  - no drag;
  - no focused text field;
  - no unsaved edits;
  - no input for about a minute.
- **The footer** shows "New version · tap to update" while an update waits. Tapping it updates now.
- **Offline**: nothing changes. The saved build runs.
- `sw.js` is served "don't cache".

## Why (root cause)

- Navigations are served from the service worker's precache, so the first open after a deploy always runs the old JS.
- The new worker installs and takes control in the background, and `updates.ts` reloads only on the *next* return.
- On iOS, a resumed home-screen app can keep an old build for days.
- A page that never gets hidden never reloads.

## Design

- **`version.json`.** A small Vite plugin emits `version.json` (`{"build":"<BUILD_ID>"}`) into `dist/`. It is not precached: `globPatterns` has no `json`, and there is no runtime caching, so it always comes from the network.
- **The check.** `fetch('/version.json', { cache: 'no-store' })`.
  - A different `build` from the running `BUILD_ID` means "newer".
  - A failed fetch (offline), a non-OK answer or a `dev` build means "no information".
- **When it runs:**
  - on boot, once the store is open;
  - on `visibilitychange` to visible;
  - on window `focus`, `online`, and `pageshow` with `persisted`;
  - every 30 minutes while visible.
- **When an update is applied:**
  - *On open or return* (boot, or visible after hidden), at once.
  - *Otherwise*, when idle: no input event for 60 s and the UI says nothing is in progress. The UI passes an `isBusy()` callback (quick add, detail, dialogs, drag, a focused field).
  - *On a tap* of the footer line, at once. If edits would be lost, the existing "lose edits" confirm is used.
- **Applying.**
  1. `store.flush()`; if `store.wouldLoseEdits()`, try again later.
  2. `registration.update()`, then wait up to 10 s for a new worker to take control.
  3. Reload.
  4. If no new worker took control in time, unregister the service worker and reload. This is safe because the check has just proved the network works, and the page re-registers on load.
- **Loop guard.**
  - `sessionStorage` remembers the build an update was attempted for.
  - If the page comes back still on the old build for that same target, the next attempt goes straight to unregister and reload.
  - If it is still old after that, it stops reloading and only shows the footer line.
- **Headers.** `apps/web/public/_headers`: `/sw.js` gets `Cache-Control: no-cache`, and `/version.json` gets `Cache-Control: no-store`.
- `installUpdates` keeps its signature style (injectable workers, reload, plus fetch, timers and storage) so it stays unit-testable. The current controllerchange-then-next-return logic is replaced by the above.

## Acceptance criteria

- [ ] On open (boot), when `version.json` names another build, the page flushes and reloads before the store accepts a completion.
- [ ] On return (hidden → visible), same.
- [ ] While visible, a check runs every 30 minutes and on focus, `online` and `pageshow` (persisted).
- [ ] A newer build found mid-use reloads only after 60 s without input and while `isBusy()` is false; the footer line shows meanwhile.
- [ ] Tapping "New version · tap to update" updates at once (with the lose-edits confirm when needed).
- [ ] Offline, a failed fetch, a non-OK answer or a `dev` build never reloads.
- [ ] Edits that can't be cached block the reload, which is tried again later. Nothing is lost.
- [ ] No reload loop: at most one normal and one unregister attempt per target build per session.
- [ ] `dist/version.json` exists with the build ID; it isn't in the precache manifest; `_headers` sets the two headers.
- [ ] An e2e test (both projects) routes `/version.json` to another build ID and sees the page reload on open. A long-open page shows the footer line and reloads once idle.

## Tests I'll write first

1. `updates.test.ts`:
   - a newer build on boot → flush, then reload;
   - on return → reload;
   - the same build → no reload;
   - a fetch failure, non-OK or `dev` → no reload;
   - an interval or focus hit while busy → no reload, the footer flag is set, then it reloads after idle;
   - edits that would be lost → no reload, and a retry;
   - the worker never takes over → unregister and reload;
   - the loop guard.

   These fail: none of these triggers exist today, and the current code reloads only on the return after a `controllerchange`.
2. `vite` build test, or a check in e2e: `dist/version.json` holds the build ID and isn't in the `sw.js` precache list.
3. `e2e/updates.spec.ts`: route `/version.json` → `{"build":"newer"}` and expect a reload (a `load` event count, or a marker on `window` that is gone), then the footer line case. Service workers stay blocked in e2e, so this covers the no-worker path, while unit tests cover the worker paths.

Existing `updates.test.ts` cases change, because the behaviour they cover (reload on the next return only) is meant to change. The PR says which.

## Risks

- **A reload during use.** Mitigated by the idle and busy rules plus `flush` and `wouldLoseEdits`.
- **A reload loop** if a deploy is half-done (e.g. `version.json` updated before the assets). Mitigated by the loop guard.
- **Pages already on old builds** don't have this code. AL force-quits them once. A server-side gate is out of scope.

## Out of scope

- Blocking old builds at the server.
- Code splitting.
- Changing the precache strategy for navigations.
