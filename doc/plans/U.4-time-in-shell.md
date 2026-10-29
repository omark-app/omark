# U.4: Omark Time inside the shell

Roadmap U.4. Builds the Time part of sections 4, 5 and 7 of [the one app spec](../suite/one-app-spec.md): Time's screens as a part of `apps/omark`, its calendar sign-in asked only when Time is on, its files in `time/` and `projects.csv` at the top. Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

Still nothing on a real host: the one app gets one in U.7. On a local run or a fake build of `apps/omark`:

- the Time tab is Omark Time, not a placeholder;
- with Time on and no calendar access yet, the Time tab offers **Connect Google Calendar**. Nothing asks about the calendar while Time is off, so a Tasks-only user never sees it;
- on Google Drive the calendar is added to the same Google sign-in. On OneDrive or a folder it is a second, calendar-only Google sign-in next to Microsoft, and it never asks for Drive;
- Time's files go to `time/` (`events-*.csv`, `config.yaml`) and `projects.csv` to the top of the Omark folder;
- in the shell, Time doesn't ask where its files live, and its Settings don't offer its own sign-out or folder picker: the shell owns storage and sign-in (U.5 adds them to the one Settings page).

`apps/time` on its own (the Time demo, `archive/time-demo`) is unchanged.

## How

**Broker: one session per provider.** A new `AuthOptions.sessions: 'per-provider'` in `packages/signin` names the session, hint and signed-in cookies after the provider (`omark_microsoft_session`, `omark_google_signed_in`…). `token` and `logout` take `?provider=`. The login cookie stays one: one sign-in runs at a time. In this mode the readable signed-in cookie also lists the accesses the session has (`google:calendar,edit`), so the app knows whether the calendar was added without a token call. Without the option, nothing changes for the bridge or the Time demo.

**Providers in the one app:** `microsoft`; `google` (`drive.file`, with `calendar` and `edit` to add); `googlecal`, the same Google client with the calendar as its own scope and `edit` to add, for a calendar next to OneDrive or a folder. Both Google ids use the one redirect URI, so there's nothing new to register.

**Client:** `createAuth({ provider })` binds a client to one provider's session: it reads that provider's signed-in cookie, calls `token?provider=`, and gains `accesses()` and `signOut()`. The shell makes one client per provider it uses.

**Time's seam.** `apps/time`'s store already takes its deps (`AppDeps`). The shell builds them (`timeDeps(given)` in `apps/time/src/lib/boot.ts`):
- `storage` is fixed, so the store skips its storage step;
- `openPlace` gives one `FolderFiles` over a routed adapter (`projects.csv` to the top folder, everything else to `time/`), with the offline copy and sync state named after the place;
- `auth` is the calendar sign-in above: signed in means the session has the calendar access;
- `embedded` hides sign-out and "Pick the folder again".

**Fake build.** The shell's fake gets Time's fake calendar (`openFake`), with its sign-in starting signed out of the calendar. As with Tasks' seed, a Time e2e seed (`__OMARK_TIME_SEED__`) opens Time alone on Time's own fake drive, so Time's specs run in the shell unchanged.

## Steps (each test first)

1. **Broker:** per-provider cookies; a Microsoft and a Google session side by side, each refreshed and signed out alone; `token` and `logout` by `?provider=`; accesses in the signed-in cookie; the default mode unchanged (existing tests).
2. **Client:** `provider` binding, `accesses()`, `signOut()`; the unbound client unchanged.
3. **Time:** `storage` fixed and `embedded` in `AppDeps`; the routed adapter; `timeDeps`. Store and unit tests.
4. **Shell:** the three providers and `sessions: 'per-provider'` in its sign-in function; a client per provider; storage sign-in on its provider's session; the Time part mounted with `timeDeps`; the fake build.
5. **e2e in the shell** (desktop and iPhone): Tasks only, no calendar question; Time turned on asks to connect the calendar in its tab, then the calendars step, then hours; Time's files in `time/` and `projects.csv` at the top; OneDrive plus a calendar sign-in, both signed in at once.
6. **Time's own specs inside the shell:** `pnpm --filter omark e2e:time` (a Playwright config like `e2e:tasks`) against the shell's fake build; specs that can't run there are listed here with the reason. In CI with the other shell e2e.
7. **Docs:** the one app spec (sessions), Time spec where it names its own folder, the roadmap row.

## Acceptance

- The step 5 e2e pass on both projects; Time's specs pass inside the shell, or the exceptions are listed here.
- A Tasks-only start never loads Time's code and never asks about the calendar.
- `apps/time` builds, and its tests and e2e pass unchanged.
- The bridge (`apps/tasks`, root `functions/`) is unchanged: its broker tests pass as they are.
- `pnpm typecheck`, `pnpm test`, the builds and the touched e2e pass.

## Risks

- **Two sessions on one origin:** cookies are per provider, so a sign-in with one never clears the other. The login cookie is shared: two sign-ins started in two tabs at once, the later one wins and the earlier one reads as `expired`, as today.
- **Google's `include_granted_scopes`:** a `googlecal` sign-in by an account that also gave Omark `drive.file` comes back with both. Each session keeps only its provider's known scopes (`grantedScope`), so the calendar session never carries Drive.
- **Time's module-level env** read inside the shell (as Tasks' was in U.3): the shell's Vite config defines the names Time reads; the Time-in-shell e2e catch any miss.

## Out of scope

The one Settings page with General (storage, parts, sign-ins, sign-out) is U.5; Time's first-run calendar step inside the shell's own first run (spec 6, step 4) waits for U.5 too, and Time asks from its tab meanwhile. Goals (G.2), the demo world (U.6), deploys and redirects (U.7).
