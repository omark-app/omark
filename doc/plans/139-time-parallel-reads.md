# Plan for #139: read Time's files in parallel

## What we found

The 12x gap is mostly the test browser. Playwright's WebKit on Windows wakes up once per Windows timer tick (about 15 ms) for every callback that comes from another thread: `setTimeout(0)` takes 15 ms there against 3.7 ms in Chromium, and an IndexedDB get takes 15 ms against 0.12 ms. A plain page with no app code shows the same, so it is the engine build, not Omark.

Time's first sync makes about 23 IndexedDB transactions one after another, so it pays that tick 23 times:

| | Chromium | WebKit on Windows |
|---|---|---|
| Start click to "Synced" | 215–290 ms | 1420–2070 ms |
| `sync()` itself | 14 ms | 380–450 ms |

Safari on macOS and iOS doesn't have the Windows tick, so users most likely don't see this. That is inferred: nobody measured it on a Mac or an iPhone. For users the real Google Calendar and Drive calls take most of a sync.

The one thing in the app that adds to it: `sync()` and `readSummary()` read each file only after the previous one has finished. They read config, then projects, then each year file, each one a cache get, a drive read and a cache put. These reads don't depend on each other. Reading them at the same time cut WebKit's `sync()` from about 430 ms to about 330 ms in a throwaway prototype. With a real drive it saves a network round trip per extra file.

## What changes for users

- Time's sync and its offline summary read `config.yaml` and `projects.csv` at the same time, then all year files at the same time. A sync with two or more year files, or on a slow connection, finishes a little sooner.
- Nothing else: the same files are read and written, writes stay one at a time and in the same order, and the file formats, merge and saving don't change.
- The issue title changes to say it is WebKit on Windows, in tests.

## Acceptance criteria

- [ ] `sync()` starts the `projects.csv` read before the `config.yaml` read has finished.
- [ ] `sync()` starts every year file's read before any of them has finished.
- [ ] `readSummary()` does the same for its reads.
- [ ] Year-file writes and the state save keep their order. A failed read still fails the sync before anything is written.
- [ ] All existing Time unit tests and e2e pass unchanged.
- [ ] The issue is retitled "Time: e2e first sync slow on WebKit on Windows (timer tick)", and the spec or factory doc notes that WebKit timings on Windows aren't a guide to Safari.

## Tests I'll write first

In `apps/time/src/lib/sync.test.ts`, a `TextFiles` wrapper whose `read()` waits on a promise the test releases:

1. `sync reads config and projects at the same time`: release nothing, check that both reads have started. Fails today: only the config read has started.
2. `sync reads every year file before any finishes`: with `trackFrom` in the previous year, release config and projects, then check that both year reads have started. Fails today.
3. The same two for `readSummary`.
4. `a failed year read writes nothing`: one year read rejects; no write happens and the state isn't saved. This should pass before and after; it guards the change.

No wall-clock e2e budget: it would be flaky.

## Risks

- **Sync is on the "ask first" list.** Only the order of reads changes. Each file has its own `FileSync`, so two reads don't share state. Writes stay sequential.
- **A read that fails.** With `Promise.all` the first error wins and the others keep going in the background. They only fill the cache, which is what a read does anyway.
- **Gain is small.** About 100 ms in the slow test browser, a network round trip per file for users. If that isn't worth a change to sync, close #139 with the retitle and the doc note only.

## Out of scope

- Reading calendars in parallel (`readChanges` per calendar): that is Google's API and its rate limits, a separate question.
- Batching the IndexedDB cache into fewer transactions: it would touch `packages/storage`, shared with Tasks.
- Running WebKit e2e on Windows faster. CI runs on Linux, which likely doesn't have this tick (not measured).
