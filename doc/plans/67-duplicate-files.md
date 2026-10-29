# Merge a duplicate tasks.md instead of hiding it (#67) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `tasks.md` (or `done.md`, `config.yaml`) on Google Drive starts resolving to a different file than the one this device last synced, the app merges both files' contents instead of taking the other file's text and hiding its own.

**Architecture:** An adapter may say which file a text came from: an optional `source` on `RemoteFile` and on `write`'s result. For Google Drive it is the file id; OneDrive and a local folder leave it out, so nothing changes for them.

`FileSync` keeps the source of its base (`baseSource` in the cache, optional, so older caches still read). When a read brings a different source:
- the base no longer describes that file, so it merges from an empty base, local plus remote, as it already does for a file that went missing (#86);
- it writes the result to the file now in use.

The other copy stays in Drive untouched. Nothing is deleted.

**Tech stack:** TypeScript, Vitest. No new dependency.

## Why it happens

Drive allows several files with one name, and the adapter uses the oldest. Two ways to get a second one:
- **Two first runs at once while Drive's list lags:** each device creates its own `tasks.md`, and its check right after creating still sees only its own.
- **A restored folder:** the user restores an older "Omark Tasks" from the trash after the app made a new one. The older folder wins the next lookup.

Today, a device whose cached base came from the newer file reads the oldest one on its next start. The etag differs, and with no unsaved edits the sync takes that text, so tasks saved only in the newer file drop out of the app.

## What changes for users

- In those two cases, both files' tasks show in the app and are written to the file in use. Tasks that are the same in both show once. A task edited differently in the two shows both versions, as any merge conflict does today, so nothing is lost.
- The other file stays in Drive as it was.
- OneDrive and folder users: nothing changes.

## Acceptance criteria

- [ ] `RemoteFile.source` and `write(...)`'s `source` are optional; `GoogleDriveAdapter` fills both with the file id. OneDrive, the folder adapter and the fakes pass `adapter-contract.ts` unchanged.
- [ ] `FileSync` keeps `baseSource`. A read whose `source` differs from it merges from an empty base and writes the result, with or without local edits. A read with no `source`, or a cache without `baseSource`, behaves as today.
- [ ] `FakeGoogleDrive` can lag its lists (`setListLag(true)`: new files and folders don't show in lists until `settleLists()`), like Drive's list right after a create.
- [ ] Two devices on one lagging fake each create `tasks.md` with their own task. After the lists settle and each device starts again, the oldest file holds both tasks, and both devices show both.
- [ ] Restoring an older folder from the trash, after tasks were saved in the new one, shows the tasks from both on the next start, and the older folder's `tasks.md` holds them all.
- [ ] `doc/tasks/spec.md` (Google Drive storage) describes it.

## Tests I'll write first

1. `file-sync.test.ts`, with a small adapter stub that sets `source`:
   - a changed source with no local edits ends with the union, written back;
   - a changed source with local edits ends with the union;
   - the same source behaves as before (a three-way merge from the real base);
   - no source at all behaves as before.
2. `google-drive-adapter.test.ts`: `read` and `write` return the file id as `source`; the list-lag fake reproduces two files after two concurrent first runs.
3. `google-drive-adapter.test.ts` (or a new `google-drive-duplicates.test.ts`) with `FileSync` and the real `mergeTasksText` (already a devDependency there): the two-device case and the restored-folder case, end to end.

## Risks

- **Union merges can duplicate a task** edited differently on the two copies. That is the existing rule for conflicts ("keep both versions so nothing is lost").
- **`done.md` and `config.yaml` use their own merges.** From an empty base, `mergeDoneText` keeps both sides' entries. `mergeSettings` keeps local values where both set a key. Both are tested.
- **Cache shape:** `baseSource` is a new optional field in the IndexedDB cache. An older cache reads it as missing, which means "as today" until the next successful sync records it.

## Review (2026-10-29)

A fresh-eyes review of c8cab51 found, and the next commit fixed (tests first):

1. The empty-base merge also ran when the file was trashed and made again by another device, so a task deleted there came back. Now it runs only while the file the base came from still exists: adapters that give sources also have `exists(source)` (Drive: the id is there and not trashed).
2. The adapter contract had been loosened to `toMatchObject`; it is exact again, with `source` where the storage gives one.

Accepted: with two real copies, a task deleted or completed in only one of them comes back once, since nothing tells which copy is newer. The spec says so.

## Out of scope

- Trashing or renaming the other copy after the merge (it stays, untouched).
- OneDrive: Graph addresses files by path, so a name can't point at two files.
- A note in the app naming the duplicate file.
