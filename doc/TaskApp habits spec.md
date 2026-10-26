# TaskApp habits spec

Status: approved by AL, 2026-10-26. Issue #44. Changed before approval (AL): at most 3 habits in progress (section 10.1). The calls in section 13 are accepted.
Source: AL's brainstorm in the session of 2026-10-26. Related: [v1 spec](TaskApp%20v1%20spec.md) (sections 3, 5–7 and 10 change), [settings page spec](Omark%20settings%20page%20spec.md) (#45).
Mockups: https://claude.ai/artifact/VwN7ULDERA3tsd2JoMatWt (desktop, phone, row states, detail, history, settings); source in `doc/mockups/habits/`.

Calls marked *(my call)* were made by Claude, not by AL; section 13 lists them for checking.

## 1. Intent

A habit is a repeating task with a finish line. You do it again and again; after enough repetitions without breaking the miss rules it counts as **formed** and leaves the list. Break a rule and the count starts again.

Habits are the most important thing on the page, so they get their own colour and show their progress where you work: in the buckets, in a Habits group, and in the task detail.

It builds on what Important, not urgent started (v1 spec 7: "a habit-building machine as much as a to-do list"), but with a count and an end.

## 2. How many repetitions

The goal is a setting, but the default matters, because reaching it removes the task: too low and the scaffold goes before the habit holds.

- **21 days** comes from Maxwell Maltz's *Psycho-Cybernetics* (1960): "a minimum of about 21 days" for patients to get used to a change. It was never a measured habit-forming time.
- **Lally et al. (2010)**, the study usually cited: 96 people, one daily behaviour each, 12 weeks. The median time to reach 95% of their own automaticity plateau was **66 days**, with a range of **18 to 254 days**. Simple behaviours (a glass of water) were quicker than effortful ones (50 sit-ups). Missing a single day did not measurably set people back.
- So: the default goal is **66 repetitions**, each habit can set its own (`🌱 30` for an easy one or a weekly one), and **one miss in a row is allowed** by default ("never miss twice").

| Setting | Default | Why |
|---|---|---|
| Goal | 66 repetitions | Lally's median. Lower it per habit for easy or weekly ones. |
| Misses in a row | 1 | One miss doesn't hurt (Lally); two in a row is where habits break. |
| Misses per attempt | 10% of the goal, rounded down (6 for 66) | Keeps the bar the same for a 30-goal and a 66-goal habit. *(My call: AL left the number open.)* |
| Habits in progress at most | 3 | AL's call. Each habit costs daily attention; too many at once and they all slip. |

## 3. Decisions

| Topic | Decision |
|---|---|
| Marker | `🌱` in the task line, with an optional goal: `🌱` or `🌱 30`. Shortcut word `hab` / `habit`; key `h`. |
| Needs a repeat | A habit is a repeating task. Any 🔁 rule except `when done` (it has no fixed dates, so no misses). |
| Progress | **Worked out from `done.md`**, never stored. Nothing else to keep in step across devices, Obsidian or Claude. *(My call.)* |
| Periods | Each date of the rule opens a period that lasts until the next date of the rule. Done at least once in the period = one repetition; a period that ended without one = a miss. |
| Restart | More misses in a row than allowed, or more misses in the attempt than allowed: the count goes back to 0. A new attempt starts at the next completion. |
| Formed | When the count reaches the goal: the task leaves `tasks.md`, `done.md` gets a formed line, a toast says so. |
| Dropped | Deleting a habit (or "Drop habit") logs it as dropped in `done.md`. |
| History | Formed and dropped habits are lines in `done.md`. No new file. |
| Colour | Violet, like amber for Important. |
| Overdue | A habit is never shown as overdue. A missed period is a miss, not a red date. |
| Limit | At most 3 habits in progress (a setting). A new one waits until one is formed or dropped. |
| Config | `habits` in `config.yaml`, and on the settings page (#45). |

## 4. File format

### 4.1 `tasks.md`

```markdown
# Tasks
- [ ] Meditate 10 min 🌱 🔁 every day 📅 2026-10-26
- [ ] Gym: strength 🌱 30 🔁 every week on Monday, Wednesday, Friday 📅 2026-10-28
- [ ] No phone before 9:00 ⏫ 🌱 🔁 every day 📅 2026-10-27
```

- `🌱` marks a habit. A whole number from 1 to 999 right after it is the habit's own goal; no number means the configured goal.
- The app writes it after `⏫` and before `🔁`. Like `⏫`, it may sit anywhere in the line.
- A `🌱` on a task with no 🔁 rule, or with a `when done` rule, makes no habit: the task is an ordinary task and the `🌱` stays in its title as text. *(My call: same as an unparseable 🔁.)*
- No IDs, no counters, no dates of its own. A habit is identified by its title, like every task.

### 4.2 `done.md`

```markdown
- [x] Meditate 10 min 🌱 🔁 every day ✅ 2026-10-25
- [x] Read 20 pages 🌱 🏆 2026-10-26
- [-] Cold shower 🌱 ❌ 2026-07-20
```

Three kinds of habit line:

| Line | Meaning | Counts in stats |
|---|---|---|
| `- [x] {title} 🌱 🔁 {rule} ✅ {date}` | one completion (notes under it as today) | yes, like any completion |
| `- [x] {title} 🌱 🏆 {date}` | formed on that date | no (it has no `✅`) |
| `- [-] {title} 🌱 ❌ {date}` | dropped on that date (Obsidian Tasks' "cancelled") | no |

- A completion keeps `🌱` but not the goal number, as the `📅` date is left out today.
- The `🏆` and `❌` lines are **boundaries**: a habit's progress counts only completions after the last `🏆` or `❌` line with the same title. So a dropped habit can be started again later from 0 just by adding it again.
- Today's app and Obsidian keep both new lines as they are (an `- [x]` without `✅` and an `- [-]` line are "other lines"), so older builds don't break them.

## 5. Counting

All of this is a pure function in `packages/core`: given the habit task, `done.md` and today, it returns the count, the misses, the attempt and the state. It runs on every sync, so a completion from Obsidian or Claude counts as soon as the app sees it.

### 5.1 Periods

- The **rule dates** are the dates the 🔁 rule names (as in the next-date rules). Each opens a **period** that ends the day before the next rule date. `every day`: one day. `every week on Monday, Wednesday, Friday`: Mon–Tue, Wed–Thu, Fri–Sun. `every week on Sunday`: Sunday to Saturday.
- Rules that stride from a date (`every 3 days`, `every 2 weeks`, `every 2 weeks on Friday`, `every 3 months` …) count their strides from the first counted completion. *(My call.)*
- The **counted completions** are the `done.md` completions with the habit's exact title and `🌱`, after the last boundary line (4.2).

### 5.2 The walk

Walk the periods from the one holding the first counted completion up to today:

1. A period with at least one completion: **count + 1**, misses in a row back to 0. Two completions in one period count once.
2. A period that has ended with none: **a miss**. Misses in a row + 1, misses this attempt + 1.
3. More misses in a row than `missesInARow`, or more misses this attempt than `missesPerAttempt`: **restart**. Count, misses in a row and misses this attempt go back to 0; attempt + 1. Periods until the next completion are not misses: the new attempt starts there.
4. Count reaches the goal: **formed** (section 7).
5. Today's period, not done yet: **pending**, not a miss.

Remember the best count of any earlier attempt ("best 9").

Changing the goal or the miss settings re-runs the walk with the new values, past included. *(My call: the simplest honest rule; loosening the rules after a restart can bring a count back.)*

### 5.3 Examples (goal 66, 1 in a row, 6 per attempt)

| Done on (`every day`) | Today | Result |
|---|---|---|
| 1, 2, 3 Oct | 3 Oct | 3/66 |
| 1, 2, 4 Oct | 4 Oct | 3/66, misses 1 (in a row 0) |
| 1, 2 Oct | 4 Oct | 2/66, missed 3 Oct, **last chance** today |
| 1, 2 Oct | 5 Oct | restarted: 0/66, best 2, attempt 2 |
| 1, 2, 5 Oct | 5 Oct | 1/66, attempt 2 (counting since 5 Oct) |
| 1 Oct twice | 1 Oct | 1/66 |

Weekly `every week on Monday, Wednesday, Friday`: done Mon and Thu → 2 (Thu is inside Wednesday's period). Done Mon only, today Fri → 1, missed Wednesday's period.

## 6. Completing a habit

- Completing works like any repeating task: the done line goes to `done.md` (with `🌱`), and the task moves to the next rule date after today.
- It counts for **today's period**. If today's period is already done, the complete button does nothing but say so: "Already done today · next Tue" (or "this week"). Nothing is written. *(My call: stops a double tick from looking like progress.)*
- An old `📅` (a missed period) is never shown in red. The habit sits in Today until done; completing it moves it to the next rule date after today, as today.
- Undo removes the done line, so the count goes back.

## 7. Formed

When a completion brings the count to the goal:

1. The task's block leaves `tasks.md`.
2. `done.md` gets the completion line, then `- [x] {title} 🌱 🏆 {today}`.
3. The toast says: "Habit formed: Read 20 pages · 66 in 71 days · moved to History", with **Undo** and **Keep as task**. Keep as task puts the task back without `🌱` (an ordinary repeating task); the formed line stays.

When the count reaches the goal from a completion made outside the app (Obsidian, Claude), the app does steps 1 and 2 on its next sync and shows the toast then.

## 8. Dropping, unmarking, renaming

- **Drop habit** (in the detail, or Delete on a habit): the task leaves `tasks.md` and `done.md` gets `- [-] {title} 🌱 ❌ {today}`. Undo as for delete.
- **Not a habit** (`h` again, or the toggle): removes `🌱`; the task stays an ordinary repeating task. Nothing is logged.
- **Renaming** a habit starts its count again, because progress is found by title. The app warns before saving: "Renaming restarts Meditate at 0. Rename?" *(My call: the price of not storing state.)*
- **Changing the rule** keeps the count; the walk uses the new rule for all periods. *(My call.)*

## 9. Display

### 9.1 Colour

Violet: `--habit` `#6A48D7` with ink `#4F33B3` and tint `#F1EEFC` in light, `#A894FF` / `#1F1A33` in dark, checked at 4.5:1 on every row background as amber was. A habit that is also important (`⏫`) is violet; it still sorts with the important tasks.

### 9.2 Task row

- Violet circle and title.
- The meta label shows progress: `12/66`, with a small bar on desktop. A habit in a later bucket adds its date (`31/66 · Tue`). A weekly habit inside its period shows `by Sun`.
- **last chance** (red tag on desktop, red dot on the phone) while today's period is open and missing it would restart the count.
- **restarted · best 9** (grey tag) until the next completion.
- No `↻`: a habit always repeats; the rule is in the tooltip and the detail.
- Order within a bucket: important tasks first, then habits, then the usual order. *(My call.)*

### 9.3 Habits group

A group like Important, not urgent, listing every habit in progress: title, `12/66`, a bar, and one line of state ("missed yesterday · one more miss restarts · misses 2/6", "done today · formed ~ 30 Nov", "attempt 2 (best 11)"). Its header has the count against the limit (`3 of 3`) and a link "2 formed · 1 dropped ›" that opens History.

- Task list (desktop): the right pane, above Important, not urgent.
- Week board: the rail, above Important, not urgent (or the detail).
- Phone: a row of small cards under the stats line, at the top, scrolling sideways. Tap opens the edit sheet.

Habits stay in their buckets too; the group is the overview, the bucket row is where you tick. *(My call: AL asked for habits in the main list "like important"; the group adds the metrics.)*

### 9.4 Task detail and edit sheet

A habit block under the title and notes:

- `12 of 66`, the bar, and "formed ~ 20 Dec if no misses";
- a warning line when it applies ("Missed yesterday. Miss today and the count restarts at 0.");
- the last 28 periods as squares: done, missed, restart, today;
- misses in a row and this attempt against what is allowed, the attempt and best count, and "counting since";
- **Goal** (opens a number field; empty = the configured goal), **Not a habit**, **Drop habit**.

### 9.5 History

A sheet (desktop dialog) with In progress, Formed and Dropped. Formed: title, goal, first to last date, days, attempts. Dropped: title, best count, attempts, date. Read-only; starting a habit again is adding it again.

## 10. Adding and marking

- **Key `h`** toggles habit on the selected task. On a task with no usable rule it opens the repeat picker set to `every day` (no `when done`); the habit is set when the rule is.
- **Shortcut word** `hab` / `habit` (v1 spec 9.4), violet when matched. With no 🔁 typed it adds `🔁 every day`, and the date chip goes to Today.
- **Phone**: a Habit toggle beside Important in the add sheet; "Make it a habit" / "Not a habit" in the move sheet.
- The repeat picker hides `when done` for a habit.

### 10.1 The limit

At most `habits.maxInProgress` habits (default 3) can be in progress at once: open tasks with `🌱` in `tasks.md`.

- **At the limit, the app won't start another.** `h`, the toggle and "Make it a habit" say: "3 habits in progress already. Finish or drop one first, or raise the limit in Settings." Nothing changes.
- **A typed `hab`** at the limit still adds the task, as an ordinary repeating task (with `🔁 every day` if none was typed) and without `🌱`. The toast says so, with Undo. *(My call: the typing isn't lost.)*
- **Keep as task** after a habit is formed or Undo of a drop count against the limit like any other way in.
- **Over the limit** (habits added by hand, in Obsidian or by Claude, or a limit lowered in Settings): nothing is removed or paused. Every habit keeps counting, the Habits header shows `4 of 3` in red, and no new habit can start until the count is under the limit. *(My call: the app never takes away progress.)*
- `0` means no limit.

## 11. Config

```yaml
habits:
  maxInProgress: 3        # habits in progress at once; 0 = no limit
  goal: 66                # repetitions to form a habit; a habit's own `🌱 N` wins
  missesInARow: 1         # misses allowed in a row
  missesPerAttempt: 10%   # a number, or a share of the goal (rounded down)
shortcuts:
  habit: h
```

| key | values |
|---|---|
| `habits.maxInProgress` | whole number 0–99 (default 3; 0 = no limit) |
| `habits.goal` | whole number 1–999 (default 66) |
| `habits.missesInARow` | whole number 0–99 (default 1) |
| `habits.missesPerAttempt` | whole number 0–999, or a percentage `0%`–`100%` (default `10%`) |
| `shortcuts.habit` | a key (default `h`) |

Invalid values behave like every config mistake today: a banner and the defaults. The settings page (#45) edits the same keys.

## 12. Other changes

- **Stats**: habit completions count like any completion. Formed and dropped lines don't.
- **Search**: habits are searched like tasks. Formed and dropped lines are not search results. *(My call; backlog if wanted.)*
- **Merge**: nothing new. Progress isn't stored, so two devices can't disagree about it. If two devices both write the same formed or dropped line for the same title and day, the merge keeps one.
- **`taskapp-files` skill**: how to write `🌱`, that completing a habit is completing a repeating task with `🌱` kept in the done line, the period and restart rules for answering "how is my meditation going?", that the app writes `🏆` lines itself, and that at the limit Claude says so instead of adding a fourth `🌱`.
- **Docs**: v1 spec sections 3.3, 3.4, 5.1, 9.1, 9.2, 9.4, 10 and 11; README; `doc/format.md` when it exists.

## 13. Calls made by Claude, to check

1. Default goal 66, per-habit goal `🌱 N`; misses per attempt default 10% of the goal.
2. Progress worked out from `done.md`, never stored; renaming restarts the count.
3. Periods run from one rule date to the next; stride rules count from the first completion; `when done` rules can't be habits.
4. A new attempt starts at the next completion, not at the restart.
5. Changing the goal, the miss settings or the rule re-runs the walk over the past.
6. A second tick in a period is refused with a message.
7. Formed shows a toast with Undo and Keep as task; formed and dropped lines live in `done.md` with `🏆` and Obsidian's `- [-] … ❌`.
8. Violet; habits sort after important tasks; the Habits group sits above Important, not urgent, and at the top on the phone.
9. Formed and dropped lines are not search results.
10. At the limit a typed `hab` adds an ordinary repeating task; over the limit (hand edits, a lowered limit) nothing is removed, the header turns red and no new habit can start.

## 14. Acceptance criteria

- [ ] `core` parses and writes `🌱` and `🌱 N` in task lines, keeps `🌱` in done lines, and reads `🏆` and `- [-] … ❌` lines; round trips leave every other byte alone.
- [ ] The walk (5.2) gives every row of 5.3, plus: weekly and monthly periods, a stride rule, a restart on misses in a row, a restart on misses per attempt, best count, boundaries from `🏆` and `❌`, a goal from `🌱 N` and from config, and percentage misses.
- [ ] Completing a habit counts once per period; a second tick says so and writes nothing.
- [ ] Reaching the goal (in the app, or seen on sync) removes the task, writes the formed line and shows the toast; Undo and Keep as task work.
- [ ] Delete and Drop habit write the dropped line; Not a habit removes only `🌱`.
- [ ] Rows, the Habits group (list, board, phone), the detail block and History look like the mockups in light and dark; colours pass 4.5:1.
- [ ] `h`, `hab`/`habit`, the add-sheet toggle and the move-sheet entries work; `when done` is hidden for habits.
- [ ] At the limit, `h`, the toggle and the move sheet refuse with the message, and `hab` adds an ordinary repeating task; over the limit nothing is removed and the header shows `4 of 3` in red; `0` means no limit.
- [ ] The `habits` and `shortcuts.habit` config keys are validated with the usual banner.
- [ ] Stats unchanged for non-habit data; formed and dropped lines don't count.
- [ ] e2e on both projects: add a habit, tick it, see `1/66`; a seeded history with a miss shows last chance; a goal of 3 forms on the third tick.
- [ ] Docs and the `taskapp-files` skill updated.

## 15. Out of scope

Backlog if wanted later:

- Reminders or notifications for habits.
- Amounts ("10 min", "20 pages") counted as numbers.
- Habits that are "don't do X" counted by slips instead of ticks. (Write them as a daily tick for now: "No phone in bed".)
- Per-habit miss settings (only the goal is per habit).
- Charts and longer history than 28 periods; a streak "freeze".
- Reopening a formed or dropped habit from History.
