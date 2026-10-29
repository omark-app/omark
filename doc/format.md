# Omark file formats

Version: 1.0

Omark keeps your data in plain files that any editor, script or AI agent can read and write. This page describes them well enough that someone could write a compatible tool. Where it and the code disagree, it is a bug in one of them: please open an issue.

- [Omark Tasks](#omark-tasks): `tasks.md`, `done.md`, `config.yaml`.
- [Omark Time](#omark-time): calendar event titles, `events-YYYY.csv`, `projects.csv`, `config.yaml`.
- [Omark Goals](#omark-goals): `goals.md`, `config.yaml`.

The examples and tables on this page are checked against `packages/tasks-core` and `packages/time-core` by `tools/ci/test/docs.test.ts`, and the Omark Goals part against `packages/goals-core` by its `test/format-doc.test.ts`.

## The Omark folder

The one Omark app ([spec](suite/one-app-spec.md)) keeps everything in one folder, with a subfolder per part:

```
Omark/                 OneDrive: Apps/Omark; Google Drive: My Drive/Omark; or the folder the user picks
  config.yaml          the suite: which parts are on
  projects.csv         shared by Time and Goals, read by Tasks
  tasks/               tasks.md, done.md, config.yaml
  time/                events-YYYY.csv, config.yaml
  goals/               goals.md, config.yaml, images/
```

- A part makes its subfolder and files the first time it writes, so a Tasks-only folder holds `config.yaml` and `tasks/` and nothing else.
- The suite `config.yaml` lists the parts that are on, in tab order; without the file, or without `parts`, only Tasks is on. Unknown names are ignored and other keys are kept.

  ```yaml
  parts: [tasks, time, goals]
  ```

- Each part's files keep the formats below.

## Omark Tasks

Three files in one folder: `tasks/` in the Omark folder. Until the move to the one app (roadmap 3.6), the Omark Tasks app keeps them flat in its own folder.

| File | Holds |
|---|---|
| `tasks.md` | All open tasks |
| `done.md` | A log of completions, oldest first, with each task's notes |
| `config.yaml` | Settings that differ from the defaults |

**Encoding.** UTF-8, LF line endings, one newline at the end. A reader accepts a BOM and CRLF; a writer writes neither.

**Dates.** `YYYY-MM-DD`, in the user's local time zone. "Today" is the local date, never UTC.

**Identity.** A task has no ID. It is identified by its text, so a tool never adds IDs, markers or metadata.

### tasks.md

```markdown
# Tasks
- [ ] Inbox zero by Friday ⏫
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-11-01
    - transfer from savings
- [ ] Call the dentist 📅 2026-10-19
- [ ] Call the bank ⏫ 📅 2026-10-20
- [ ] Learn Rust
```

- **Sections.** Anything above the `# Tasks` heading is kept as it is. A new file is just `# Tasks`.
- **Blocks.** Under `# Tasks`, a task block is a task line plus the indented lines right under it: its notes. Any other line is a block of its own and is kept.
- **Task line.** `- [ ] {title} ⏫ 🌱 🔁 {rule} 📅 {date}`. Every field is optional. A writer puts them in this order, after the title. A reader finds them anywhere in the line.

| Field | Meaning |
|---|---|
| `⏫` | Important (Obsidian Tasks' high priority) |
| `🌱` or `🌱 N` | A habit, with its own goal of N repetitions (1–999). See [Habits](#habits) |
| `🔁 {rule}` | Repeats, by one of the [repeat rules](#repeat-rules). The rule runs to the next field emoji, the next ` #tag` or the end of the line |
| `📅 {date}` | Due date |

- When `📅` or `🔁` appears twice, the last valid one counts and the earlier one stays in the title, as in Obsidian Tasks. Every `⏫` and every `🌱` counts as the one mark. A `🔁` whose text is not a valid rule stays in the title.
- **Notes.** Indented lines under a task, written as `    - {note}` (four spaces). A reader keeps any indent and marker byte for byte.
- **Order.** Line order is the user's own order.
- **Buckets are worked out, never stored.** The date decides where a task shows:

| Bucket | Date |
|---|---|
| Today | today or earlier (overdue tasks show here) |
| Tomorrow | tomorrow |
| This week | from the day after tomorrow to the last day of this week |
| Next week | the seven days after that |
| Later | any later date |
| Someday | no `📅` and no `⏫` |
| Important, not urgent | no `📅`, with `⏫` |

- **Weeks** run Monday to Sunday unless `firstDayOfWeek` in `config.yaml` names another first day. "This week" starts the day after tomorrow, so on its last two days it is empty.
- **Older files** may have a `# Always` section above `# Tasks`, one `- text` per line. A tool turns each line into `- [ ] text ⏫` at the top of `# Tasks`, in order, and removes the section. Don't write new ones.
- **A `- [x]` line in `tasks.md`** (ticked in another editor) moves to `done.md` with its notes on the next sync. One with a `✅` date moves as it is. One without gets today's; if it repeats, the task also stays in `tasks.md` as `- [ ]` on its next date, with its notes.

### done.md

```markdown
- [x] Send the invoice ✅ 2026-10-16
- [x] Call the dentist ✅ 2026-10-16
    - ask about zirconia
- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19
```

- An append-only log, oldest first. A tool only appends to it and never rewrites existing lines. (The app's Undo takes back the block it just added.)
- An entry is a `- [x] … ✅ {date}` line plus the indented lines right under it (its notes). A blank or unindented line ends it.
- Each `- [x]` line with a valid `✅` date counts as one completion. Note lines are never counted.
- Any other line (free text, headings, a `- [x]` without `✅`) is kept and not counted.

### Completing a task

Nothing is lost: completing moves a task, it never deletes it. Only an explicit delete removes a task.

- **The done line** is `- [x] {title} ⏫ 🌱 🔁 {rule} ✅ {today}`. `⏫` only when the task is important, `🌱` (without its goal) only for a habit, `🔁 {rule}` only when it repeats. The `📅` date is not copied.
- **Notes** go under the done line, byte for byte as they were in `tasks.md`.
- **Not repeating:** remove the block from `tasks.md` and append the done line and its notes to `done.md`.
- **Repeating:** keep the block in `tasks.md` with its `📅` moved to the [next date](#next-date), and append the done line with a copy of the notes:

```markdown
# Tasks
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-12-01
    - transfer from savings
```

```markdown
- [x] Pay rent 🔁 every month on the 1st ✅ 2026-11-01
    - transfer from savings
```

- **`🔁` text that isn't a valid rule** may be a repeating task with a typo. Append the done line, but leave the task in `tasks.md` as it is, and tell the user.
- **Undo** moves the task back and removes its block from `done.md`.

### Habits

A habit is a repeating task with a finish line. After enough repetitions it counts as formed and leaves the list.

```markdown
# Tasks
- [ ] Meditate 10 min 🌱 🔁 every day 📅 2026-10-26
- [ ] Gym: strength 🌱 30 🔁 every week on Monday, Wednesday, Friday 📅 2026-10-28
```

- `🌱` needs a `🔁` rule other than `when done`. Without one it is only text in the title.
- Progress is never stored. It is worked out from `done.md`: completions with the habit's exact title and `🌱`, after its last formed or dropped line, one per period of the rule.
- Two more lines in `done.md` end a habit. They have no `✅` and are never counted as completions:

```markdown
- [x] Meditate 10 min 🌱 🔁 every day ✅ 2026-10-25
- [x] Read 20 pages 🌱 🏆 2026-10-26
- [-] Cold shower 🌱 ❌ 2026-07-20
```

  `🏆` is formed (written by the app when the count reaches the goal), `- [-] … ❌` is dropped.

The full rules, periods, misses and restarts are in [the habits spec](tasks/habits-spec.md).

### Repeat rules

| rule | meaning |
| --- | --- |
| `every day` | daily |
| `every weekday` | Monday to Friday |
| `every week on Monday, Thursday` | the named days, full English names, comma-separated |
| `every month on the 15th` | that day each month (1st, 2nd, 3rd ... 31st) |
| `every year` | same day each year |
| `every 3 days` | every N days |
| `every 2 weeks` | every N weeks |
| `every 2 weeks on Friday` | the named days every N weeks |
| `every 3 months` | every N months |
| `every 3 months on the 18th` | that day every N months |
| `every 3 days when done` | N days after the completion date |

N is a whole number from 1 to 999. Anything else is not a rule, and the text stays in the title.

#### Next date

The next date is the first date strictly after the completion date that fits the rule.

- Daily, weekday, weekly and every-N rules step forward from the due date. A due date in the future still moves at least one step.
- Monthly rules keep the same calendar day each month and never drift: the 31st falls on the last day of shorter months. Yearly keeps the due date's day, so 29 February falls on 28 February in other years.
- A monthly rule takes the first rule day after both the due date and the completion date, counting the due date's own month.
- `every N weeks on ...` counts weeks (Monday to Sunday) from the week holding the due date: only weeks 0, N, 2N ... count.
- `every N months` steps N calendar months from the due date. Once clamped to a short month it keeps the clamped day; use `every N months on the 31st` to stay on the month end.
- `every N months on the ...` works like the monthly rule, in months 0, N, 2N ... from the due date's month.
- `when done` is the completion date plus N days.
- With no `📅`, step from the completion date (`none` in the table).
- When a rule is added to a task, its `📅` stays if it fits the rule, else moves to the first fitting date on or after it (or today).

| rule | due | completed on | next |
| --- | --- | --- | --- |
| `every day` | 2026-10-13 | 2026-10-16 | 2026-10-17 |
| `every day` | 2026-10-20 | 2026-10-16 | 2026-10-21 |
| `every weekday` | 2026-10-16 | 2026-10-16 | 2026-10-19 |
| `every week on Monday, Thursday` | 2026-10-12 | 2026-10-14 | 2026-10-15 |
| `every 3 days` | 2026-10-10 | 2026-10-16 | 2026-10-19 |
| `every 2 weeks` | 2026-10-02 | 2026-10-16 | 2026-10-30 |
| `every month on the 15th` | 2026-10-05 | 2026-10-05 | 2026-10-15 |
| `every month on the 31st` | 2026-10-31 | 2026-10-31 | 2026-11-30 |
| `every year` | 2028-02-29 | 2028-02-29 | 2029-02-28 |
| `every 3 days when done` | 2026-10-01 | 2026-10-16 | 2026-10-19 |
| `every 2 weeks on Friday` | 2026-10-23 | 2026-10-30 | 2026-11-06 |
| `every 3 months` | 2026-08-31 | 2026-12-01 | 2027-02-28 |
| `every 3 months on the 18th` | 2026-10-05 | 2026-10-05 | 2026-10-18 |
| `every 2 weeks on Friday` | none | 2026-10-24 | 2026-10-30 |

### config.yaml

YAML with only the settings that differ from the defaults. A tool keeps the user's comments and other keys, adds only the keys it changes, and removes a key set back to its default. A file that doesn't read, or has an unknown key or value, makes the app fall back to all defaults and say so.

| key | values (default first) |
| --- | --- |
| `defaultView` | `list`, `board` |
| `firstDayOfWeek` | `monday` ... `sunday` |
| `foldedOnOpen` | list of `today`, `tomorrow`, `week`, `next`, `later`, `someday` (default `[later, someday]`); `overdue`, from older files, is accepted and ignored |
| `theme` | `system`, `light`, `dark` |
| `dateLabels` | `short` (Thu, 12 Nov), `iso` |
| `newTaskBucket` | `today`, `tomorrow`, `week`, `next`, `someday` |
| `saveDelaySeconds` | a number, 0 or more (default 1) |
| `habits` | `maxInProgress` (0–99, default 3, 0 = no limit), `goal` (1–999, default 66), `missesInARow` (0–99, default 1), `missesPerAttempt` (0–999, or `0%`–`100%` of the goal; default `10%`) |
| `shortcuts` | a map of command to a key or a list of keys (`KeyboardEvent.key` names); a key binds to one command only |

The shortcut commands, with their default keys:

| command | default keys |
| --- | --- |
| `focusAdd` | `/`, `n` |
| `down` | `j`, `ArrowDown` |
| `up` | `k`, `ArrowUp` |
| `today` | `t` |
| `tomorrow` | `m` |
| `thisWeek` | `w` |
| `nextWeek` | `e` |
| `pickDate` | `d` |
| `someday` | `s` |
| `repeat` | `r` |
| `important` | `i` |
| `habit` | `h` |
| `complete` | `x` |
| `edit` | `Enter` |
| `delete` | `Delete`, `Backspace` |
| `deselect` | `Escape` |
| `undo` | `z` |
| `switchView` | `v` |
| `search` | `f` |
| `settings` | `,` |

`tomorrow`, `important`, `habit` and `settings` give way to a key the file binds to another command.

### What a tool must keep

- Every line it doesn't understand, byte for byte: text above `# Tasks`, free text, headings, other emoji and `#tags`.
- Note lines exactly as written, in `tasks.md` and when copied to `done.md`.
- Line order, and the existing lines of `done.md`.
- The other Obsidian Tasks signs, as text in the title.

### Obsidian Tasks compatibility

The format is a subset of the [Obsidian Tasks](https://publish.obsidian.md/tasks/) emoji format, plus two habit signs.

| Sign | Omark Tasks |
|---|---|
| `- [ ]`, `- [x]` | understood |
| `📅` due, `✅` done, `🔁` repeat | understood (repeat with the wording above) |
| `⏫` high priority | understood, as Important |
| `- [-]` cancelled, `❌` cancelled date | understood only on a dropped habit's line in `done.md`; kept elsewhere |
| `🔺` `🔼` `🔽` `⏬` priorities, `⏳` scheduled, `🛫` start, `➕` created, `🆔` id, `⛔` depends on, `🏁` on completion | kept as text in the title |
| `🌱` habit, `🏆` formed | Omark's own |

### Changing the format

- The version is `major.minor`. A minor version adds something old readers can keep as text. A major version changes what existing lines mean.
- A change is proposed as an issue labelled `format`. It is always `size:large`: it needs a plan and a maintainer's approval before any code.
- The change updates this page, its tests and the `taskapp-files` skill in the same PR.

## Omark Time

Omark Time reads calendar events whose titles follow one format and writes their hours to CSV files. The calendar is the source of truth: the event files can always be rebuilt from it. The full behaviour is in [the Omark Time spec](time/spec.md); this part is what another tool or an agent needs to read and write compatible data.

### The title format

```
CODE; Category; description
```

- **CODE** is required: 2–20 characters, letters `A–Z`, digits `0–9` and `_`, starting with a letter. It is case-insensitive in titles and stored in upper case everywhere else.
- **Category** is optional free text, such as `Coding`, `CS` or `Meetings`.
- **description** is optional free text.
- Spaces around `;` are optional and trimmed. Only the first two `;` split the title; later ones stay in the description.
- An event is **structured** when its first part is a valid code and either the title has a `;` or the whole title is a known code (one in `projects.csv`). Other events are ignored.
- A structured event's code is **known** when it is in `projects.csv`, archived or not. Unknown codes are still tracked, with `known` = `false`, so they can be fixed.

How titles read when `ACME` is the only project:

| title | code | category | description | known |
| --- | --- | --- | --- | --- |
| `ACME; Coding; new featureX` | ACME | Coding | new featureX | yes |
| `ACME;Coding` | ACME | Coding | (none) | yes |
| `ACME; ; quick call` | ACME | (none) | quick call | yes |
| `ACME; CS; ticket 12; then 13` | ACME | CS | ticket 12; then 13 | yes |
| `acme; coding; new featureX` | ACME | coding | new featureX | yes |
| `acme` | ACME | (none) | (none) | yes |
| `OOO; away` | OOO | away | (none) | no |
| `Lunch; with Tom` | LUNCH | with Tom | (none) | no |
| `Lunch` | not structured | | | |
| `Call: John` | not structured | | | |
| `Q&A; prep` | not structured | | | |

A writer puts one space after each `;` and leaves out empty trailing parts: `ACME`, `ACME; Coding`, `ACME; Coding; new feature`.

### What counts

- Every structured event in the chosen calendars that starts between `track_from` and 90 days from today.
- Declined and cancelled events never count. Events shown as free and unanswered invites do.
- **Time zone:** dates and times are in the primary calendar's time zone.
- **Midnight:** an event that crosses midnight becomes one row per local day.
- **All-day events** count `all_day_hours` per day.
- **Overlaps** each count fully.
- **Done and planned:** a row whose `end` is at or before now is done; later rows are planned. Summaries and reports count only done time unless asked.

### Files

The files sit in `time/` in the Omark folder, and `projects.csv` at its top. (The standalone Omark Time build kept them all in one folder: `Omark Time` in My Drive, `Apps/Omark Time` in OneDrive, or a folder the user picks.)

- **CSV** follows RFC 4180: comma-separated, with a header row. A field is in double quotes when it holds `,`, `"` or a line break, with `""` for a quote inside.
- **Encoding.** UTF-8, written with LF line endings and a final newline. A reader accepts CRLF and a BOM.
- **Unknown columns and keys** are kept.

#### `events-YYYY.csv`

One row per tracked event per local day, in the file of that day's year. [doc/time/examples/events-2026.csv](time/examples/events-2026.csv) is a full example.

```csv
date,start,end,hours,project,category,description,all_day,known,calendar,event_id
2026-10-22,2026-10-22T09:00+02:00,2026-10-22T10:30+02:00,1.5,ACME,Coding,new featureX,false,true,primary,abc123
2026-10-22,2026-10-22T11:00+02:00,2026-10-22T11:30+02:00,0.5,OOO,away,,false,false,primary,def456
```

| column | value |
| --- | --- |
| `date` | the row's local day, `YYYY-MM-DD` |
| `start`, `end` | the row's own part of the event, local time with offset (`2026-10-22T09:00+02:00`; seconds only when not zero). All-day rows run from 00:00 to the next day's 00:00 |
| `hours` | the exact length, at most 4 decimals, no trailing zeros (`1.5`, `0.3333`, `8`); for all-day rows, `all_day_hours` |
| `project` | the code, upper case |
| `category`, `description` | as typed in the title; empty when missing |
| `all_day`, `known` | `true` or `false` |
| `calendar` | the Google calendar id (`primary` for the primary calendar) |
| `event_id` | the event's id; each instance of a recurring event has its own |

- A row's key is `calendar` + `event_id` + `date`.
- Rows are sorted by `start` (as an instant), then `calendar`, then `event_id`, then `date`.
- **The app owns these files.** It rewrites them from the calendar on every sync, so hand edits are lost. Change the calendar event instead.
- The column order is fixed. New columns are only added at the end.
- **Adding up hours:** turn each row's `hours` into whole seconds (`round(hours × 3600)`), add the seconds, and convert back once. Adding the 4-decimal values directly drifts (three 20-minute rows would make 0.9999 hours).

#### `projects.csv`

```csv
code,description,client,rate,currency,archived
ACME,Acme Corp website rebuild,Acme Corp,120,EUR,
MYAPP,My app - product work,,,,
OLD,Old client,Old Co,90,PLN,2026-06-30
```

| column | value |
| --- | --- |
| `code` | as in the title format, upper case, unique |
| `description` | free text |
| `client` | free text, optional; groups projects in reports |
| `rate` | a decimal per hour, optional |
| `currency` | an ISO 4217 code, required when `rate` is set |
| `archived` | a date, or empty. An archived project is still known (its events stay counted) but is no longer offered for new events |

Codes are never renamed: that would make past events unknown. Archive the old project and add a new one.

A reader trims every cell and reads `code` and `currency` in upper case. If a code appears twice, the first row counts. A project with a `rate` but no `currency` has no amount in reports.

#### `config.yaml`

```yaml
calendars: [primary]   # Google calendar ids to read
track_from: 2026-01-01 # first day that counts
all_day_hours: 8
week_start: monday
colour_events: false  # set by the "Colour my events" setting
```

| key | meaning | default |
| --- | --- | --- |
| `calendars` | the Google calendar ids to read | `[primary]` |
| `track_from` | the first day that counts | 1 January of this year |
| `all_day_hours` | hours an all-day event counts for, 0.25 to 24 | `8` |
| `week_start` | the first day of the week, for weekly summaries | `monday` |
| `colour_events` | colour structured events green (known) or red (unknown) in the calendar | `false` |

### Colours

With `colour_events` on, the app sets a structured event's colour to green (Google's "Basil", colour id 10) for a known code and red ("Tomato", 11) for an unknown one. It checks the ids against Google's colour list at run time, and marks each event it colours with the private extended property `omarkTime` = `green` or `red`. It changes no other field. A tool that creates events doesn't need to set colours; the app does it on its next sync.

## Omark Goals

Life areas, the vision for each and dated goals, in one Markdown file, `goals/goals.md`, linked down to Tasks and Time by tags. The design is in [the Goals spec](goals/spec.md).

### goals.md

```markdown
# Vision

I feel happy, fulfilled and peaceful.

## Climbing #climbing

![Climbing](images/climbing.jpg)

Trips across the world to climb in interesting places.

- [ ] Redpoint 8b 📅 2027-10-31 ➕ 2026-10-28
- [ ] Two climbing trips abroad #CLIMB 📅 2027-12-31 ➕ 2026-10-28
- [x] Onsight 7c+ 📅 2026-09-30 ➕ 2025-11-02 ✅ 2026-08-14

## Not now

- New client projects that need an office
```

- **The vision line**: the text under the first `#` heading, up to the next heading of any level (or the first `##`). Optional. Front matter before it is skipped.
- **An area**: a `##` heading other than `## Not now`, written `## {name} #{tag}`.
  - The tag is the area's key: lower case letters, digits and `-`, made from the name when the area is created and never changed. Renaming changes only the name.
  - A tag can't equal a project code, ignoring case.
  - A heading without a tag is still an area. Its goals, and the codes on them, still link to it; tasks and habits can only once it has a tag, which the app adds on the area's first edit.
  - Areas show in file order.
- **The picture**: the first line in the area, before its first goal, that is only a Markdown image (`![alt](images/x.jpg)`), with a path relative to `goals.md`. Optional.
- **The vision text**: the area's other text before its first goal, on one line. Optional.
- **A goal**: a top-level `- [ ]` (open) or `- [x]` (achieved) line in an area. Its signs:
  - `📅` the target date;
  - `➕` the date it was set;
  - `✅` the date it was achieved (read on `- [x]` lines only);
  - `✏️` the date its text, date or project last changed;
  - at most one project code: the last upper-case `#TAG` on the line. It links only when it is a code in `projects.csv` (when that file can be read).

  The last valid date after a sign wins. The rest of the line is the goal's text, its other tags and emoji included.
- **A goal as the app writes it**: `- [ ] {text} #{CODE} ✏️ {date} 📅 {due} ➕ {set} ✅ {done}`. `✏️` comes before `📅` because Obsidian Tasks reads its signs from the line's end and stops at one it doesn't know. An Obsidian block id (`^id`) stays at the end.
- **`## Not now`**: plain list lines (`-`, `*` or `+`). Nothing links to them.
- **Encoding**: UTF-8, LF line endings, one final newline. A reader accepts a BOM and CRLF.

### What a tool must keep in goals.md

Every line it doesn't change, byte for byte: other text and headings, comments, notes under goals, front matter, line order, and achieved goals, which stay in place with their `✅`.
- A tool that adds a goal writes `➕` today.
- One that changes a goal's text, date or project writes `✏️` today.
- One that ticks a goal writes `✅` today.
- Area tags are never changed.

### Links and Needs update

- **What links to an area**:
  - its goals, and the project codes on them;
  - tasks and habits (in `tasks.md` and `done.md`) tagged with the area's tag or a linked code;
  - hours in `events-*.csv` on a linked code.

  Tags match ignoring case. A code on goals in two areas links to both.
- **An area's last activity** is the latest of these dates, up to today:
  - a goal's `➕`, `✏️` or achieved `✅`;
  - a completion's `✅` in `done.md` (habit completions too);
  - a row's `date` in `events-*.csv` with `known` = `true`.
- **Needs update**: a linked area whose last activity is older than `stale_after` months (a date exactly that old is not). An area with nothing linked shows a hint instead, never Needs update, and so does one with no dated activity yet.

### Goals' config.yaml

`goals/config.yaml`; unknown keys are kept.

| Key | What | Default |
| --- | --- | --- |
| `stale_after` | months without linked activity before Needs update, 1 to 24 | `3` |

### Goals in Obsidian

Goal lines use the Obsidian Tasks signs, so a vault that holds the Omark folder sees them in Obsidian Tasks queries. To leave them out, add `path does not include goals/` to the queries, or set a global filter that `goals.md` doesn't match.
