# U.5: one Settings page

Roadmap U.5. Builds section 8 of [the one app spec](../suite/one-app-spec.md), and what U.3 and U.4 left for it. Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

Still only on a local run or a fake build of `apps/omark` (hosts come in U.7):

- **Settings is one page at `/settings`**, opened from Tasks' gear or `,` and from Time's Settings view. On a phone it is a full page with a back link.
- **General** comes first:
  - where the files are (OneDrive, Google Drive or the folder), with **Change** (back to the first run's "where");
  - the parts, each with a switch. Turning one off hides its tab; its files stay. The last part can't be turned off;
  - the sign-ins: the storage's account, and Google Calendar (**Connect** or **Disconnect**) while Time is on;
  - **Sign out**, which ends every sign-in and forgets this device's choice of storage. It asks first when a change hasn't been saved yet.
- **A section per part that is on**, in tab order. Tasks has its own form (`config.yaml` in `tasks/`); Time has its own view (calendars, colouring, tracking, Rebuild). Goals has none until G.2.
- **The suite `config.yaml` gets an offline copy**: turning a part on or off offline is kept and saved later, like any edit.

## How

**A settings link between the shell and its parts.** Each part, once open, publishes what the page needs on a small shared object (`apps/omark/src/lib/registry.svelte.ts`):
- Tasks: its schema, the config text, its writer, the note and the save status, through a hook in `apps/tasks` (`part.settings`, unset in `apps/tasks` alone);
- Time: its store, so the page shows Time's `Settings` component.

The page mounts every part that is on (hidden), so each one registers even when its tab hasn't been opened.

**Tasks' own `#settings` stays** for `apps/tasks` alone. Inside the shell, Tasks' gear and `,` go to `/settings` instead (`part.openSettings`).

**The suite file offline.** A known device already starts from the parts it last saw (U.3). What was missing is a part turned on or off while the folder can't be reached. That change is now kept on the device as a pending step (`omark:parts-pending:<place>`) and shown at once. It is written once the folder is reachable again (at start, on focus, back online), applied to the folder's file as it is then, so another device's change meanwhile is kept. `FileSync` isn't used here: its reads create a missing file, and the first run must see that there is none.

**Sign out** calls the broker's `logout` (every session), clears this device's storage choice and known parts, and goes back to the welcome screen. The parts' offline copies stay, as in Omark Tasks.

## Steps (each test first)

1. The suite file offline: a pending change shown at once, written when back, merged onto another device's change. Shell tests.
2. Parts off: `turnOff` in the shell, never the last part; routes to a part that is off offer to turn it on, as now.
3. The registry and the Tasks hook: `part.settings` and `part.openSettings`, unset in `apps/tasks` (its tests unchanged).
4. The `/settings` page: General (storage, parts, sign-ins, sign-out) and each part's section; the route and the back link.
5. e2e (desktop and iPhone): open Settings from Tasks' gear and `,`; turn Time on and off from General; change a Tasks setting and a Time setting there, reload, both kept in their own files; connect and disconnect the calendar; sign out returns to the welcome screen; turning a part on offline is saved once back online.
6. Docs: the one app spec (section 8 as built), the settings page spec.

## Acceptance

- The step 5 e2e pass on both projects.
- `apps/tasks` alone is unchanged: its tests and e2e pass, and `#settings` works as before.
- `pnpm typecheck`, `pnpm test`, the builds and the touched e2e pass; Tasks' specs inside the shell still pass.

### As built (2026-10-29)

- `apps/omark/e2e/settings.spec.ts` (desktop and iPhone) covers:
  - Tasks' gear and `,` opening the page;
  - parts on and off, offline too;
  - a Tasks and a Time setting landing in their own files;
  - the calendar connected and disconnected next to OneDrive;
  - sign-out.
- Tasks' own settings specs run on this page in `e2e:tasks`, except two that check its standalone `#settings` page (the address, the link to Omark Time, a single status line); they are in its skip list with the reason.
- The U.3 shell test that expected Tasks' `,` to open `#settings` now expects `/settings`.
- The first card is called **Omark**: Tasks' first section is already General.

### Fresh-eyes review (2026-10-29)

Fixed, with tests first (`apps/omark/src/lib/shell.test.ts`, `e2e/settings.spec.ts`):

1. Two parts changes made within one write: only the first was written. The write now goes on until no change is left.
2. A known device's start re-read the suite file while its pending change was being written, and could show the old parts. The re-read now waits for that write.
3. Opening another storage kept the old place's mounted parts, addresses and Settings' way back. Now everything is reset when a place opens. Pending changes are kept per place, so one place's change can't be written to another's file, nor come back twice.
4. With no suite file yet, a pending change wrote one behind the first run's parts question. It now waits for that question. Parts shown after a first open offline are no longer remembered as the folder's.
5. With Tasks on but its start failed, Settings showed "Opening…" for ever. The Omark card now shows anyway.
6. Time's "All Omark settings" went around the shell's router, so Back reloaded the first part. It now goes through the shell, and Back returns to Time.
7. Time's store stayed in the registry after its part was gone. It is cleared on unmount.
8. Smaller: sign-out names a pending parts change in its question, and Connect and Disconnect show their errors. A sign-out that fails stays signed in with the error, on every storage: a folder user may still have a calendar session (a security review caught a first try that went ahead offline).

Kept: Disconnect isn't offered on Google Drive, as the calendar is part of the one Google sign-in there (signing out of it would sign out of the storage).

## Risks

- **Mounting every part for the page** starts Time's sync when Settings opens. That is what opening Time does anyway, and only for a part that is on.
- **Two writers of one file:** only the part writes its own `config.yaml`; the page goes through the part's writer, never its own `FileSync`.

## Out of scope

- The part-switching keys in Tasks' keyboard settings (they stay Alt+1–3, as built in U.3): moved to the [backlog](../TaskApp%20backlog.md).
- Time's calendar step inside the shell's first run (spec 6, step 4): Time asks from its tab, which the spec allows ("now or later from the Time tab").
- Goals' settings (`stale_after`): G.2. The demo world: U.6.
