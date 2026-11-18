# Repeat N times a week, month or year (#163)

**Goal:** a task or habit can repeat a number of times per calendar week, month or year (`🔁 3 times a week`) instead of on fixed days, so a skipped Monday is not a miss while the week still has room.

**Tech stack:** TypeScript, Svelte 5, Vitest, Playwright. No new dependency.

## What changes for users

- A new repeat rule: `🔁 3 times a week`, `🔁 twice a month`, `🔁 4 times a year`. It works for tasks and habits, typed in a title, written by hand or Claude, or picked in the repeat picker ("Times per period": a number and week / month / year).
- The task's date is always the earliest day it can still be done:
  - not done today: today;
  - done today: tomorrow (at most one a day);
  - done N times this period: the first day of the next period (Monday, the 1st, 1 January).
- In a bucket, important tasks come first, then habits, then by date, then the "times" tasks that can still wait this period. An important one stays with the important tasks. Once the days left equal the times left, the task stops waiting: it sorts like a dated task and its row shows **last chance**.
- A "times" task is never shown overdue: an old date only means it wasn't done that day.
- Its row shows the period's progress: `1/3 this week` (`this month`, `this year`).
- Completing it a second time the same day writes nothing and says **Done today · next Wed**. Once the period's count is met, completing says **Done 3/3 this week · next Mon**, writes no done line, and moves the date to the next period if it was still in this one (so a count met elsewhere, in Obsidian or by Claude, needs one tap to clear).
- Habits: each completion counts toward the goal, at most N per period and one a day. A period that ends short of N is one miss; its completions still count. The miss rules (in a row, per attempt) are unchanged. The habit is "done this period" once N is met. Its last chance is the same as a task's: the days left equal the times left.

## Format

| rule | meaning |
| --- | --- |
| `once a week`, `twice a week`, `3 times a week` | N days of each calendar week, Monday to Sunday |
| `… a month` | N days of each calendar month |
| `… a year` | N days of each calendar year |

- N: 1–7 a week, 1–28 a month, 1–365 a year (at most one a day, and 28 fits every month). `1 time` and `2 times` read too. Anything else is not a rule and stays in the title.
- A writer puts `once` for 1, `twice` for 2, `N times` above. A line the app doesn't change keeps its own wording, byte for byte.
- Progress in the period is never stored. It is the number of different days in the period with a completion in `done.md` that has the task's exact title and a "times" rule (for a habit, the habit's counted completions, as now).
- Obsidian Tasks doesn't read this rule. There the task doesn't repeat; the line stays as written. A line ticked in Obsidian is swept by the app as today, with the next date worked out from `done.md`.
- The week is Monday to Sunday whatever the week-start setting, like `every N weeks on …` today. *(My call: a rule in the file means the same on every device.)*

## Design

- `RepeatRule` gets `{ type: 'times'; n: number; per: 'week' | 'month' | 'year' }`. `parseRepeat`, `formatRepeat`, `describeRepeat` (`3× a week`) handle it; `isUsableHabitRule` accepts it.
- `recurrence.ts`:
  - `timesPeriod(per, d)`: the calendar week, month or year holding `d`.
  - `timesStatus(rule, completions, today)`: done days this period, times left, days left (today included), `doneToday`, `met`, `canWait` (not met, not done today, days left > times left), `lastChance` (not met, not done today, days left = times left).
  - `nextDate(rule, due, today, completions = [])`: for a "times" rule, the next period's first day when the count is met (completions include today's), else tomorrow. `fitDate` for a "times" rule keeps the date if it's set, else today.
- `ops.completeTask` passes the task's completions (after appending today's) to `nextDate`; `done-file` sweep does the same.
- `buckets.tasksInBucket(doc, key, ctx, canWait?)`: an optional test; tasks that pass it and aren't important go after the rest. The store passes one built from `done.md`.
- `labels.metaLabel`: a "times" task is never overdue; its text is the progress (`1/3 this week`) when its date is today or earlier.
- `habits.walkHabit`: for a "times" rule each period adds min(different days, N) to the count, can form mid-period, and is a miss when it ends short. `doneThisPeriod` is `met`; `lastChance` uses the times meaning. `formedEstimate` counts N per period.
- App: `complete` checks `doneToday` and `met` first (both tasks and habits), with the two messages above; the picker gets the new kind; the row shows the progress and `last chance`; `habit-text` says "last chance this week" for a times habit.

## Acceptance criteria

- [ ] `core` parses and writes every wording in the Format table; out-of-range N stays in the title; round trips keep other bytes.
- [ ] Next date: not met → tomorrow; met → next period's first day; with no completions today → today stays.
- [ ] One a day: a second completion the same day writes nothing and shows "Done today · next …".
- [ ] Met: completing writes nothing, shows "Done N/N this week · next …" and moves the date to the next period.
- [ ] Sort: important, habits, by date, then tasks that can still wait; important "times" tasks stay with the important ones; a last-chance task sorts by date.
- [ ] Row: `1/3 this week`, never red when old, `last chance` when the days left equal the times left.
- [ ] Habits: count capped at N per period, one a day; a short period is one miss; forms mid-period; last chance as above.
- [ ] The repeat picker sets `N times a week|month|year`, for tasks and habits.
- [ ] A ticked `- [x]` line from Obsidian is swept with the next date from `done.md`.
- [ ] Docs: `doc/format.md` (rule table, next date), `doc/tasks/spec.md` (sort, row), `doc/tasks/habits-spec.md` (periods, walk, last chance), the `taskapp-files` skill.

## Tests I'll write first

- `repeat-format.test.ts`: parse/format of `once/twice/N times a week|month|year`, N limits, `1 time a week`, case and spaces.
- `recurrence.test.ts`: `timesPeriod` at week, month and year edges; `timesStatus` for can wait, last chance, lost, met; `nextDate` cases (Mon done 1/3 → Tue; Sun done → next Mon; met on Wed → next Mon; month end; year end).
- `ops.test.ts`: `completeTask` on a times task moves the date as above; the done line keeps the rule.
- `done-file.test.ts`: a swept times task gets its date from `done.md`.
- `buckets.test.ts`: the sort, with `canWait`, important and last chance.
- `labels.test.ts`: progress text, never overdue.
- `habits.test.ts`: the walk table for `3 times a week` (full week, short week, two short weeks restart, forming mid-week, two ticks in a day count once).
- `store.test.ts`: the two refusals and their messages.
- e2e (`apps/tasks`): pick "3 times a week" in the picker, complete twice in a day, see the message and the row progress.

## Risks

- Obsidian Tasks won't repeat these tasks; a user ticking only in Obsidian gets the app's sweep, not Obsidian's own next line. Documented.
- Sorting now needs `done.md`; `tasksInBucket` stays pure with an optional test, so nothing else changes.
- Week start: a user with Sunday as week start sees weeks counted Monday to Sunday for this rule. Documented.

## Out of scope

- `3 times every 2 weeks` and other intervals.
- Shortcut words for the rule in quick add (typing `🔁 3 times a week` works).
- Spreading the times evenly through the period.
