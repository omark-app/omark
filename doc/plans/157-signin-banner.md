# Plan for #157: the sync banner names Omark's sign-in server when that is what can't be reached

## What changes for users

A sync talks to two places: Omark's sign-in server (`/api/auth/token`, on the app's own address), which hands out an access token about once an hour or after the phone closed the app, and the storage (OneDrive or Google Drive). Today any failure to reach either reads `Can't reach OneDrive`.

After this, when the sign-in server is what failed (no network to it, no answer within its time limit, or a server error), the banner says:

- `Can't reach Omark's sign-in server since 21:35 — showing your last saved copy`
- and while a retry is under way past 4 s: `Still reaching Omark's sign-in server — showing your last saved copy (synced since 21:35)`

The banner goes once a sync succeeds. Every other banner stays as it is: the storage unreachable (`Can't reach OneDrive …`, `Can't reach Google Drive …`), `Sign in again …`, a full storage, a folder.

## How

- `OfflineError` says what could not be reached: `unreachable: 'storage' | 'signin'`, `'storage'` by default.
- `createAuth`'s token refresh throws it with `'signin'` for no network, its time limit, a 5xx and a reply with no token.
- `createHttp`'s `authed` turns any `OfflineError` while waiting for the token (its own 20 s limit included) into `'signin'`, so a stalled token call is named right too.
- `FileSync` keeps the cause of the last failure, as it keeps `full()` today: `signInUnreachable()`. A retry keeps it until it succeeds or fails for another reason.
- The Tasks workspace and store pass it on like `full`, and `bannerText` takes it. The one app and the standalone Tasks build both use that banner.

## Acceptance criteria

- [ ] A token call that fails with no network, times out, or gets a 5xx shows `Can't reach Omark's sign-in server since HH:MM — showing your last saved copy` (without "since" when this device never synced).
- [ ] A retry under way after such a failure, past 4 s, shows `Still reaching Omark's sign-in server — showing your last saved copy (synced since HH:MM)`.
- [ ] OneDrive or Google Drive itself unreachable shows today's texts, unchanged.
- [ ] A sign-in that is needed (401) and a full storage show today's texts, unchanged.
- [ ] Once a sync succeeds the banner goes; a later storage failure names the storage again.
- [ ] A folder on the device never shows the sign-in server text.
- [ ] The Tasks spec's sync banner line lists the new text.

## Tests I'll write first

- `packages/storage/test/auth.test.ts`: the refresh's no-network, timeout, 5xx and no-token failures are `OfflineError`s with `unreachable: 'signin'`; a 401 is still `AuthRequiredError`.
- `packages/storage/test/onedrive-adapter.test.ts`: a `getToken` that rejects with an `OfflineError`, or never settles, fails the read as `'signin'`; a Graph request with no network fails it as `'storage'`.
- `packages/storage/test/file-sync.test.ts`: a pull failing with a `'signin'` error leaves `offline` and `signInUnreachable()` true; the retry keeps it while `syncing`; a success clears it; a `'storage'` error after it clears it; listeners hear the change.
- `apps/tasks/src/lib/workspace.test.ts`: the workspace's `signInUnreachable()` is true when any file's is, and a change to it reaches `onStatus` listeners.
- `apps/tasks/src/lib/sync-banner.test.ts`: the two new texts, with and without "since"; the existing texts as they are.
- `apps/tasks/e2e/offline.spec.ts`: a new auth stub state, `helper-down`, signed in to Microsoft but every token call failing as unreachable; the banner shows the sign-in server text. Run in the one app (`pnpm --filter omark e2e:tasks`) and standalone.

## Risks

- **The helper answers 503 when it can't reach Microsoft's or Google's own sign-in.** That also reads as Omark's sign-in server. It still points at the sign-in step rather than the storage; telling the two apart is out of scope.
- **A longer text on a phone** wraps to one more line. Today's texts already wrap.
- **The store and workspace grow one field**, the same shape as `full`, so the risk of a missed path is small; the workspace and store tests cover it.

## Out of scope

- Omark Time's `can't reach Google` and Goals' `Can't reach the Omark folder` messages.
- Telling Graph apart from OneDrive's download host.
- Moving the sign-in server off Cloudflare, or keeping the access token across app restarts.
