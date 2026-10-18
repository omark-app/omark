---
name: taskapp-files
description: Use when reading or editing TaskApp's tasks.md, done.md or config.yaml
---

# TaskApp files

Three UTF-8 files, LF line endings, in `C:\Users\alipk\OneDrive\ALAI\TaskApp\`: `tasks.md`, `done.md`, `config.yaml`. TaskApp re-reads them on every sync, so edit them exactly as the app would.

## Edit rules

- Change only the lines the request touches. Leave every other byte as it is: other headings, free text, other emoji fields, odd spacing, order.
- Never add IDs, markers or metadata. A task is identified by its text.
- Append new tasks at the end of the `# Tasks` section.
- Finish every file with one newline.
- Existing files may carry a BOM or CRLF line endings; the app tolerates both but writes UTF-8 without BOM and with LF. Keep LF and never add a BOM.
- "Today" is today's local date (system clock, or the date given in the conversation), never UTC.

## tasks.md

```markdown
# Always

- Inbox zero by Friday
- Drink water

# Tasks

- [ ] Pay rent 🔁 every month on the 1st 📅 2026-11-01
    - transfer from savings
- [ ] Call the dentist 📅 2026-10-19
- [ ] Learn Rust
```

- `# Always` lists reminders, one `- text` per line. They have no dates.
- `# Tasks` holds task blocks. A block is the task line plus the indented lines under it (its notes).
- Task line: `- [ ] {title} 🔁 {rule} 📅 {date}`. `🔁` and `📅` are each optional; no date means Someday.
- Dates are `YYYY-MM-DD`, local time.
- Notes: `    - {note}` (four spaces).
- A `🔁` rule TaskApp can't parse stays in the title and the task counts as non-repeating. Use only the wording below.
- A `- [x]` line in `tasks.md` moves to `done.md` on the next sync. One with a `✅` date moves as it is. One without gets today's `✅`; if it repeats, the app also keeps the task in place as `- [ ]` on its next date (notes stay with it). Leave such lines for the app unless asked to complete the task, and then complete it as below instead of ticking it.

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

The done line is `- [x] {title} 🔁 {rule} ✅ {today}`. The `🔁 {rule}` part appears only when the task repeats. The `📅` date never goes to `done.md`.

Non-repeating: delete the whole block (line and notes) from `tasks.md`, then append the done line to the end of `done.md` with the task's note lines, exactly as they were, right under it. Indented lines in `done.md` are not counted as completions.

```markdown
- [x] Call the dentist ✅ 2026-10-19
    - ask about zirconia
```

Repeating: keep the block, notes included, in `tasks.md` (the sample shows the whole file), set its `📅` to the next date (below), and append the done line with the rule. The notes are not copied to `done.md`.

```markdown
# Always

# Tasks
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-12-01
    - transfer from savings
```

```markdown
- [x] Pay rent 🔁 every month on the 1st ✅ 2026-11-01
```

`done.md` is an append-only log, oldest first. Never rewrite its existing lines.

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
| Today | today |
| This week | the last day of the current week |
| Next week | the last day of next week (7 days after that) |
| Later | any date after the last day of next week |
| Someday | no `📅` at all |

Weeks run Monday to Sunday unless `firstDayOfWeek` in `config.yaml` names another first day (the week then ends the day before it).

On the last day of the week "This week" is empty (today is already that date): use Today. Overdue tasks (a `📅` before today) show in their own Overdue bucket above Today; nothing is ever moved to Overdue on purpose.

## config.yaml

YAML with only the settings that differ from the defaults. Keep its comments. A mistake makes the app show a banner and fall back to all defaults, so change one key at a time, use only the values below, and keep the YAML valid. Unknown keys are errors too.

| key | values (default first) |
| --- | --- |
| `defaultView` | `list`, `board` |
| `firstDayOfWeek` | day name: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday` |
| `foldedOnOpen` | list of `overdue`, `today`, `week`, `next`, `later`, `someday` (default `[later, someday]`); empty buckets start folded anyway |
| `theme` | `system`, `light`, `dark` |
| `dateLabels` | `short` (Thu, 12 Nov), `iso` |
| `newTaskBucket` | `today`, `week`, `next`, `someday` |
| `saveDelaySeconds` | number, 0 or more (default 1) |
| `shortcuts` | map of command to a key or list of keys (`KeyboardEvent.key` names); a key binds to one command only. Commands: focusAdd, down, up, today, thisWeek, nextWeek, pickDate, someday, repeat, complete, edit, delete, deselect, undo, switchView |
