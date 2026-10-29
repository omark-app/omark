# U.6: the demo world (Maya)

Roadmap U.6. Builds [the one app spec](../suite/one-app-spec.md) section 9 and [the Goals spec](../goals/spec.md) section 12: one made-up person across Tasks, Time and Goals, in a demo build of `apps/omark`. It replaces Tasks' sample tasks and Time's demo seed inside the one app, and brings over the Time demo's calendar strip (tag `archive/time-demo`, Time spec 12). Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

Nothing on a real host until U.7 deploys it to `demo.omark.app` and the previews. On a demo build of `apps/omark` (`VITE_STORAGE=demo`):

- it opens at once on Tasks, with the tabs Tasks · Time · Goals: no welcome, no sign-in, no storage or parts question;
- every part shows Maya, a freelance product designer in Lisbon (below), dated around today;
- edits stay in this browser (IndexedDB) and survive a reload;
- each tab's footer says DEMO, with **Reset demo** (asks first, then brings the seed back in all three parts) and **Use it for real** (`VITE_REAL_USE_URL`, default omark.app);
- Settings says the files are in this browser and offers no Change, sign-in or Sign out;
- Time opens on Hours with colouring on and edit access, and has a **Calendar** view (the demo only) that draws the week's events in their colours;
- no request leaves the site.

## Maya's world

All dates relative to today; the calendar in the browser's time zone.

- **Goals** (`goals/goals.md`): the vision line; *Health* `#health` (run a half marathon, `#RUN`), *Family & friends* `#family-friends` (a dinner with friends every week), *Work* `#work` (launch my design course, `#COURSE`, six months out; an achieved goal), *Home* `#home` (move closer to the sea, set five months ago); a Not now list. Pictures for *Health* and *Home* in `goals/images/`, made for this repo (CC0, `apps/omark/src/lib/demo/README.md`).
- **Projects** (`projects.csv`): `NOVA` (Nova Bank app redesign, a client with a rate), `COURSE`, `RUN`.
- **Time**: work days from 10 days back to 4 ahead, mostly `NOVA`, an hour or two of `COURSE`, Saturday runs on `RUN`; an unknown code (`COURS`) to fix; an all-day event, an overlap, an unanswered invite and a declined one; untracked events.
- **Tasks**: today and overdue tasks, some `#COURSE` and `#RUN`; an Important, not urgent one; a task with notes; habits *Morning stretch* (daily) and *Dinner with friends* (weekly, `#family-friends`) under way; a done history.
- **The story**: *Home* shows Needs update (nothing linked since its goal was set); the course goal is six months out but the hours go to `NOVA`.

## How

- `apps/omark/src/lib/demo/world.ts` (pure): `demoWorld(today, timeZone)` gives each folder's files and the calendar. A unit test reads it with tasks-core, time-core and goals-core: Home needs update and the others don't; the codes exist; the unknown code is the only one; the cases are there.
- `IdbDrive` gains `readBytes` and `createBytes` (a binary contract test), so the pictures live with the other demo files.
- `demoAccounts()` in `places.ts` (demo builds): one place on `IdbDrive`s named `omark-demo:<folder>`, seeded when empty, pictures fetched from the build's own assets; Tasks' copy, Goals' copy and pictures in IndexedDB under the demo's names. Time gets a fake calendar (`openFake` with the world's events and edit access), the device choices done (`started`, `askedEdit`), and the Calendar view on. `Accounts.demo` makes the shell open the place at once.
- Reset: a flag for the next start, as in Tasks; at start every demo database is deleted before anything opens, then the seed goes in again.
- Footer: Tasks' own demo controls, its reset pointed at the shell's (`part.resetDemo`); Time's and Goals' tabs get the same line from the shell.
- Time: `calendarView` in its deps shows the Calendar view (ported from the archive); `prefs` can be given.

## Steps (each test first)

1. `IdbDrive` binary: the contract passes on it.
2. `demoWorld`: the unit test above.
3. Demo reset and seeding (`openDemoWorld`): seeds an empty set, keeps edits, reset empties all.
4. Time: `calendarView`, `prefs` in `timeDeps`; the Calendar view.
5. Shell: `Accounts.demo`; demo Settings; the footer line.
6. e2e `apps/omark/e2e/demo.spec.ts` on a second web server (the demo build), desktop and iPhone: opens with no sign-in on Tasks with Maya's tasks; Time shows NOVA hours and the COURS fix; Goals shows four areas, two pictures, Home with Needs update; an edit survives a reload; Reset demo asks, then brings the seed back; the footer; no request outside the origin while going through every part and view.
7. Time's own e2e move into the shell (U.4's deferred step): `playwright.time.config.ts` runs `apps/time/e2e` against the shell's fake build, with a Time seed opening Time alone; skips listed here with the reason.
8. Docs: the one app spec section 9 (built), the Time spec 12, the roadmap row.

## Acceptance

- The step 6 e2e pass on both projects; Time's specs pass in the shell or their skips are listed.
- A non-demo build has none of the demo's code or pictures (a bundle check).
- `pnpm typecheck`, `pnpm test`, the builds and the touched e2e pass.

## Risks

- **Dates around today**: a demo left open over midnight keeps its days; Reset redates it.
- **Safari and Blobs in IndexedDB**: WebKit stores Blobs; the iPhone e2e checks the pictures after a reload.

## Out of scope

Deploying to `demo.omark.app` and the previews (U.7). Retiring `apps/tasks`' and `apps/time`'s own demos (U.7, 3.7).
