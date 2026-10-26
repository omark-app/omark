# #38 Important, not urgent (replaces ALWAYS)

Decided with AL in the session (2026-10-23): moving a group task to Someday drops `⏫`; the group sits where ALWAYS was; its tasks are completable like any other.

## What changes for AL

- The ALWAYS box is now **Important, not urgent**: every open task with `⏫` and no `📅`. Same place as before (desktop list: right pane, under the detail when a task is open; board: the rail box, which the open task's detail takes over as it did for ALWAYS; phone: below the buckets).
- Its rows are normal task rows: amber, with a checkbox, selectable, editable, keyboard commands, swipes and long-press drag on the phone.
- Order is the line order in `tasks.md` (new ones last). Drag a row within the group to reorder it.
- Important Someday tasks now show here, not in Someday.
- Drop any task on the group: it loses its date and gets `⏫`. Move a group task to a dated bucket: it keeps `⏫`. Move it to Someday (drop, move sheet, detail chip, `s`, typed `som`): it loses `⏫`.
- On the next sync the `# Always` lines become `- [ ] {line} ⏫` at the top of `# Tasks`, in their order, and `# Always` is gone from the file. Free text there is kept above `# Tasks`.
- The philosophy (Eisenhower matrix, habit machine) goes into the spec.

## Acceptance criteria

Format (core):
- [ ] `parseTasks` of a file with `# Always` turns each `- line` into an open important undated task, at the start of the items, in order; blank lines and the heading go; other lines go to the preamble.
- [ ] `serializeTasks` writes `preamble`, `# Tasks`, items; it never writes `# Always`. A new-format file round-trips byte for byte.
- [ ] `TasksDoc` has no `always` / `alwaysRaw`; `setAlways` is gone.
- [ ] A `# Always` heading after `# Tasks` stays a plain raw line, as before.
- [ ] A new `tasks.md` starts as `# Tasks\n`.

Group (core):
- [ ] `bucketOf` gives `important` for `⏫` with no date; `someday` only for non-important undated tasks.
- [ ] `tasksInBucket(…, 'important')` is in file order.
- [ ] Dropping within the group reorders. Dropping another task on the group sets no date and `⏫`, placed before the row when given.
- [ ] `moveToBucket(…, 'someday')` on a group task drops `⏫`; on a dated important task it keeps `⏫`.
- [ ] The group is not a move/add choice and not in `foldedOnOpen`; `bucketName` names every key.

Web:
- [ ] The group shows in the three places with its name, count and an empty message; never folds.
- [ ] Rows complete, select, open the edit sheet on the phone, and drag to reorder (mouse and touch).
- [ ] j/k reach group rows after the buckets in the list; on the board they stay on the board.
- [ ] Toasts name the group ("Moved to Important, not urgent").
- [ ] No ALWAYS left in the UI; the hint `esc always` becomes `esc close`.
- [ ] Preview sample files have a few group tasks instead of Always lines.

Docs:
- [ ] v1 spec (sections 1, 3, 4, 7, 11), `taskapp-files` skill, README.

## Tests I'll write first

- `tasks-file.test.ts`: migration of a legacy Always section (order, free text kept, blank lines dropped, heading gone); new format round trip; `# Always` after `# Tasks` stays raw.
- `buckets.test.ts`: `bucketOf` gives `important`; file order; `bucketName`.
- `drop.test.ts`: reorder within the group; drop into the group; drop a group task on Someday drops `⏫`, on Today keeps it.
- `ops.test.ts`: `moveToBucket` someday rule.
- `store.test.ts`: a legacy file is saved migrated on open.
- e2e `important.spec.ts` (replaces `always.spec.ts`): migrated lines show in the group; drag reorders and saves; ticking one logs it; dropping a Today task on the group.

## Risks

- Board rail: on `main` the rail is already about as tall as a 800 px window with a task open, so showing the group under the detail there scrolled the page when editing a low row (`board.spec` "rail stays in view"). The board keeps ALWAYS's behaviour instead: the detail takes the group's place while a task is open.
- Another device still on the old build writes `# Always` (empty) back into the file. The new build drops an empty section on its next save. Harmless churn until all devices update.
- An Always line added, edited or deleted on an old device while the new one migrates: the merge migrates every version that still has `# Always` before merging, so the change meets the migrated tasks as the same blocks (review finding).
- An Always line with field text (`📅 2026-…`) becomes a dated task. Unlikely; the line's text decides as everywhere else.

## Out of scope

- A separate order key or IDs: order stays the file order.
- Folding the group or a config key for it.
