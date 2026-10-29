# G.2b Area pictures

Roadmap row G.2b; Goals spec 7.1 and 8. Fast mode: no issue or approval.

## What changes for users

- An area card shows its picture (the area's first Markdown image, `images/<name>.jpg` next to `goals.md`) above its name; with none, or one that can't be read, the plain colour as before.
- The area form has a Picture row: Add picture (new area or none yet), or the picture with Replace and Remove.
- An added picture is resized to at most 1600 px on its long side and saved as JPEG in `goals/images/`, named from the area tag: `climbing.jpg`, then `climbing-2.jpg` and so on when that name is taken. A replaced or removed picture stays in the folder; only the line in `goals.md` changes.
- A picture shown once is kept on this device, so the board shows it offline.

## Decisions (my call)

- Binary files are their own small interface, `BinaryStore` in `@omark/storage`: `readBytes(name)` (a `Blob`, or null) and `createBytes(name, blob)`, create only (PreconditionFailedError when the name is taken). Pictures are never overwritten, so they need no etags, merges or `FileSync`.
- The pictures live in their own adapter on `goals/images` (`Place.pictures()`), so names stay plain and no adapter learns sub-paths. LocalFolderAdapter's `subfolder` takes a path (`goals/images`) for it.
- Adding a picture needs a connection: offline, the form says so and keeps the rest of the edit. (Queuing binary writes offline is not worth it here.)
- Only a picture path `images/<plain name>` is loaded; any other path (a URL, `../x.jpg`) shows the plain colour and keeps its line.
- The offline copy: an IndexedDB store per place (`omark-pictures-<key>`), by name. It shows at once; the folder's file is read after it and replaces it when they differ, since a name is taken again once its file is deleted by hand.

## Acceptance criteria

1. The storage contract test covers `readBytes`/`createBytes` for FakeOneDrive, OneDrive, Google Drive and the local folder (top and subfolder path), offline included.
2. Adding a picture in the area form writes a JPEG of at most 1600 px into `goals/images/<tag>.jpg` and the image line into the area; the card shows it.
3. Replace writes `<tag>-2.jpg` and leaves `<tag>.jpg`; Remove takes the line out and leaves the file.
4. A picture that can't be read shows the plain colour; offline add says why.

## Tests first

- `packages/storage/test/adapter-contract.ts`: `binaryContract` (missing is null, create then read gives the same bytes, a second create is refused, offline throws OfflineError).
- `apps/omark/src/parts/goals/pictures.test.ts`: `fitWithin`, `pictureName`, `pictureFile` (which paths load), `savePicture` choosing the next free name.
- `apps/omark/e2e/goals.spec.ts`: add, replace and remove a picture through the form (a 2000×1000 PNG in, a 1600×800 JPEG out).

## Risks

- Google Drive's multipart upload must carry the bytes untouched: the body is a `Blob` of the parts, not a string.
- HEIC from an iPhone: Safari decodes it for `createImageBitmap`; another browser that can't decode the file gets "This picture can't be read".

## Out of scope

- Cropping, choosing the alt text, deleting old picture files, pictures for goals.
- The demo world's pictures (U.6).

## Review (fresh eyes, 2026-10-29)

Fixed:
1. A slow upload could act on another form opened meanwhile, or put the picture line on the wrong area after a move, a delete or a merge. The form is now locked while it saves (the scrim and Cancel too), the line goes to the area found again by its tag, and the form is touched afterwards only if it is still the same one.
2. A file the browser can't show (not a picture, half synced) showed a broken image and was kept on the device for good. The card's image now falls back to the plain colour and drops the kept copy (`BlobKeep.delete`).
3. A kept copy could go stale when a name was taken again; see the offline copy above.
4. Pictures not shown are read again when the device comes back online; lost folder access has its own message; the card image has an empty alt (the heading names the area); older browsers without `imageOrientation: 'from-image'` retry without it; object URLs are let go when replaced.

Left: a Google Drive folder deleted mid-upload reads as "name taken", so the next try may skip a number (harmless).
