# 31: Demo mode and the public demo

Issue #31, roadmap 2.1, [launch spec](../TaskApp%20open%20source%20launch%20spec.md) 6.3. Branch `issue-31-demo-mode`.

## What changes for AL

- **A demo anyone can open.** `demo-tasks.omark.app` shows the sample tasks with no sign-in. Edits stay in that browser, survive a reload, and **Reset demo** in the footer brings the samples back. The footer says DEMO and links to the real options.
- **`pnpm demo`** runs the same thing locally. Plain `pnpm dev` now opens the demo too, instead of a Microsoft sign-in that can't work under Vite. `.env.example` lists every variable.
- **PR previews become demo builds**: sample files as before, and now they survive a reload and have Reset demo. The label still says PREVIEW.
- **Nothing changes** for `tasks.alipka.com`, staging or Promote. The demo deploys straight from `main` alongside staging. It holds no user data, so it has no Promote step.

## Design

### The mode

- `VITE_STORAGE` gets a third value, `demo`. `fake` stays as it is, for e2e tests: in memory, seeded by the test, with test hooks. `onedrive` stays the default for builds.
- **A durable fake drive.** `@omark/storage` gets `IdbDrive`, a `StorageAdapter` that keeps each file's text and version in its own IndexedDB database, with the same eTags as `FakeOneDrive` ("v1", "v2", …). It passes the shared `adapterContract`.
  - Today's durable test path (`__TASKAPP_FAKE_DURABLE__`) re-seeds an in-memory drive on every load while the cache survives. That is why only the cache was durable. With a durable drive, the drive and the cache agree after a reload.
  - If IndexedDB is unusable (private mode), the demo falls back to `FakeOneDrive` in memory with the usual cache warning, rewritten for the demo: "This browser blocks offline storage, so demo edits are lost on reload."
- **Seeding.** On the first open (an empty drive), the drive is filled with `sampleFiles(today)`. It is never re-seeded on its own, so edits stay.
- **Reset demo** empties the drive and cache databases and reloads; the reload seeds again. It asks first: "Reset the demo? Your demo edits are lost."
- **Footer.** `StatusLine` shows `DEMO` (or `PREVIEW` on a preview), a **Reset demo** button, and a "Use it for real" link. The link goes to `VITE_REAL_USE_URL`, default `https://omark.app`; until the landing page (2.2) exists, CI sets it to the repo README.
- **No sign-in code runs** in demo mode: no `createAuth`, no `/api/auth` call, no sign-in screen.
- The database names are `omark-demo:drive` and `omark-demo:cache`, apart from the OneDrive cache's `taskapp:<folder>`, so a demo can never touch a real cache on the same origin (e.g. localhost).

### Developer setup

- `apps/tasks/.env.development` sets `VITE_STORAGE=demo`. Vite reads it only for `vite` (dev), never for `vite build`, so deploy builds are unaffected. A variable already set in the shell wins over the file, so the real-OneDrive smoke (`VITE_STORAGE=onedrive`) and `.env.development.local` overrides keep working.
- Root `package.json`: `pnpm dev` and `pnpm demo` (= `pnpm --filter tasks dev`), with no inline `VAR=value`, so they work in PowerShell, cmd and bash.
- `.env.example` at the root lists every variable:
  - the build's `VITE_*`;
  - the sign-in helper's Pages variables and secrets (`OMARK_APP`, `MSAL_CLIENT_ID`, `MSAL_CLIENT_SECRET`, `MSAL_TENANT`, `COOKIE_KEY`, `ONEDRIVE_SCOPE`);
  - the CI repository variables (the per-app `TASKS_*` and `CF_TASKS_*` ones).

  Each gets a one-line comment and a safe default. It holds no real values.
- The README's command section is updated for `pnpm demo` and the shell note. The full rewrite stays in 2.3.

### The demo deployment

- **A separate Pages project, `omark-tasks-demo`, with its own build**, not a host-selected mode of the staging build. Reasons:
  - the demo bundle carries no sign-in path;
  - wrangler runs from `apps/tasks` and deploys `dist`, so the repo-root `functions/` is left out and the demo origin has no `/api/auth` at all;
  - its IndexedDB origin is its own;
  - it can't be confused with production.
- CI job `tasks-demo` on `main` (push and manual run), parallel to `tasks-staging`, after `check` and `e2e`, `timeout-minutes: 15`:
  - build with `VITE_STORAGE=demo` and `VITE_REAL_USE_URL`;
  - `tools/ci/ensure-staging.mjs`, generalised to `tools/ci/ensure-pages-project.mjs` with a `project` (and optionally a `domain` and zone) per call, makes sure the project exists;
  - deploy;
  - an HTTP check that `https://demo-tasks.omark.app/` returns 200 and `/api/auth/session` returns 404.
- New repository variables, named like the move's per-app ones: `CF_TASKS_DEMO_PROJECT=omark-tasks-demo`, `TASKS_DEMO_URL=https://demo-tasks.omark.app` and `TASKS_REAL_USE_URL`. I set them with `gh`.
- The custom domain and the DNS record are one-time setup that I do now: the project and domain with the wrangler OAuth token, the proxied CNAME with the omark.app DNS token. CI doesn't touch the omark.app zone, so the CI token needs no new permission; the live-URL check catches a broken domain.

### Leftovers folded in

- The roadmap marks milestones 0 and 1 done.
- Already done by the monorepo move (#47), so dropped here: `timeout-minutes` on the existing CI jobs, the CLAUDE.md `TaskApp-e2e` line, the sign-in helper's console prefix.

## Acceptance criteria

- [ ] `pnpm i && pnpm demo` on a fresh clone shows the sample tasks (Windows PowerShell and bash).
- [ ] Plain `pnpm dev` opens the demo; `VITE_STORAGE=onedrive` in the shell or `.env.development.local` still gives the OneDrive build.
- [ ] In the demo, an edit (add, complete, edit a note) survives a reload, on desktop Chrome and iPhone WebKit.
- [ ] Reset demo asks first, then brings back exactly the sample files.
- [ ] The footer shows DEMO, Reset demo and "Use it for real".
- [ ] The demo build makes no request outside its own origin and none to `/api/`; an e2e test fails if it does.
- [ ] Private mode (IndexedDB blocked) still opens the demo in memory with the demo warning.
- [ ] `IdbDrive` passes the shared adapter contract.
- [ ] PR previews are demo builds and still say PREVIEW.
- [ ] `main` deploys the demo to `demo-tasks.omark.app`; the CI check passes, and I open it in the built-in browser.
- [ ] `.env.example` lists every variable the code, the helper and CI read, and a unit test fails when a new `VITE_*` appears in the source without being listed.
- [ ] Production and staging builds are unchanged (same variables, still OneDrive; `pnpm e2e:real` unaffected).
- [ ] The new `tasks-demo` job has `timeout-minutes`; the roadmap marks milestones 0 and 1 done.

## Tests I'll write first

1. `packages/storage/test/idb-drive.test.ts`: `adapterContract(() => new IdbDrive(...))` with `fake-indexeddb`, plus seeding only when empty, `clear()` emptying it, and versions surviving a new instance on the same database. This fails: there is no `IdbDrive`.
2. `apps/tasks/src/env.test.ts` (or `storage-mode.test.ts`): `storageMode('demo')` → `demo`, unset → `onedrive`, `fake` → `fake`. This fails: `demo` maps to `onedrive` today.
3. `apps/tasks/src/lib/demo.test.ts`: `openDemo()` seeds an empty drive with `sampleFiles(today)`, leaves a non-empty one alone, and `resetDemo()` empties both databases. This fails: the module doesn't exist.
4. `apps/tasks/e2e/demo.spec.ts`, against a second Playwright web server (a demo build on the checkout's e2e port + 1, from `e2e/port.ts`), both projects:
   - the sample tasks show;
   - add a task, reload, and it's still there;
   - Reset demo (accepting the confirm) brings back the samples;
   - the footer shows DEMO and the link;
   - every request's origin is the demo server's, and none hits `/api/`.

   It fails: there is no demo build.
5. `tools/env-example.test.ts`: every `import.meta.env.VITE_*` and every `env.X` in `functions/` and `packages/signin`, and every `vars.X` in `.github/workflows/`, appears in `.env.example`. It fails: the file doesn't exist.
6. `tools/ci/ensure-pages-project.test.mjs`: the existing ensure-staging tests, re-run with the generalised name and one demo case.

The existing `offline.spec.ts` keeps using `__TASKAPP_FAKE_DURABLE__`, so it doesn't change. `sample-files.test.ts` changes only where `fakeSeed`'s preview branch moves to demo mode, and the PR will say so.

## Risks

- **Dev default surprises someone who expects OneDrive in `pnpm dev`.** Only AL used it that way. The README and `.env.example` show the one-line override.
- **iOS WebKit evicts IndexedDB** after 7 days without a visit. For the demo that's fine: it re-seeds.
- **The demo deploy needs DNS on the omark.app zone.** If the CI token lacks it, the custom domain is a one-time manual step (`needs-human`), and later deploys don't need it.
- **The e2e run gets a second build** (about 20 s). Acceptable; the timeout guard covers a stuck build.
- **The monorepo move** (#47) landed first; this plan was updated for its paths on 2026-10-26 (see the note at the end).

## Out of scope

- The first-run choice screen (3.2) and local-folder mode (3.1). "Use it for real" is only a link.
- The landing page (2.2). The link points at the README until it exists.
- A Promote step for the demo.
- The full README rewrite (2.3).
- Caching or skipping `playwright install-deps`. That's a separate small CI issue, which I'll file if the timeouts don't settle it.

## Update after the monorepo move (2026-10-26)

Paths and names only; scope and acceptance criteria are unchanged.

- `apps/web` → `apps/tasks`, `packages/core` → `packages/tasks-core`; `pnpm demo` filters `tasks`.
- CI names follow the move's per-app scheme: job `tasks-demo`, variables `CF_TASKS_DEMO_PROJECT`, `TASKS_DEMO_URL`, `TASKS_REAL_USE_URL`.
- `functions/` is at the repo root now, so the demo deploy runs wrangler from `apps/tasks` to leave it out.
- The e2e demo server takes the checkout's port + 1 (#50) instead of a fixed 4174.
- The domain and DNS are set up once by me rather than by CI, so the CI token needs no omark.app DNS permission.
- Leftovers the move already did are dropped (timeouts on existing jobs, CLAUDE.md line, console prefix).
