# U.3: the `apps/omark` shell

Roadmap U.3. Builds sections 4–7 of [the one app spec](../suite/one-app-spec.md): one app, one storage choice, one folder, parts on and off, tabs, the merged first run. Tasks moves in unchanged. Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

Nothing yet: the one app gets no host until U.7, and the bridge (`tasks.alipka.com`) keeps running from `apps/tasks`. On a local run or a fake build, `apps/omark`:

- asks once where the files live (OneDrive, Google Drive, a folder), then which parts to use (Tasks ticked);
- keeps everything in one folder: `config.yaml` at the top, `tasks/` for Tasks;
- with only Tasks on, looks exactly like Omark Tasks today: no tab bar, no calendar question;
- with more parts on, shows tabs (top on desktop, bottom on the phone) and a path per part: `/tasks`, `/time`, `/goals`.

Time and Goals are placeholders in U.3 ("Omark Time comes to this tab in the next update"), so tabs and switching can be built and tested; U.4 and G.2 fill them. In U.3 a part is turned on from its address (`/time` offers "Turn on Omark Time"); the parts switches in Settings come with the one Settings page (U.5). Alt+1, Alt+2 and Alt+3 switch tabs; they move into Tasks' keyboard settings in U.5.

## How

**Tasks stays where it is.** `apps/omark` imports Tasks' UI and logic from `apps/tasks/src` (a workspace dependency on `tasks`), so the bridge build and the one app share one copy until 3.7 removes the bridge. Tasks gets one seam: its boot can be handed a ready storage place by the shell instead of choosing one itself. Without that, `apps/tasks` boots as today.

**The shell owns storage.** One sign-in client (`createAuth`, cookie prefix `omark`), one device choice (`omark:storage`), one picked-folder handle. For each part it builds an adapter on the part's subfolder:

| Storage | Root | Part folder |
|---|---|---|
| OneDrive | the app folder (`Apps/Omark`, `Apps/Omark Staging` by registration) | `tasks` |
| Google Drive | `My Drive/Omark` (`Omark Staging` on staging and previews) | `Omark/tasks` |
| Local folder | the picked folder | `tasks/`, created on the first write |

**The suite `config.yaml`** sits at the root: `parts: [tasks, time, goals]` in tab order, default `[tasks]`; unknown keys are kept. It syncs with `FileSync` like any part file.

**Sign-in.** `apps/omark/functions/api/auth/[[path]].ts` is the one app's own Pages Function (deployed from `apps/omark`, as the Time demo is), with Microsoft and Google (`drive.file`, calendar as extra access for U.4) and cookie prefix `omark`. No `OMARK_APP`; the root `functions/` keeps serving the bridge until 3.7. The callback returns to the path the sign-in started from (`/tasks`, `/time`, `/goals`, else `/`), kept in the sealed login state. Holding a Microsoft and a Google session at once is U.4's job: only Time needs it.

**Names.** IndexedDB, localStorage and cookies use `omark*` names. Nothing migrates: it is a new origin.

## Steps (each test first, then a commit)

1. **Storage:** `GoogleDriveAdapter` takes a folder path (`Omark/tasks`), finding or creating each level; `LocalFolderAdapter.subfolder(name)` reads through a missing folder as "no file" and creates it on the first write. Contract tests for both.
2. **Broker:** `returnTo` in the login state (only `/`, `/tasks`, `/time`, `/goals`), the callback and `?signin_error=` go back there; the `omark` function config. Handler tests.
3. **Suite logic** (`apps/omark/src/lib`, pure): suite `config.yaml` read and write (parts, order, unknown keys kept); the path → part decision (`/` → first part on, a part that is off → offer to turn it on); the first-run decision (choice, session, folder, suite file present → skip the parts question).
4. **Tasks seam:** `boot({ place })` with a given adapter, cache name, auth and storage name; `apps/tasks` tests unchanged and green.
5. **The app:** Vite and Svelte set up like `apps/tasks` (fake, demo and real modes), the merged first run, parts on and off, the tab bar, lazy-loaded parts (Tasks-only loads nothing else), keys to switch parts, the PWA manifest "Omark" with the suite icon.
6. **e2e** (desktop and iPhone, fake storage), from spec 12:
   - first run with Tasks only: no tab bar, no calendar question, only `config.yaml` and `tasks/` created;
   - turning Time and Goals on: tabs appear, a part's subfolder appears on its first write;
   - switching tabs keeps each part's state (Tasks' scroll and an open search);
   - a second device on the same folder skips the parts question;
   - Tasks' own e2e specs run against the shell's fake build with Tasks only (a second Playwright project); any that can't are listed with the reason.
7. **CI:** `apps/omark`'s typecheck, unit tests, build and e2e in the check job. Deploys come in U.7.

## Acceptance

- The spec 12 e2e above pass in both projects; Tasks' specs pass inside the shell, or the exceptions are listed here.
- A Tasks-only first load fetches no Time or Goals code (checked in the e2e by the requested scripts).
- `apps/tasks` builds and its tests and e2e pass unchanged: the bridge is untouched.
- `pnpm typecheck`, `pnpm test` and the builds pass.

### Tasks' specs inside the shell (2026-10-29)

`pnpm --filter omark e2e:tasks` runs `apps/tasks/e2e` against the shell's fake build: 255 pass on desktop and iPhone. Left out, with the reason, in `apps/omark/playwright.tasks.config.ts`:

- whole specs for what the shell owns: `demo` (U.6), `environment` and `icons` (hosts and looks, U.7), `first-run`, `google-drive` and `local-folder` (the shell's storage choice and first run);
- the five sign-in tests in `lifecycle` (the shell signs in; covered when Time signs in, U.4);
- the page title and manifest tests in `shell` (the app is "Omark").

Found on the way: the shell must keep a part's hash and history state when it changes the address (Tasks' `#settings`), and `/` opens the first part in place. Tasks loads with the shell and a known device starts from the parts it last saw, so a Tasks-only start waits for nothing more than Omark Tasks did.

### Fresh-eyes review (2026-10-29)

No high-severity findings; the sign-in return path is safe and `apps/tasks` alone is unchanged. Fixed, with tests (`src/lib/shell.test.ts`, `e2e/shell.spec.ts`):

- picking a storage while signed in with the other provider opened nothing while the redirect was leaving;
- the remembered parts are kept per folder, never from a first open that could not read it, and a folder that lost its suite file asks again;
- Alt+digit switches only when the key gives the digit (Option+3 on a Mac types #);
- a tab comes back to its part's address (Tasks' `#settings`), scroll and focus;
- Tasks' own sign-in again returns to its address; a failed sign-in redirect still opens a usable storage, with the error shown;
- a late re-read of the suite file no longer undoes a part turned on meanwhile; start-up failures show the error card;
- a picked folder with Omark Tasks' files at its top is refused with a hint.

Moved to U.5: the suite `config.yaml` goes through `FileSync` with an offline copy (now it is read and written directly, so turning a part on offline fails with a message).

## Risks

- **Tasks' module-level env** (`STORAGE_MODE`, `HOSTS`, `BRAND`, build defines) is read from `apps/omark`'s Vite config when imported there; the shell's config must define the same names. Caught by the Tasks-in-shell e2e.
- **Google path folders**: two devices creating `Omark` at once can make two folders; the adapter already uses the oldest, and the same rule applies per level.
- **Pages routes**: `/tasks` etc. need the SPA fallback; checked on the U.7 preview.

## Out of scope

Time inside the shell and two sessions at once (U.4), the one Settings page (U.5; U.3 keeps Tasks' own settings and adds parts on/off to it), Goals (G.2), the demo world (U.6), hosts, deploys and redirects (U.7), the cutover (3.6).
