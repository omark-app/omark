# @omark/storage

Where an Omark app's files live, the offline cache and sync. App-neutral: the apps pass their own file and database names (`test/app-neutral.test.ts` checks).

Every storage is a `StorageAdapter` (`src/adapter.ts`): `read(name)` gives the text and an eTag, and `write(name, text, ifMatch)` refuses with `PreconditionFailedError` when the file changed since that eTag. `FileSync` then merges and writes again. Each adapter passes `test/adapter-contract.ts`.

| Adapter | Storage | eTag |
|---|---|---|
| `OneDriveAdapter` | OneDrive through Microsoft Graph | Graph's eTag, `If-Match` |
| `GoogleDriveAdapter` | Google Drive, `drive.file` | Drive v2 etag, `If-Match` |
| `LocalFolderAdapter` | a folder picked on this computer (File System Access API, Chrome and Edge on a computer) | SHA-256 of the text, checked before each write |
| `IdbDrive`, `FakeOneDrive`, `FakeGoogleDrive` | IndexedDB (the demo) and fakes for tests | |

For a picked folder: `folderSupported(window)` says whether the browser can pick one, `pickFolder` shows the picker, `SavedFolder` keeps the handle in IndexedDB, `folderAccess` and `requestFolderAccess` handle the permission a later visit may need (lost permission is `AuthRequiredError`), and `conflictCopies` names sync clients' conflict copies (`notes (1).md` and similar).

A storage with no room left is `StorageFullError`: a 403 `storageQuotaExceeded` from Drive, a 507 or `quotaLimitReached` from OneDrive, a `QuotaExceededError` from a folder (#68). `FileSync` then shows `offline` and retries as for any failure, and `full()` is true until the next success or a different failure; its `onStatus` listeners hear when `full()` changes too.
