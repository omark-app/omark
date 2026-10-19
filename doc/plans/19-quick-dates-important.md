# #19 Tomorrow option, 3-letter date shortcuts and an Important flag

Mockup: https://claude.ai/artifact/UxanecfHTyZ2X4W9xG8tQu (screen 1 is clickable).

## What changes for AL

- **Tomorrow** sits right after Today in the add sheet, the swipe-left move sheet and the desktop detail chips. On desktop, `m` moves the selected task to tomorrow. On a Sunday, tomorrow is Monday, so the task lands in Next week.
- **Shortcut words** in a new task's title, typed anywhere, any case, from 3 letters up to the full word:

  | word | gives (today Mon 19 Oct) |
  | --- | --- |
  | `tod`, `today` | Today |
  | `tom`, `tomorrow` | Tue 20 Oct |
  | `mon` … `sun`, `monday` … `sunday` | the next such day after today: `fri` → Fri 23 Oct, `mon` → Mon 26 Oct |
  | `som`, `someday` | no date |
  | `imp`, `important` | the Important flag |

  As in Todoist, a matched word turns bold on a tint inside the field (blue for dates, amber for `imp`). The date chip and the Important toggle follow it. Backspace right after a bold word deletes nothing: it turns the word back into plain text. A space after it doesn't bring it back; changing the word (for example deleting the `m` and typing it again) does. Bold words leave the title. With two dates, the last one wins. Tapping a chip after typing wins over the typed word. Shortcuts work only when adding a task (the phone add sheet and the desktop add input), never when editing a title.
- **Important flag**: an important task has an amber circle and an amber title (look A in the mockup), in the list, the board and search results. Inside every bucket, important tasks come first, then by date, then by file order. It is set by `imp`, the Important toggle in the add sheet, "Mark important" / "Not important" in the move sheet, the toggle in the desktop detail, and the `i` key on desktop. Undo takes it back like any other change.
- **In the files**: `- [ ] Call the bank ⏫ 📅 2026-10-20` in `tasks.md`. `⏫` is Obsidian Tasks' high priority, so Obsidian shows it too. A completed important task keeps it: `- [x] Call the bank ⏫ ✅ 2026-10-20`. A repeating important task stays important on its next date.

## Acceptance criteria

Format (core):
- [ ] A task line with `⏫` (also `⏫️` with the variation selector) anywhere in it reads as important, with `⏫` taken out of the title.
- [ ] The app writes an important task as `- [ ] {title} ⏫ 🔁 {rule} 📅 {date}` and it reads back the same. Lines the app didn't touch stay byte for byte.
- [ ] `⏫` typed into a title becomes the flag, as typed 📅 and 🔁 text already does (issue #8).
- [ ] The other priority signs (`🔺 🔼 🔽 ⏬`) stay in the title as text.
- [ ] A done line keeps `⏫`; completing a repeating important task keeps the flag on the next date.

Ordering (core):
- [ ] Inside each bucket: important first, then earliest date, then file order. Same in the board view.
- [ ] Dragging a task within a bucket can only reorder it among tasks with the same importance and date. Dropping it elsewhere keeps its importance and date, and the toast says so (as it does for dates today).

Shortcuts (core, pure):
- [ ] All the words in the table match from 3 letters up to the full word, in any case; 1–2 letters, longer words (`tomato`) and words inside other words don't.
- [ ] Weekday words give the next such day strictly after today (1 to 7 days ahead).
- [ ] A dismissed word stays text through edits elsewhere and through a space after it. It counts again once the word itself changes.
- [ ] Bold words leave the title. A title made only of shortcut words isn't added.

Tomorrow:
- [ ] The Tomorrow chip comes right after Today in the add sheet and the desktop detail, and Tomorrow comes right after Today in the move sheet with its date (`Tue 20 Oct`).
- [ ] `m` (tomorrow) and `i` (important) are new default desktop keys, configurable as `tomorrow` and `important` in `shortcuts`.

Add flow (web):
- [ ] Phone add sheet: words turn bold as they are typed; the chip follows (a weekday word shows its own date chip, such as `Fri 23 Oct`); the Important toggle follows `imp`; Backspace dismissal works; Add saves the clean title with the date and flag.
- [ ] Desktop add input: the same bold words and Backspace dismissal. Enter adds with the typed date, or the configured bucket when none was typed.
- [ ] The highlight stays lined up with the text on iPhone Safari and desktop Chrome, also when the text is longer than the field.

Look (web):
- [ ] Important rows show the amber circle and title in light and dark, with text contrast of at least 4.5:1.
- [ ] The hint strip lists `m` and `i`.

Docs:
- [ ] The v1 spec (sections 3.3, 3.4, 4.3, 4.4, 5.1, 9.1, 9.2, 10), the `taskapp-files` skill (task line, done line, the new shortcut commands) and the README are updated.

## Tests I'll write first

Core (Vitest), each run and seen failing before the code:
- `tasks-file.test.ts`: reading `⏫` and `⏫️` anywhere in the line; the canonical write order; read-back; other priority signs stay in the title; an untouched line keeps its bytes.
- `done-file.test.ts`: the done line of an important task, repeating or not.
- `ops.test.ts`: `addTask` with Tomorrow and Important; `setImportant` on and off; typed `⏫` becomes the flag; completing a repeating important task.
- `buckets.test.ts`: important first inside a bucket, then date, then file order.
- `drop.test.ts`: reordering across importance keeps the flag and reports it.
- `quick-add.test.ts` (new): a table of inputs and results for today Mon 19 Oct 2026 (`tom`, `TOM`, `Tomorrow`, `to`, `tomato`, `mon` on a Monday, `fri`, `next` (no match), `som`, `imp`, two dates, a title made only of shortcut words), and dismissals carried through edits.
- `config.test.ts`: the new `tomorrow` and `important` commands, their defaults, a clash with another key.
- `skill-examples.test.ts`: the new examples in the `taskapp-files` skill parse as written.

Web unit (Vitest): `keys.test.ts` for `m` and `i`; `store.svelte.test.ts` for the add with a typed date, Undo after toggling Important.

E2e (Playwright, `desktop` and `iphone`):
- iPhone: type `Call the bank imp tom`, see two bold words, tap Add, and the task is first in This week, amber, titled "Call the bank", with `⏫ 📅 2026-…` in the fake drive's `tasks.md`.
- iPhone: `Buy sun cream`, Backspace after `sun`, Add: the task stays in Today with the full title.
- iPhone: swipe left, Tomorrow, then Mark important.
- Desktop: the add input with `fri imp`; `m` and `i` on a selected task; the board puts important first.

## Risks

- **Ordinary words become dates by surprise** (`sun`, `sat`, `Tom`, `important`). That's the price of "anywhere", which AL chose; the bold highlight and Backspace are the safety net.
- **The highlight drawn under the input** (the input's own text is transparent) has to stay lined up with the text: same font and padding, kept in step with the input's scrolling. iOS predictive text and autocorrect can replace a word without a Backspace key event, so dismissal listens to `beforeinput` (`deleteContentBackward`) as well as `keydown`. Checked on WebKit in e2e and on AL's phone in the preview.
- **Existing `⏫` in AL's files** (from Obsidian) will show as Important. That is intended. I can't see the real files from here.
- **An older app version on another device** (a cached PWA) reads `⏫` as title text and writes it back in place, so the flag survives. Merge is line-based, so no merge change is needed.
- **Sorting** now puts important tasks first, so a drag among them is limited (see the drag criterion).

## Out of scope

- More priority levels, or `🔺 🔼 🔽 ⏬` as flags.
- Shortcut words when editing an existing title.
- A word for Next week (`nex`): AL dropped it, as `next` is too common in titles and weekday words cover it.
- Other natural-language dates (`next fri`, `in 3 days`, repeats). A word for This week (e.g. `wee`) can follow in a separate issue if AL wants one.
- Mapping Todoist's p1 to `⏫` in the import tool.
- `tomorrow` as a `newTaskBucket` value.
- The board on the phone.
