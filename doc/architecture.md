# Architecture

How the Omark apps are built: the packages, how a change reaches the user's files, how two devices editing at once are merged, and how sign-in works without a server that keeps anything.

## The monorepo

TypeScript, pnpm workspaces, one repository for the whole suite.

| Path | What it is |
|---|---|
| `packages/tasks-core` | Omark Tasks' logic, pure: parse and write `tasks.md`, `done.md`, `config.yaml`; buckets, recurrence, habits, stats, search, quick add; the three-way merge |
| `packages/time-core` | Omark Time's logic, pure: the title parser, events to rows, hours, colours, CSV files, projects, summaries, charts, reports; the `CalendarSource` interface |
| `packages/calendar` | Calendar sources for Omark Time: a fake calendar, its demo seed and the shared contract test (Google comes next) |
| `packages/storage` | Shared by both apps: the `StorageAdapter` interface, the OneDrive and Google Drive adapters, in-memory and IndexedDB fakes, the offline cache, file sync and the sign-in client |
| `packages/settings` | The schema-driven Settings page and the `config.yaml` reader and writer both apps use ([its README](../packages/settings/README.md)) |
| `packages/signin` | The sign-in helper, with a Microsoft and a Google provider |
| `functions/` | The Cloudflare Pages Function that serves the sign-in helper at `/api/auth/*` |
| `apps/tasks` | The Omark Tasks PWA: Svelte 5 and Vite, its service worker, and its Playwright e2e |
| `apps/site` | The omark.app landing page, privacy policy and terms; static ([its README](../apps/site/README.md)) |
| `brand/` | The icon family and its sources ([its README](../brand/README.md)) |
| `tools/` | The Todoist import, the agent guard hook, CI helper scripts |

**Pure means pure.** The `*-core` packages have no DOM, network or storage: their `tsconfig.json` leaves out the DOM and Node types, so using them fails the typecheck. All the logic that decides what a file should say lives there and is unit-tested. A future platform (a native app, a CLI, a server job) can reuse it as it is.

## From a click to the file

Omark Tasks, from the inside out:

```
tasks-core      parse, change, write the text of each file; merge
   ↓
workspace       apps/tasks/src/lib/workspace.ts: the three files, each with its merge
   ↓
FileSync        packages/storage: one per file; local text, base, eTag, retries, status
   ↓
LocalCache      IndexedDB on the device: the offline copy
   ↓
StorageAdapter  read(name) and write(name, text, ifMatch): OneDrive, Google Drive, a fake
```

1. The user completes a task. `tasks-core` returns the new texts of `tasks.md` and `done.md`.
2. The workspace stages them. About a second after the last edit (the `saveDelaySeconds` setting), each changed file's `FileSync` saves.
3. `FileSync` puts the new text in the cache first, then writes it through the adapter with the eTag it last read (`If-Match`). The cache holds `{ base, baseEtag, local, dirty }`: `base` is the last text known to be in storage, `local` the working text.
4. If the write is accepted, the new eTag becomes the base. The footer says `saved`.
5. Offline, the edit stays in the cache, marked dirty, and is written when the app is back online. The app works fully offline from the cache.

The app re-reads every file when it opens, when it regains focus and when it comes back online, so edits from another device, Obsidian or an AI agent show up.

## Merging: eTags and three-way merge

Two devices, an editor and an agent can all change the same file. Nothing may be lost.

- **Every write is conditional.** The adapter writes only if the file's eTag still matches. If someone else changed it, the write fails with `PreconditionFailedError`.
- **Then the app merges.** It reads the remote text and merges three versions: the base (last synced), the local text and the remote text.
  - `tasks.md` and `done.md` are merged block by block (`packages/tasks-core/src/merge.ts`, built on `node-diff3`). A block is a task line with its notes, so notes never get mixed up between tasks.
  - If the same task changed on both sides, both versions are kept as two tasks, and the user deletes one.
  - `config.yaml` is merged key by key (`@omark/settings`). When the same key changed on both sides, this device wins and the Settings page says so.
- **Then it writes again** with the new eTag, up to three attempts.

The merge is a pure function: `merge(base, local, base)` is `local`, and `merge(base, base, remote)` is `remote`. Its tests are in `packages/tasks-core/test/merge.test.ts`.

## Sign-in

The apps call Microsoft Graph and Google's APIs straight from the browser. They need an access token, and a browser-only app's sign-in lasts only 24 hours. So each app's origin also serves a small, stateless token broker:

- `/api/auth/login` sends the user to Microsoft or Google (authorization code with PKCE).
- `/api/auth/callback` redeems the code with the client secret and puts the refresh token in an **encrypted, HttpOnly cookie** in the user's browser.
- `/api/auth/token` reads that cookie, gets a fresh short-lived access token, rotates the cookie, and returns only the access token.

Nothing is stored on the server. A Microsoft sign-in lasts 90 days from the last use, a Google one 180 days. The code is in `packages/signin`; `functions/api/auth/[[path]].ts` serves it, and the Pages variable `OMARK_APP` picks the app. [SECURITY.md](../SECURITY.md) lists what each cookie holds, and [self-hosting](self-hosting.md) how to set up your own.

## Adding a storage adapter

A storage provider is two methods:

```ts
interface StorageAdapter {
  /** null = the file does not exist. */
  read(name: string): Promise<RemoteFile | null>; // { text, etag }
  /** ifMatch null = create only. Throws PreconditionFailedError on mismatch. */
  write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }>;
}
```

1. Write the adapter in `packages/storage/src/`, with a fake of the provider's HTTP API for its tests (see `fake-google-drive.ts` and `test/graph-fake.ts`).
2. Run the shared contract test against it: `adapterContract(() => ({ adapter, external, offline }))` from `packages/storage/test/adapter-contract.ts`. It checks reads, create-only writes, conditional writes, changes made outside the app and offline errors. Every adapter passes the same contract.
3. Map the provider's errors to `AuthRequiredError`, `OfflineError` and `PreconditionFailedError` (`errors.ts`), so `FileSync` handles them the same way.
4. If the provider has no true conditional write, say how you protect against lost updates in your plan.

A new adapter changes storage, so its issue is `size:large` and needs an approved plan.

Calendar sources for Omark Time work the same way: the `CalendarSource` interface in `time-core` and a shared contract test in `packages/calendar/src/contract.ts`.

## Tests

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | The `*-core` packages, most of the tests |
| Integration | Vitest | Storage and file sync against the fake drives: outside changes, eTag conflicts, the offline queue, merge |
| End-to-end | Playwright | The real app in desktop Chrome and iPhone WebKit, against a fake drive |
| Real storage | Playwright, by hand | A smoke test on a real OneDrive folder (`pnpm e2e:real`), never in CI |
