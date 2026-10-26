# #26 Fold Overdue into Today and add a Tomorrow bucket

## What changes for AL

- The buckets become **Today, Tomorrow, This week, Next week, Later, Someday**. There is no Overdue section any more.
- **Today** holds everything due today or earlier. Order inside it: important first, then overdue (oldest first), then today's tasks, then file order. This is the existing sort (important, then earliest date), so overdue tasks naturally sit above today's. Overdue tasks keep their red date label, so they still stand out.
- **Tomorrow** holds tasks due tomorrow. Its header shows the weekday (`Wed`). It opens by default.
- **This week** now starts the day after tomorrow (`Thu–Sun` on a Tuesday). On Saturday and Sunday it is empty (Sunday is tomorrow or today), so the This week chip is hidden, as it is on Sundays now. `w` then moves to Tomorrow (Saturday) or Today (Sunday).
- **Next week** stays next Monday to next Sunday. On a Sunday, Monday's tasks show in Tomorrow, not in Next week.
- Moving and dropping:
  - Drop on Today sets today. Drop on Tomorrow sets tomorrow. Dropping within Today reorders, as within any bucket (an overdue task keeps its date and the toast says so, as for any other date).
  - `t`, the Today chip and the Today move option on an overdue task still move it to today (the chip is not shown as "current" for an overdue task).
- **Board**: still 4 columns, cut by the same rule (tallest column as short as possible, then best balanced, then closest to the default). The default becomes `Today | Tomorrow + This week | Next week | Later + Someday`. Today, Tomorrow, This week and Next week start open on the board. The layout is still kept while you work; tasks moving at midnight stay in their bucket's column.
- **config.yaml**: `foldedOnOpen` accepts `tomorrow`. `overdue` is still accepted (so an older config never breaks) but does nothing. `newTaskBucket` accepts `tomorrow`.

## Acceptance criteria

Core:
- [ ] `BUCKETS` is Today, Tomorrow, This week, Next week, Later, Someday.
- [ ] A task due before today or today is in Today; due tomorrow is in Tomorrow; day after tomorrow to end of week is in This week; then Next week, Later, Someday as before.
- [ ] Today sorts important first, then earliest date (overdue before today), then file order.
- [ ] This week is not offered as a choice when the week has no day after tomorrow; `dateChoices` lists Today, Tomorrow, This week (when left), Next week, Someday.
- [ ] `currentChoice` is null for an overdue task, Today for a task due today, Tomorrow for tomorrow.
- [ ] A drop on Tomorrow sets tomorrow; a drop on Today sets today; reorder within Today works for overdue and today tasks.
- [ ] Board packing with 6 buckets into 4 columns picks the shortest tallest column; default `Today | Tomorrow + This week | Next week | Later + Someday`.
- [ ] Config: `foldedOnOpen: [overdue, tomorrow]` parses without error (overdue ignored); `newTaskBucket: tomorrow` works.

App:
- [ ] List shows no Overdue section; overdue tasks are in Today with a red date.
- [ ] Tomorrow section shows between Today and This week, with its count.
- [ ] Board has 4 columns; the e2e board fixture packs as expected.
- [ ] The midnight tick moves tomorrow's task into Today and today's task stays in Today.
- [ ] `w` on the second-to-last day of the week moves to tomorrow.

Docs:
- [ ] v1 spec sections 4 and 11.2, README if it mentions Overdue, the `taskapp-files` skill (bucket list, config values).

## Tests I'll write first

- `buckets.test.ts`: bucket list and names; `bucketOf` for past, today, tomorrow, day after, end of week, Sunday→Monday edge; Today's order with an important today task, an overdue task and a today task; `dateChoices` and `currentChoice` on Tue, Sat and Sun.
- `drop.test.ts`: drop on Tomorrow, drop on Today, reorder within Today.
- `board.test.ts`: default layout, a heavy Today, a heavy Tomorrow.
- `config.test.ts`: `overdue` accepted and ignored, `tomorrow` accepted in both keys.
- `store.test.ts`: midnight tick, board columns, counts and fold defaults.
- e2e `list.spec.ts` and `board.spec.ts`: no Overdue, Tomorrow section, 4 columns.

Existing tests about Overdue change because the behaviour they cover is meant to change.

## Risks

- A task due tomorrow used to show in This week (or Next week on a Sunday). It now shows in Tomorrow. No data changes: buckets are computed, nothing is written.
- `foldedOnOpen` in AL's real config might list `overdue`: kept valid, so no error banner.
- Board fixtures in e2e change shape; I'll recheck the packing numbers by hand.

## Out of scope

- A separate "overdue" divider or sub-header inside Today.
- Any change to the file formats of `tasks.md` or `done.md`.
