---
name: taskapp-files
description: Use when reading or editing TaskApp's tasks.md, done.md or config.yaml
---

# TaskApp files

Three UTF-8 files, LF line endings, in the user's Omark Tasks folder: `tasks.md`, `done.md`, `config.yaml`. The folder is the app's folder in OneDrive (`Apps/Omark Tasks`), a folder in Google Drive (`My Drive/Omark Tasks`), or a local folder the user picked; ask where it is if you don't know. The app re-reads the files on every sync, so edit them exactly as the app would.

This skill holds the editing rules. The format itself, as an open standard, is `doc/format.md` in the Omark repository (https://github.com/omark-app/omark); where the two differ, the format wins.

## Edit rules

- Change only the lines the request touches. Leave every other byte as it is: other headings, free text, other emoji fields, odd spacing, order.
- Never add IDs, markers or metadata. A task is identified by its text.
- Append new tasks at the end of the `# Tasks` section.
- Finish every file with one newline.
- Existing files may carry a BOM or CRLF line endings; the app tolerates both but writes UTF-8 without BOM and with LF. Keep LF and never add a BOM.
- "Today" is today's local date (system clock, or the date given in the conversation), never UTC.

## tasks.md

```markdown
# Tasks
- [ ] Inbox zero by Friday ⏫
- [ ] Notice when I interrupt people ⏫
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-11-01
    - transfer from savings
- [ ] Call the dentist 📅 2026-10-19
- [ ] Call the bank ⏫ 📅 2026-10-20
- [ ] Learn Rust
```

- `# Tasks` holds task blocks. Anything above it is kept as it is. A block is the task line plus the indented lines under it (its notes).
- Task line: `- [ ] {title} ⏫ 🌱 🔁 {rule} 📅 {date}`. `⏫`, `🌱`, `🔁` and `📅` are each optional (`🌱` makes a habit, see Habits below); no date means Someday, or **Important, not urgent** when the task has `⏫`.
- `⏫` marks the task Important (Obsidian Tasks' high priority); TaskApp shows it in amber, first in its bucket. To flag a task, add ` ⏫` right after the title; to unflag it, remove it. The other priority signs (`🔺 🔼 🔽 ⏬`) are only text to TaskApp.
- **Important, not urgent** (Eisenhower's important-but-not-urgent box) is every open task with `⏫` and no `📅`: things that matter but nothing forces, and reminders of how to act or what to notice. Their order is the line order; to reorder them, move the lines. To add one, append `- [ ] {title} ⏫`.
- Older files have a `# Always` section above `# Tasks` (one `- text` per line). Don't add one. TaskApp turns each of its lines into `- [ ] text ⏫` at the top of `# Tasks` on its next sync and removes the section.
- Dates are `YYYY-MM-DD`, local time.
- Notes: `    - {note}` (four spaces).
- A `🔁` rule TaskApp can't parse stays in the title and the task counts as non-repeating, but completing it never deletes it: the app logs the done line and keeps the task as it is (see Completing a task). Use only the wording below.
- A `- [x]` line in `tasks.md` moves to `done.md` on the next sync, with its note lines. One with a `✅` date moves as it is. One without gets today's `✅`; if it repeats, the app also keeps the task in place as `- [ ]` on its next date (notes stay with it, and `done.md` gets a copy). Leave such lines for the app unless asked to complete the task, and then complete it as below instead of ticking it.

## Habits

A habit is a repeating task with a finish line: after enough repetitions it counts as formed and leaves the list.

```markdown
# Tasks
- [ ] Meditate 10 min 🌱 🔁 every day 📅 2026-10-26
- [ ] Gym: strength 🌱 30 🔁 every week on Monday, Wednesday, Friday 📅 2026-10-28
- [ ] No phone before 9:00 ⏫ 🌱 🔁 every day 📅 2026-10-27
```

- `🌱` marks a habit. A whole number from 1 to 999 right after it (`🌱 30`) is its own goal; with no number the goal comes from `habits.goal` in `config.yaml` (default 66). Write it after `⏫` and before `🔁`.
- A habit needs a `🔁` rule other than `when done`. A `🌱` on a task with no rule, or with a `when done` rule, is only text in the title.
- **At most `habits.maxInProgress` open `🌱` tasks** (default 3, `0` = no limit; count them in `tasks.md`). At the limit, don't add another `🌱`: tell the user the limit is reached and that one must be formed or dropped first, or the limit raised. Never remove or change an existing `🌱` to make room.
- Complete a habit like any repeating task (below): the done line keeps `🌱` but not the goal number. Do it once per period: if it is already done in today's period, say so and write nothing.
- Never write a formed line (`🏆`) yourself. The app writes it when the count reaches the goal, on its next sync.
- To drop a habit, delete its block from `tasks.md` and append `- [-] {title} 🌱 ❌ {today}` to `done.md`. To make it an ordinary task, remove `🌱` and leave the rest.
- Renaming a habit restarts its count, because progress is found by title. Ask before renaming one.

### How is my habit going?

Progress is never stored. Work it out from the habit's rule and `done.md`:

- Count only completions with the habit's exact title and `🌱` that come after the last `🏆` or `❌` line with the same title.
- Each date of the `🔁` rule opens a **period** that lasts until the day before the next rule date (`every day`: one day; `every week on Monday, Wednesday, Friday`: Mon-Tue, Wed-Thu, Fri-Sun). Rules that stride (`every 3 days`, `every 2 weeks`, `every 3 months` ...) count their strides from the first counted completion.
- Walk the periods from the one holding the first counted completion up to today. A period with at least one completion is one repetition (two in a period count once). A period that ended with none is a miss. Today's period, not done yet, is pending, not a miss.
- **Restart**: more misses in a row than `habits.missesInARow` (default 1), or more misses in the attempt than `habits.missesPerAttempt` (default 10% of the goal, rounded down: 6 for 66). The count goes back to 0 and the next completion starts a new attempt; periods before it are not misses. Keep the best count of the earlier attempts.
- Formed when the count reaches the goal.

Example, `every day`, goal 66, completions on 1 and 2 Oct: on 3 Oct it is 2/66 and pending. On 4 Oct it is still 2/66, 3 Oct was missed, and today is the last chance (one more miss restarts). On 5 Oct it has restarted: 0/66, best 2. With 1, 2 and 4 Oct done it is 3/66 on 4 Oct, with one miss.

A formed or dropped habit leaves two kinds of line in `done.md` (see below); the count starts again from 0 if the same title is added later.

## Repeat wording

| write | meaning |
| --- | --- |
| `every day` | daily |
| `every weekday` | Monday to Friday |
| `every week on Monday, Thursday` | the named days, full English names, comma-separated |
| `every month on the 15th` | that day each month (1st, 2nd, 3rd, 4th ... 31st) |
| `every year` | same day each year |
| `every 3 days` | every N days (`every 1 day` also valid) |
| `every 2 weeks` | every N weeks |
| `every 2 weeks on Friday` | the named days every N weeks (`every 2 weeks on Monday, Thursday` too) |
| `every 3 months` | every N months (`every 1 month` also valid) |
| `every 3 months on the 18th` | that day every N months |
| `every 3 days when done` | N days after the completion date |

N is a whole number from 1 to 999. A larger N is not a rule: the text stays in the title.

## Completing a task

Nothing is lost: a completed task's notes always go to `done.md` with it.

The done line is `- [x] {title} ⏫ 🌱 🔁 {rule} ✅ {today}`. The `⏫` part appears only when the task is important, the `🌱` part only when it is a habit (without its goal number), the `🔁 {rule}` part only when it repeats. The `📅` date never goes to `done.md`. Under it come the task's note lines, byte for byte as they are in `tasks.md` (same indent, marker and spacing); no notes, no extra lines.

Non-repeating: delete the whole block (line and notes) from `tasks.md`, then append the done line to the end of `done.md` with the task's note lines right under it.

Has `🔁` text that isn't a valid rule: it may be a repeating task with a typo, so do what the app does. Append the done line and its notes to `done.md`, leave the block in `tasks.md` as it is, and tell the user the rule can't be read (fix the wording below, or delete the task).

```markdown
- [x] Call the dentist ✅ 2026-10-19
    - ask about zirconia
```

Repeating: keep the block, notes included, in `tasks.md` (the sample shows the whole file), set its `📅` to the next date (below), and append the done line with the rule and a copy of the note lines.

```markdown
# Tasks
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-12-01
    - transfer from savings
```

```markdown
- [x] Pay rent 🔁 every month on the 1st ✅ 2026-11-01
    - transfer from savings
```

## done.md

`done.md` is an append-only log, oldest first. Never rewrite its existing lines.

```markdown
- [x] Meditate 10 min 🌱 🔁 every day ✅ 2026-10-25
- [x] Read 20 pages 🌱 🏆 2026-10-26
- [-] Cold shower 🌱 ❌ 2026-07-20
```

- An entry is a `- [x] … ✅ {date}` line plus the indented lines right under it (its notes). A blank or unindented line ends the entry.
- Each `- [x]` line with a valid `✅` date counts as one completion. Indented lines are never counted.
- Two more habit lines are boundaries, not completions (no `✅`, never counted): `- [x] {title} 🌱 🏆 {date}` (formed, written by the app, sometimes with the habit's notes indented under it) and `- [-] {title} 🌱 ❌ {date}` (dropped). Leave them as they are.
- Older entries are a single line with no notes; leave them so. Leave any other line (free text, headings, a `- [x]` without `✅`) as it is.
- Append new entries at the end, keeping each entry's notes directly under its own line.

## Next date

The next date is the first date strictly after the completion date that fits the rule.

- Day, weekday, weekly and every-N rules step forward from the due date and take the first date after the completion date that fits. `every day` steps 1 day, `every N days` N days, `every N weeks` N weeks, and `every weekday` and `every week on ...` step day by day to the next matching weekday. A due date in the future still moves at least one step.
- Monthly rules (`every month on the ...`) use the same calendar day each month, never drifting: the 31st falls on the last day of shorter months. Yearly uses the due date's day, so 29 Feb falls on 28 Feb in other years.
- A monthly rule takes the first rule day after both the due date and the completion date, counting the due date's own month: a "15th" task moved to the 5th and completed then goes to the 15th of that month. Yearly always moves at least one year on.
- `every N weeks on ...` counts weeks (Monday to Sunday) from the week holding the due date: only weeks 0, N, 2N, ... count, and it takes the first named day after both the due date and the completion date, counting the rest of the due date's own week.
- `every N months` steps N calendar months from the due date, on the due date's day (the 31st falls on the last day of shorter months), until the date is after the completion date. Like `every year`, it steps from the current `📅`, so once clamped it keeps the clamped day: `every 1 month` goes 31 Jan, 28 Feb, 28 Mar. Use `every N months on the 31st` to stay on the month end.
- `every N months on the ...` works like the monthly rule, but only in months 0, N, 2N, ... counted from the due date's month.
- `when done` is the completion date plus N days; the due date is ignored.
- With no `📅`, step from the completion date. For `every N weeks on ...` and `every N months on the ...`, take the first named day (or rule day) after the completion date. When the completion date is itself a named day, it counts as this cycle's occurrence: take the next named day in the same week, else the first named day N weeks (or months) on. In the table below, `none` means no `📅`.
- When you add or change a `🔁` rule, keep the `📅` if it falls on the rule's days, else move it to the first such date on or after it (or on or after today when there is none). N doesn't matter here: `every 2 weeks on Friday` added on Saturday 2026-10-17 gives `📅 2026-10-23`, and the N-week cycle counts from that date.

| rule | due | completed on | next |
| --- | --- | --- | --- |
| `every day` | 2026-10-13 | 2026-10-16 | 2026-10-17 |
| `every day` | 2026-10-20 | 2026-10-16 | 2026-10-21 |
| `every weekday` | 2026-10-16 | 2026-10-16 | 2026-10-19 |
| `every week on Monday, Thursday` | 2026-10-12 | 2026-10-14 | 2026-10-15 |
| `every 3 days` | 2026-10-10 | 2026-10-16 | 2026-10-19 |
| `every 2 weeks` | 2026-10-02 | 2026-10-16 | 2026-10-30 |
| `every month on the 15th` | 2025-01-15 | 2026-10-16 | 2026-11-15 |
| `every month on the 15th` | 2026-10-05 | 2026-10-05 | 2026-10-15 |
| `every month on the 15th` | 2026-10-15 | 2026-10-12 | 2026-11-15 |
| `every month on the 31st` | 2026-10-17 | 2026-10-17 | 2026-10-31 |
| `every month on the 31st` | 2026-10-31 | 2026-10-31 | 2026-11-30 |
| `every month on the 31st` | 2026-11-30 | 2026-11-30 | 2026-12-31 |
| `every year` | 2028-02-29 | 2028-02-29 | 2029-02-28 |
| `every 3 days when done` | 2026-10-01 | 2026-10-16 | 2026-10-19 |
| `every 2 weeks on Friday` | 2026-10-23 | 2026-10-23 | 2026-11-06 |
| `every 2 weeks on Friday` | 2026-10-23 | 2026-10-30 | 2026-11-06 |
| `every 2 weeks on Monday, Thursday` | 2026-10-19 | 2026-10-19 | 2026-10-22 |
| `every 2 weeks on Monday, Thursday` | 2026-10-22 | 2026-10-22 | 2026-11-02 |
| `every 3 months` | 2026-10-17 | 2026-10-17 | 2027-01-17 |
| `every 3 months` | 2026-08-31 | 2026-12-01 | 2027-02-28 |
| `every 3 months on the 18th` | 2026-10-18 | 2026-10-18 | 2027-01-18 |
| `every 3 months on the 18th` | 2026-10-05 | 2026-10-05 | 2026-10-18 |
| `every 2 months on the 31st` | 2026-12-31 | 2026-12-31 | 2027-02-28 |
| `every 1 month` | 2027-02-28 | 2027-02-28 | 2027-03-28 |
| `every 2 weeks on Friday` | none | 2026-10-24 | 2026-10-30 |
| `every 2 weeks on Friday` | none | 2026-10-23 | 2026-11-06 |
| `every 2 weeks on Monday, Thursday` | none | 2026-10-19 | 2026-10-22 |
| `every 2 weeks on Monday, Thursday` | none | 2026-10-22 | 2026-11-02 |
| `every 3 months on the 5th` | none | 2026-10-16 | 2026-11-05 |

## Moving a task to a bucket

Set the task's `📅` (leave the line's position alone) to:

| bucket | date |
| --- | --- |
| Today | today (also holds overdue tasks) |
| Tomorrow | tomorrow |
| This week | the last day of the current week |
| Next week | the last day of next week (7 days after that) |
| Later | any date after the last day of next week |
| Someday | no `📅` at all, and no `⏫` |
| Important, not urgent | no `📅`, with `⏫` |

Weeks run Monday to Sunday unless `firstDayOfWeek` in `config.yaml` names another first day (the week then ends the day before it).

"This week" starts the day after tomorrow, so on its last two days it is empty: use Tomorrow or Today. Overdue tasks (a `📅` before today) show in Today, above today's tasks (important ones first); there is no separate Overdue bucket.

## config.yaml

YAML with only the settings that differ from the defaults. Keep its comments. The app's Settings page (footer gear, or `,`) writes this file too, and does the same: it adds only the keys that differ from the defaults, removes a key set back to its default, and keeps comments. Do likewise: add only the keys you need and leave the rest byte for byte. A mistake makes the app show a banner and fall back to all defaults, so change one key at a time, use only the values below, and keep the YAML valid. Unknown keys are errors too.

| key | values (default first) |
| --- | --- |
| `defaultView` | `list`, `board` |
| `firstDayOfWeek` | day name: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday` |
| `foldedOnOpen` | list of `today`, `tomorrow`, `week`, `next`, `later`, `someday` (default `[later, someday]`); empty buckets start folded anyway. `overdue` from older configs is still accepted and ignored |
| `theme` | `system`, `light`, `dark` |
| `dateLabels` | `short` (Thu, 12 Nov), `iso` |
| `newTaskBucket` | `today`, `tomorrow`, `week`, `next`, `someday` |
| `saveDelaySeconds` | number, 0 or more (default 1) |
| `habits` | map with `maxInProgress` (whole number 0-99, default 3, 0 = no limit), `goal` (1-999, default 66), `missesInARow` (0-99, default 1), `missesPerAttempt` (whole number 0-999, or a percentage `0%`-`100%` of the goal; default `10%`) |
| `shortcuts` | map of command to a key or list of keys (`KeyboardEvent.key` names); a key binds to one command only. Commands: focusAdd, down, up, today, tomorrow, thisWeek, nextWeek, pickDate, someday, repeat, important, habit (default `h`), complete, edit, delete, deselect, undo, switchView, search, settings (default `,`; like `tomorrow`, `important` and `habit` it gives way to a key the file binds to another command) |
