# G.2: the Goals part

Roadmap G.2. Builds sections 4, 7 and 8 of [the Goals spec](../goals/spec.md) on `packages/goals-core` (G.1), as a part of the one app (U.3–U.5). Written 2026-10-29 in fast mode (no approval wait).

## What changes for users

Still only on a local run or a fake build of `apps/omark` (hosts come in U.7). With Goals on, the Goals tab is **Vision**, the board:

- the vision line at the top: tap it to edit, or "Add your vision line";
- one card per area:
  - its name in a plain colour from the name;
  - the vision text in italics;
  - its open goals, each with a status chip ("by Oct 2027", "was due Oct 2026"), plus hours and open tasks for a goal with a project;
  - habits in progress that link to the area, with their progress;
  - "Achieved (n)", folded;
- **Needs update** on a stale card ("Nothing linked has happened since 14 July"), and the hint on an area with nothing linked ("Add a goal, or tag a habit with #family");
- the **Not now** list, with add, edit and delete;
- **Add area**;
- an **area form**: name, vision text, Move up, Move down, Delete (asks first);
- a **goal form**: text, target date, project (pick from `projects.csv`, or create one with a code and description), Achieved, Delete (asks first);
- a **first run** while `goals.md` is empty or missing: placeholder cards that explain areas, goals, links and Needs update, with "Add your first area". Nothing is written until the first edit.

Goals' `config.yaml` (`stale_after`, 1–24 months, default 3) gets its section on the one Settings page.

## Pictures move to G.2b *(my call)*

An area's picture needs storage to read and write binary files (`images/climbing.jpg`). Every adapter (OneDrive, Google Drive, a folder, the fakes) reads and writes text only today. G.2b adds binary reads and writes to the adapter contract, then the picture: shown on the card, added, replaced and removed in the area form, resized to 1600 px JPEG. Until then a card with a picture line in `goals.md` shows the plain colour, and the line is kept as it is.

## How

- **Where:** `apps/omark/src/parts/goals/` (components and a store), as Goals lives only in the one app *(my call: the Goals spec's `apps/goals` was written before the one app)*.
- **Files:**
  - `goals/goals.md` through `FileSync`, merged line by line with `merge3` (tasks-core), so a conflict keeps both sides' lines;
  - `goals/config.yaml` through `FileSync` with `mergeSettings`;
  - `projects.csv` at the top through `FileSync` with time-core's `mergeProjects`. Goals only appends a row.
- **Read-only, no writes ever:** `tasks/tasks.md`, `tasks/done.md`, `tasks/config.yaml` (for the habit settings), and `time/events-<year>.csv` for this year and the two before.
- Everything is read when the tab opens and again on focus. A read that fails leaves the facts it would have given out: no Needs update from missing data.
- **Logic:** `packages/goals-core` (parse, edits, activity, chips) and a small store: the doc, the facts, and the edits that call goals-core's ops and stage the new text.
- **Settings:** a `GOALS_SCHEMA` in goals-core (`stale_after`); the part publishes it like Tasks (`registry.goals`), and the one Settings page shows its section.

## Steps (each test first)

1. goals-core: `mergeGoalsText` and `GOALS_SCHEMA` with `readGoalsConfig`. Unit tests.
2. The Goals store: open, edits through goals-core ops, facts from the other parts' files, a new project in `projects.csv`. Unit tests with fake folders.
3. The board, cards, forms, Not now and first run, in Svelte.
4. Goals' section on the one Settings page.
5. e2e (desktop and iPhone, fake storage):
   - first run placeholders, then the first area replaces them;
   - add, edit and delete an area and a goal;
   - tick a goal and find it under Achieved;
   - create a project from the goal form and find it in `projects.csv`;
   - a stale area shows Needs update, and a linked completion in `done.md` clears it;
   - Not now add, edit and delete;
   - `goals.md` is created on the first edit only.
6. Docs: Goals spec (as built), roadmap.

## Acceptance

- The step 5 e2e pass on both projects; `goals.md` written by the app reads back in Obsidian as the spec shows (its lines are goals-core's).
- Goals never writes another part's files, except a new row in `projects.csv`.
- A Tasks-only start loads no Goals code.
- `pnpm typecheck`, `pnpm test`, the builds and the touched e2e pass.

## Out of scope

Pictures (G.2b, above). The demo world (U.6). Links from a card's hours to Time and its tasks to Tasks (one app spec 7, "nice to have"). Tag suggestions in Tasks (G.3). The skill and format (G.4).
