# Say when the drive is full (#68) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When saves fail because the storage is full, the banner says so ("Your Google Drive is full — changes are kept on this device until there's room") instead of "Can't reach Google Drive" for good.

**Architecture:** A new `StorageFullError` in `packages/storage`. Each adapter throws it for its "full" answer:
- Google Drive: 403 `storageQuotaExceeded`;
- OneDrive: 507, or a 403 or 507 with code `quotaLimitReached`;
- a local folder: `QuotaExceededError`.

`FileSync` keeps the status `offline`, so it retries as it does today. It also remembers that the last failure was a full storage (`full()`), and clears that on the next success. The Tasks workspace and store pass the flag on, and the banner picks the text.

The status stays `offline` on purpose. Omark Time's `files.ts` folds statuses by name and would read a new one as `saved`. The flag is additive, so Time can adopt it later without anything changing for it now.

**Tech stack:** TypeScript, Svelte 5, Vitest, Playwright. No new dependency.

## What changes for users

- **When the Google Drive is full,** the banner reads "Your Google Drive is full — changes are kept on this device until there's room". Edits stay in the offline copy, and the app keeps retrying on focus, on coming back online and on every save, as today. Once there's room, the next save goes through and the banner goes away.
- **The same holds for OneDrive** ("Your OneDrive is full — …").
- **For a folder on this computer:** "The disk with the folder Tasks is full — changes are kept on this device until there's room".
- **Other failures read as before:** other 403s, 429, 5xx and the network all show "Can't reach …".

## Acceptance criteria

- [ ] `GoogleDriveAdapter` throws `StorageFullError` for a 403 with reason `storageQuotaExceeded`, on a create and on a write. Other 403s (except `insufficientPermissions`, which stays sign-in), 429 and 5xx throw as today.
- [ ] `OneDriveAdapter` throws `StorageFullError` for 507, and for 403 or 507 with error code `quotaLimitReached`. Other errors are as today.
- [ ] `LocalFolderAdapter` throws `StorageFullError` for a `QuotaExceededError`.
- [ ] `FileSync.full()` is true after a sync that failed with `StorageFullError`, and false again after the next success. The status is `offline` meanwhile, and the next pull or save retries.
- [ ] The Tasks banner shows the "full" text for the storage in use. It goes back to "Can't reach …" for any other failure, and goes away once a save succeeds.
- [ ] e2e on fake storage (desktop and iPhone): a fake Google Drive answering 403 `storageQuotaExceeded` shows the banner; making room and focusing the app saves and clears it.
- [ ] `doc/tasks/spec.md` (sync banner) and `packages/storage/README.md` describe it.

## Tests I'll write first

1. `google-drive-adapter.test.ts`: 403 `storageQuotaExceeded` on create and on write → `StorageFullError`; a 403 `rateLimitExceeded` is a plain error; `insufficientPermissions` is still `AuthRequiredError`.
2. `onedrive-adapter.test.ts`: 507 and `quotaLimitReached` → `StorageFullError`.
3. `local-folder.test.ts`: a `MemoryFolder` whose write fails with `QuotaExceededError` → `StorageFullError`, and the existing file is unchanged.
4. `file-sync.test.ts`: `full()` true after a full-storage failure (status `offline`), false after the next success, false after a different failure.
5. `sync-banner.test.ts`: the full texts for an account and for a folder.
6. `e2e/google-drive.spec.ts`: the fake answers saves with 403 `storageQuotaExceeded` (a new `FakeGoogleDrive.setFull`), the banner shows, `setFull(false)` + focus saves and clears it.

## Risks

- **Drive's error shape:** the reason sits in `error.errors[0].reason`, as `insufficientPermissions` does today, and newer replies also carry it in `error.details`. The adapter reads both.
- **OneDrive's answer** varies (507 Insufficient Storage, or `quotaLimitReached`). Both are covered; anything else reads as today.
- **A full drive that a read still serves:** reads keep working, so the list stays current. Only saves fail, which is what the banner says.

## Out of scope

- Omark Time showing the "full" text (its lane can use `FileSync.full()`).
- Telling the user how much room is left, or linking to the storage's quota page.
