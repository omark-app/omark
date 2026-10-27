# Omark Time screens (#58, T.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Omark Time's screens on top of the #57 shell (spec section 9): hours (home), charts, fix list, projects, settings and report export.

**Architecture:** One page per view in `apps/time`, switched by the URL hash (`#/hours`, `#/charts`, `#/fix`, `#/projects`, `#/report`, `#/settings`), so the browser's back button and a home-screen app both work.
- **The store** keeps the rows and projects in memory after each sync (and from the cached copy offline). Each screen computes what it shows with `@omark/time-core`'s pure functions: `summarise`, `weeklyByProject`, `weeklyByCategory`, `buildFixList`, `buildReport`, `reportToMarkdown`, `reportToCsv`, and the project edits.
- **Changes to `projects.csv`** go through the files' 3-way merge. The next sync re-checks `known` and colours, which #57's sync already does when the codes change.
- **Charts** are hand-drawn SVG, so nothing is fetched from anywhere.
- **Settings** use `@omark/settings`' `SettingsPage` for the plain `config.yaml` fields. Time's own cards are the calendar picker, colouring with its consent, track from, storage, Rebuild and Sign out (milestone plan #53: "builds those two fields itself").

**Tech Stack:** Svelte 5, `@omark/time-core`, `@omark/settings`. No new dependency.

**Spec:** [`doc/Omark Time spec.md`](../Omark%20Time%20spec.md) section 9, plus 5–8 for what the numbers mean. Milestone: [53-omark-time-milestone.md](53-omark-time-milestone.md). Shell: [57-time-shell.md](57-time-shell.md).

## What changes for AL

- **Hours** opens first.
  - A range: this week (the default), last week, this month, last month, or custom.
  - Hours per project, with its categories under it; done and planned apart; totals.
  - The status line from #57, with the fix count as a link to the fix list.
- **Charts:** hours per week per project, and per category for one project you pick, over a range.
- **Fix list:**
  - Red events, with the date, the title, "Add CODE as a project" (opens the project form filled in) and "Open in Google Calendar".
  - Days where events overlap.
- **Projects:**
  - Add, edit, archive and unarchive; codes can't be renamed.
  - Delete warns that the project's events turn red and offers to archive instead.
  - Archived projects are listed apart.
- **Report:**
  - One client, or one or more projects, and a range.
  - Rounding: none, 5, 15 or 30 minutes per event.
  - Done only, or planned too.
  - Download CSV or Markdown. Money is rate × hours, per currency.
- **Settings:**
  - The shared settings page: all-day hours, week start, and the file's text editor.
  - Plus Time's own cards: calendars, "Colour my events", track from, where the files are, Rebuild and Sign out.
- Works on the phone (one column, a bottom bar) and on the desktop (a side bar), in light and dark.

## Acceptance criteria

- [ ] e2e (desktop and iPhone) on the fake calendar:
  - add a project and see a red event turn green (its row known, its colour green with colouring on);
  - archive, then unarchive;
  - delete warns and offers to archive;
  - the hours summary for this week, last month and a custom range;
  - the fix list's "Add CODE as a project", and its "Open in Google Calendar" link pointing at the event;
  - a report export (CSV and Markdown, rounding 15) whose text is checked.
- [ ] Charts and every other screen make no request outside the app's origin. An e2e records every request; in the fake build there must be none to another origin.
- [ ] Codes can't be renamed: the edit form shows the code as read-only.
- [ ] Unknown columns in `projects.csv` and unknown keys in `config.yaml` stay (time-core already keeps them; an e2e edits a file with an extra column).
- [ ] Hours and charts count only `known` rows, done time unless planned is asked for, as the time-core functions do.
- [ ] Phone and desktop layouts; light and dark themes.

## Tests I'll write first

- `src/lib/views.test.ts`, the pure glue in the app:
  - parsing the hash route;
  - a custom range: dates checked, from ≤ to;
  - the report file name;
  - the Google Calendar link for a row (from the `htmlLink` the sync keeps).
- `store.test.ts`:
  - rows and projects are there after a sync, and offline;
  - `addProject`, `updateProject`, `archiveProject` and `deleteProject` write `projects.csv` and sync;
  - a duplicate code is refused with time-core's message.
- e2e: `hours.spec.ts`, `charts.spec.ts`, `fix-list.spec.ts`, `projects.spec.ts`, `report.spec.ts`, `settings.spec.ts` and `no-outside-requests.spec.ts`, one per criterion above.

## Tasks

1. **Navigation and the rows in the store.**
   - The hash router, and a layout with a bottom bar on the phone and a side bar on the desktop.
   - `SyncResult` and `readSummary` return the rows.
   - The device state keeps `links`: calendar + event id → `htmlLink`, for rows of unknown codes, so the fix list can open the event after a reload.
2. **Hours.** The range picker (named ranges from `namedRange` with the config's `week_start`; custom from and to), with `summarise`.
3. **Projects.** List, form, archive and delete, with time-core's `addProject`, `updateProject`, `archiveProject`, `deleteProject` and `validateProject`. Writes go through `FolderFiles`, then `syncNow`.
4. **Fix list.** `buildFixList`, the actions, and the link to Google Calendar.
5. **Charts.** An SVG stacked bar chart per week (projects), and lines per category for one project, with a legend. Each chart gets a text table beside it for screen readers.
6. **Report.** `buildReport`, then a download through a blob URL, using `reportToCsv` and `reportToMarkdown`.
7. **Settings.**
   - `SettingsPage` with a Time schema (all-day hours as a number 0.25–24, week start as a choice).
   - Time's cards: the calendars and "Colour my events" from #57; track from as a date input; storage; Rebuild; Sign out.
8. **The outside-request check and the phone pass.** An e2e that lists every request, and screenshots on both projects in both themes.

## As built

- **Settings is Time's own view**, as the first risk below foresaw. `@omark/settings`' reader refuses any key outside its schema ("Unknown setting"). Time's `config.yaml` also holds `calendars`, `track_from` and a boolean `colour_events`, which its field types can't express. So the view has its own fields for all of them, and links to Omark Tasks' settings.
- **The phone's bottom bar** uses short labels ("Fix" for "Fix list"); each link keeps its full name for screen readers.

## Risks

- **`SettingsPage` was built for Tasks.** If it can't hold Time's cards beside it, Time keeps the custom cards on a page of its own and links between the two.
- **Many rows.** A few years of events is thousands of rows. Every view filters in memory with time-core's functions, and the range limits what is drawn.
- **`htmlLink`** is known only for events read since this lands. Older unknown rows get their link on the next full read (Rebuild); until then the action is hidden.

## Out of scope

- The demo (#59) and its calendar strip.
- OneDrive (#97).
- Editing events from the app: titles are changed in Google Calendar.
