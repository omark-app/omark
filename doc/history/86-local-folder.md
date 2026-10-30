# Local-folder mode (#86) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Omark Tasks can keep `tasks.md`, `done.md` and `config.yaml` in a folder on this computer, picked with the File System Access API, through a `LocalFolderAdapter` in `packages/storage`.

**Architecture:** The adapter wraps a directory handle. Its eTag is a SHA-256 of the file's text, so any outside change (Obsidian, an agent, a sync client) fails the next conditional write with `PreconditionFailedError`, and `FileSync` merges it as it does a OneDrive 412. The handle, with a random id per picked folder, is kept in IndexedDB; the app's cache and synced-at key are keyed by that id. Lost permission is `AuthRequiredError`, so the existing "sign in needed" path (status `signin`, banner with a button) becomes "Allow access" for a folder. A folder that has gone away (renamed, unplugged) is `OfflineError`.

**Tech stack:** TypeScript, Svelte 5, Vitest, Playwright. No new dependency.

**Spec:** `doc/TaskApp open source launch spec.md` 6.4.

## What changes for AL

- Nothing on `tasks.alipka.com` until he uses it: the sign-in screen gets a third option, **Use a folder on this computer**, in Chrome and Edge on a computer only. iPhone Safari and Firefox show one faint line instead: "A folder on this computer works in Chrome or Edge on a computer."
- Picking a folder opens the app on it. Missing files are created there, as on OneDrive. Edits made in Obsidian while the app is open show up when the app regains focus, merged with edits made in the app.
- On a later visit Chrome may ask again. The app opens from its offline copy at once, with the banner "Allow access again to reach the folder Tasks — showing your last saved copy" and an **Allow access** button.
- When the folder holds a sync conflict copy such as `tasks (1).md`, a note names it and says it is not merged.
- There is no way yet to switch from a folder back to OneDrive in the app (clearing the site's data does it). The setting comes with 3.2.

## Decisions

- **eTag = SHA-256 of the text**, not `lastModified` + size. The adapter reads the whole file anyway; a hash catches a same-size edit within the clock's resolution and a sync client that keeps the old modified time. Files are small.
- **Conditional write is check-then-write.** The API has no compare-and-swap. `write` reads the current text, compares hashes, then writes through `createWritable` (which replaces the file atomically on `close`). An outside save landing in the few milliseconds between check and write is lost to the merge (it stays in the sync client's history). Written down as a risk, not solved.
- **Permission:** the adapter asks `queryPermission({ mode: 'readwrite' })` before each operation and throws `AuthRequiredError` unless it is `granted`; `NotAllowedError` and `SecurityError` map the same way. `requestPermission` needs a click, so it runs from the banner's button, then the store refreshes (a pull merges and writes pending edits).
- **Folder gone:** `NotFoundError` for a file means "missing" only if the folder itself can still be listed; otherwise `OfflineError` ("Can't reach the folder Tasks"), and the cached copy stays.
- **Conflict copies:** a file in the folder is a copy of `tasks.md` when it has the same extension and its name is `tasks (…).md`, `tasks N.md`, `tasks-….md` or `tasks.sync-conflict-….md` (Google Drive, iCloud, OneDrive, Dropbox and Syncthing). The note is checked at start and when the app regains focus.
- **Supported** means `window.showDirectoryPicker` exists (Chrome and Edge on a computer; not Safari, Firefox or phones).
- **The storage package stays app-neutral:** it takes the file names and database name from the app (`app-neutral.test.ts` keeps passing).
- **e2e uses Chrome's origin-private file system** as the picked folder: the test replaces `showDirectoryPicker` with one that returns a real OPFS directory handle, which IndexedDB can store and reload. The permission prompt is simulated by patching `queryPermission`/`requestPermission` in the test's init script. The app code is unchanged by this.

## Acceptance criteria

- [ ] `LocalFolderAdapter` passes `adapter-contract.ts` against an in-memory folder fake (`MemoryFolder`), "offline" being a folder that has gone away.
- [ ] Its own tests: an outside edit fails a stale write; lost permission is `AuthRequiredError` for read and write; the folder going away is `OfflineError`, a missing file in a present folder is `null`; a write creates the file.
- [ ] `conflictCopies(folder, names)` finds the copies above and nothing else (not `tasks.md` itself, not `done.md`, not `notes.md`).
- [ ] The picked folder's handle and id are kept in IndexedDB and read back on start; a failing IndexedDB means "no saved folder", not a crash.
- [ ] The sign-in screen offers **Use a folder on this computer** only where `showDirectoryPicker` exists, and the faint line elsewhere.
- [ ] The folder mode has its own cache (`taskapp:folder:<id>`) and synced-at key; texts name "the folder <name>"; the banner button reads **Allow access**.
- [ ] e2e desktop: pick a folder, files created there; add and complete a task (lands in `done.md` on disk); an outside edit while open is merged; a restart with the permission prompt shows the cached list and the banner, and **Allow access** brings the folder's text in; a conflict copy shows the note.
- [ ] e2e iphone: no folder option, the faint line shows.
- [ ] `doc/TaskApp v1 spec.md` and `packages/storage` docs describe the folder mode.

## Tests I'll write first

1. `packages/storage/test/local-folder.test.ts`: the contract with `MemoryFolder` (`test/memory-folder.ts`); then each adapter test above.
2. Same file: `conflictCopies` cases; `SavedFolder` save, load, forget and a broken IndexedDB (with `fake-indexeddb`).
3. `apps/tasks/src/lib/environment.test.ts`: `cacheName('folder', id)`, `syncedAtKey('folder', id)`.
4. `apps/tasks/src/lib/sync-banner.test.ts`: the folder's `signin` text.
5. `apps/tasks/e2e/local-folder.spec.ts`: the e2e flows above (desktop), and the iPhone check.

## Risks

- **The check-then-write gap** (above).
- **Real Chrome differs from OPFS** in the permission prompt and the `.crswap` file it writes beside the target. The manual step (a OneDrive-synced folder with Obsidian) covers it.
- **A sync client replacing the file mid-read:** the text and its hash come from one `getFile()`, so they always match each other.
- **Cache keyed by a random id:** picking the same folder again gets the same id (`isSameEntry`), so its offline copy is kept.

## Changes after review

- A write that fails after creating a file removes the empty file it left (only if still empty), and `FileSync` merges a file that was missing from an empty base, so a half-made file can only add tasks. This changes `FileSync` for every adapter, in the safe direction.
- **Pick the folder again** when the folder can't be reached or access is refused; it keeps the folder's id, so the offline copy carries over.
- Conflict-copy patterns narrowed (OneDrive's suffix is a computer name in capitals; iCloud's a number of one or two digits), and the note no longer says to delete the file.
- The saved folder is looked up only where folders can be picked, with a 3 s limit.

## Out of scope

- The first-run choice screen, the demo option there, and a setting to switch storage (3.2).
- Copying files between storages.
- Opening a conflict copy or merging it.
- Watching the folder for changes (`FileSystemObserver`); focus and online refreshes are enough for now.

## Tasks

- [ ] **1. Adapter.** `packages/storage/src/local-folder.ts`: the `FolderHandle` types (a subset of `FileSystemDirectoryHandle`, plus the permission methods TypeScript's DOM types lack), `LocalFolderAdapter`, `folderSupported`, `pickFolder`, `folderAccess`, `requestFolderAccess`, `conflictCopies`, `SavedFolder`. `test/memory-folder.ts`: `MemoryFolder`. Exports in `index.ts`. Tests first.
- [ ] **2. App wiring.** `environment.ts`: `folder` storage, its cache and synced-at names. `boot.ts`: a saved folder opens before sign-in (real and fake builds); the result carries the folder (`name`, `allow()`, `conflicts()`). `SignIn.svelte`: the option or the faint line; picking saves the handle and reloads. `sync-banner.ts` and `SyncBanner.svelte`: the folder's texts and button. `App.svelte`: the conflict note.
- [ ] **3. e2e.** `apps/tasks/e2e/local-folder.spec.ts` with a helper that installs the OPFS picker and the permission switch.
- [ ] **4. Docs.** `doc/TaskApp v1 spec.md` (storage section), a short README in `packages/storage` if none exists.
