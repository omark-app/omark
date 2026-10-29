# G.1: `packages/goals-core`

Roadmap G.1. Builds the logic of [the Goals spec](../goals/spec.md) sections 5, 6 and 11 (goals-core part of section 13). Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

Nothing yet: the Goals part (G.2) is still a placeholder tab. G.1 is the pure package G.2 draws and edits the board with.

## Check first: tags in done.md (spec 16)

`parseFields` in `tasks-core` takes out only `📅`, `✅`, `🔁`, `⏫`, `🌱` and their values; a `#tag` stays in the title, and `doneLine` writes the title as is. So `#family` and `#CLIMB` survive completing a task and a habit. A tasks-core test pins it.

## The package

`packages/goals-core`, set up like `time-core`, with no dependencies. It takes other apps' data as plain shapes (`{ title, doneOn }`, `{ date, project, known }`), which `DoneEntry`, `Task` and `EventRow` already fit, so it imports neither `tasks-core` nor `time-core`.

- **`goals-file.ts`**: `parseGoals(text)` / `serializeGoals(doc)`. A doc is `head` (lines before the first `##`) and `sections` in file order, each an area or `## Not now` holding its raw lines. Everything the app shows (vision line, area name and tag, picture, vision text, goals, Not now items) is derived from the raw lines, so untouched lines are written back byte for byte. Reads a BOM and CRLF, writes LF and one final newline (as `tasks.md`).
- **`tags.ts`**: `makeTag(name)` (lower case, diacritics dropped, letters, digits and `-`), `tagProblem` (a tag that equals a project code or another area's, ignoring case), `freeTag` (adds `-2`, `-3`…), and `titleTags(title)` for links.
- **`ops.ts`**: edits that keep the spec's rules: `setVision`; `addArea` (tag made once), `editArea` (rename keeps the tag; an untagged heading gets one on its first edit; picture and vision text), `moveArea`, `deleteArea`; `addGoal` (`➕`), `editGoal` (`✏️` when text, date or project change; `✅` when ticked, removed when unticked), `deleteGoal`; Not now `add`/`edit`/`delete`.
- **`activity.ts`**: per area, its linked codes, last activity (goal `➕`/`✏️`/`✅`, done completions with the area tag or a linked code, known rows with a linked code; dates up to today only), `linked` (any goal, tagged open task or habit, or tagged completion) and `needsUpdate` (linked and the last activity is older than `stale_after` months, the edge day not stale).
- **`chips.ts`**: a goal's status ("by Oct 2027", "was due Oct 2026", "✓ Aug 2026") and, with a project code, hours this month and since `➕` (known rows up to today) and open tasks with the code.

**Goal line, as written:** `- [ ] {text} #{CODE} ✏️ {date} 📅 {due} ➕ {set} ✅ {done}`. `✏️` goes before `📅` because Obsidian Tasks reads its signs from the end of the line and stops at one it doesn't know; there it stays in the description and `📅`, `➕`, `✅` still read *(my call)*. A goal's other `#tags` and emoji stay in its text.

## Tests first

- Parse and write round trip of the spec example, a file with unknown lines, headings, comments, notes under goals and CRLF/BOM input.
- Area tags: made from the name, a project code refused ignoring case, fixed on rename, untagged headings shown and tagged on first edit, duplicates numbered.
- Every edit op, with the lines it doesn't touch unchanged.
- Activity: every source in 6.2, the exact 3-month edge, a formed habit (completions count, the 🏆 line doesn't, the area goes stale later), a code on goals in two areas, future dates ignored, unknown rows ignored, the nothing-linked hint.
- Status chips for each case and the project facts.

## Risks

- Byte-for-byte keeping is only as good as the raw-line model: edits rewrite only the lines they change, and tests compare whole files.
- Area tags with letters outside ASCII (`ł`) stay as typed; Obsidian accepts them.

## Out of scope

- Goals' `config.yaml` and its Settings schema (`stale_after`): with the one Settings page (U.5) or G.2; `goals-core` takes the period as a number.
- A three-way merge for `goals.md` on sync conflicts: G.2, with the storage wiring.
- Pictures (resizing, naming files): G.2 in the app; `goals-core` only reads and writes the image line.
