# A write whose reply was lost (#161)

**Goal:** a save that reached the storage, though the app never heard back, is treated as the base of the next merge. Then a task changed on this device and changed again on another one comes out once, not twice.

**Cause:** `FileSync` keeps the texts of writes with no reply (`unconfirmed`) in memory only, and uses one as the base only when the remote still equals it. Two cases miss:

1. Another device writes the file before this one reads it again. The remote no longer equals our landed write, so the merge runs against the old base, and the task both sides changed (a habit completed on two days) is kept twice.
2. The page is reloaded, or iOS kills the PWA mid-write. `unconfirmed` is gone, so even a remote equal to our write is merged against the old base.

The fallback today keeps both versions, so nothing is ever lost. The fix must keep that: when it can't tell whether a write landed, it merges as today.

**Tech stack:** TypeScript, Vitest. No new dependency.

## What changes for users

- A repeating task or habit completed on the phone, then on the computer, no longer comes back as an old copy next to the next one. Any task edited on two devices in a row behaves the same way.
- Nothing else changes: no new screen, setting or message. The files' format is unchanged.

## Design

1. **Remember unanswered writes in the cache.** `CachedFile` gets an optional `unconfirmed: string[]` (newest last, at most 5). `writeLocal` adds the text and persists it *before* the write is sent, so a page killed mid-write still knows. It is cleared by a successful write, and a 412 removes that text (refused for sure). Caches written by older builds have no field and read as `[]`; older builds ignore the field.
2. **Ask the storage whether one landed.** A new optional adapter method:
   ```ts
   /** The newest of `texts` the file held at some point in its kept history, or null (none, or no history). */
   landed?(name: string, texts: string[]): Promise<string | null>;
   ```
   - OneDrive: `GET …/approot:/<name>:/versions` (newest first), compare each version's `size` with the byte length of each text, download only the ones whose size matches (`…/versions/<id>/content`), compare bytes.
   - Google Drive: `GET files/<id>/revisions?fields=revisions(id,md5Checksum,size)`, compare MD5 of each text, no download needed.
   - Local folder, IndexedDB drive: no history, no method.
   - Looks back at most 25 versions.
3. **Use it in `absorb`.** When the file is dirty and `unconfirmed` isn't empty:
   - remote equals one of them: that is the base (as today);
   - else, if the adapter has `landed`: the text it returns is the base;
   - else, or when `landed` fails or returns null: the old base, as today.
   A wrong guess can only come from a version byte for byte equal to our text, which some writer did produce, so using it as the base never drops an edit.

`done.md`, `config.yaml`, Time's CSVs and `goals.md` go through the same `FileSync` and get the fix too.

## Acceptance criteria

- [ ] Same page: a write lands with no reply, another device then changes the same task, the next pull keeps only the other device's version (the issue's first test).
- [ ] Reload: the same, with a new `FileSync` on the same cache in between (the issue's second test).
- [ ] Killed mid-write: the write lands, the page dies before any reply, the reopened page finds it through the cache.
- [ ] A write that never landed, then another device changes the file: our edit is still in the merged text (no loss).
- [ ] An adapter without `landed`, or whose `landed` throws: the merge is today's (duplicate possible, nothing lost), and the sync does not go offline because of it.
- [ ] OneDrive and Google Drive adapters implement `landed`, tested against `graph-fake` and `fake-google-drive`; the fakes keep a version history.
- [ ] A cache record without `unconfirmed` loads and syncs as before.
- [ ] `doc/architecture.md` (merging section and "Adding a storage adapter") describes unanswered writes and `landed`.

## Tests I'll write first

1. `packages/storage/test/file-sync.test.ts`: the two tests from the issue, a killed-mid-write test (the write promise never settles, a second `FileSync` opens on the cache), a never-landed test, and a no-history fallback test.
2. `packages/storage/test/adapter-contract.ts`: a `landedContract` run on the fakes and both adapters: after writes A, B, C, `landed([B])` is B, `landed([X])` is null, `landed([A, C])` is C.
3. `packages/storage/test/onedrive-adapter.test.ts` and `google-drive-adapter.test.ts`: only size-matching versions are downloaded (OneDrive), MD5 is used without a download (Drive), a failed history request throws an error `FileSync` treats as "don't know".
4. `packages/storage/test/cache.test.ts`: a record with and without `unconfirmed` round-trips.

## Risks

- **History may not hold every save.** The docs say OneDrive and SharePoint can be set to keep a version per save, per edit, or none, and old versions can be purged; Google Drive purges unkept revisions after 30 days or past 100. Then `landed` returns null and we merge as today. To check with `pnpm e2e:real` on OneDrive personal and Google Drive that two quick writes give two versions.
- **One more cache write per network write**, to persist `unconfirmed` before sending. The tasks file is about 20 KB, so it is small; a failed cache write doesn't block the upload, as today.
- **Extra requests** only in the rare case (dirty, unanswered writes, remote moved): one list request and at most a few small downloads.
- **Google `drive.file` scope:** revisions of files the app made should be readable with it (writer role). To confirm in `pnpm e2e:real`.

## Out of scope

- The merges from an empty base (a file that went missing and came back, two copies of a Drive file, #67): they can also keep both versions of a task, but are a different cause.
- A merge rule that drops an older occurrence of a repeating task by date: it would guess, and could drop a real edit.
- Cleaning up duplicates already in users' files.
