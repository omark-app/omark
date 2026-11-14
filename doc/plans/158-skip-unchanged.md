# Plan for #158: don't download a file whose eTag hasn't changed

## What changes for users

Nothing on screen. A sync that finds nothing new gets faster and uses less data:

- **OneDrive**: today every pull of a file is two requests, the details from Graph and then the content from OneDrive's download host. When the details show the eTag this device already has, the download is skipped. A refresh of Tasks with nothing new goes from six requests to two hosts to three requests to one.
- **Google Drive**: the same; the head revision is downloaded only when the file changed.
- `done.md`, which only grows, is no longer downloaded each time the app is opened or focused.

On a slow mobile network that keeps more syncs under the 4 s after which the "Still reaching OneDrive" banner shows.

## How

- `StorageAdapter` gets an optional method, like `exists`: `readIfChanged(name, known: { etag, source? })`. It answers `'unchanged'` when the file the name points at now has that eTag (and, where the storage names files, that source); otherwise exactly what `read` answers (the file, or null when it is missing).
- `OneDriveAdapter`: the Graph details request as today; on a matching eTag it stops there. Otherwise the download and its hash check run as today.
- `GoogleDriveAdapter`: the metadata request as today; on a matching etag and file id it stops there. Otherwise the head revision is downloaded as today.
- `FakeOneDrive` (the e2e builds' drive) gets it too, and Tasks' `tokenGated` passes it on, so the whole e2e suite goes through the new path.
- `FileSync.pullOnce` uses it when the file has a base eTag and the adapter has the method. `'unchanged'` does what a matching eTag does today in `absorb` (keep everything), and local edits are then written as today. After a 412 the re-read stays a full `read`: the file did change.
- The local folder, the demo's IndexedDB drive and every direct caller of `read` (the shell, Goals, tags) stay as they are.

## Acceptance criteria

- [ ] OneDrive: a pull of a file whose eTag the device already has makes one request (the Graph details) and no download.
- [ ] Google Drive: a pull of an unchanged file makes one request (the metadata) and downloads no revision.
- [ ] A file that changed is downloaded and checked as today (OneDrive's hash check and retry, Google Drive's head revision).
- [ ] A file deleted elsewhere still reads as missing and is created again.
- [ ] Edits made on this device since the last sync are still uploaded after an `'unchanged'` answer; a write that meets a newer file (412) still re-reads in full, merges and writes.
- [ ] A file with no eTag yet (never synced on this device) is read in full.
- [ ] Google Drive with two files of one name (#67): when the name now points at another file than the one the base came from, it is read in full, never `'unchanged'`.
- [ ] The folder storage, the demo drive and direct callers of `read` work as before.
- [ ] `doc/architecture.md` says how a pull reads.

## Tests I'll write first

- `packages/storage/test/onedrive-adapter.test.ts`: `readIfChanged` with the current eTag answers `'unchanged'` after one Graph call and no download-URL call; with an older eTag it answers the text after both calls; a missing file answers null; a hash mismatch is still retried.
- `packages/storage/test/google-drive-adapter.test.ts`: the same against the fake Drive's call log; a matching etag with another file id reads in full.
- `packages/storage/test/adapter-contract.ts`: for every adapter that has `readIfChanged` (FakeOneDrive, Google Drive): unchanged, changed by another device, missing.
- `packages/storage/test/file-sync.test.ts`, with an adapter that records calls: a pull with a known eTag asks `readIfChanged` with it and never `read`; `'unchanged'` with local edits still writes them and ends `saved`; a file with no eTag uses `read`; the re-read after a 412 uses `read`; an adapter without the method uses `read` as today.
- `apps/tasks/src/lib/workspace.test.ts` (or an auth-stub test): `tokenGated` gets a token before `readIfChanged`, and leaves it out when the drive has none.
- e2e: no new spec; the full `pnpm e2e` (every app, both browsers) runs through the new path, and the Google Drive specs run the real adapter against the fake Drive API.

## Risks

- **An eTag that matches while the content differs** would leave the device on the old text. `absorb` already makes that same decision today (on a matching eTag it drops the downloaded text), so this adds no new trust in eTags; only the wasted download goes.
- **OneDrive eTags from a write and from the details** must be the same kind for the match to happen. They are both the item's eTag, and today's comparison in `absorb` already relies on it. If they ever differ, the cost is a download, as today.
- **Google Drive etags also change on metadata changes** (rename, sharing). Such a change costs one download, as today.
- **Two copies on Google Drive (#67)**: guarded by comparing the file id as well as the etag.

## Out of scope

- Checking all files in one request (Graph `delta`, or a folder listing).
- `If-None-Match` on the requests themselves.
- Goals' direct reads (`goals.md`, pictures) and the shell's reads of `config.yaml`.
- The local folder and the demo drive, whose reads cost no network.
