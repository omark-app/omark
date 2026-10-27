# Habits Implementation Plan (#44)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habits: repeating tasks marked `🌱` that count up to a formed habit, with progress worked out from `done.md`.

**Architecture:** `tasks-core` reads and writes the new marks (`🌱`, `🌱 N`, `🏆`, `- [-] … ❌`), reads the `habits` config, and holds the counting walk and the habit operations as pure functions (`habits.ts`, `habit-ops.ts`). The app store derives every habit's progress from the state on each change and turns completes, deletes and syncs into the habit operations. New components show the rows, the Habits group, the detail block and History.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Playwright (`desktop` Chrome, `iphone` WebKit).

**Spec:** `doc/TaskApp habits spec.md` (approved 2026-10-26, section 13 accepted). Mockups: `doc/mockups/habits/` (spec wins where they differ).

## What changes for AL

- Type `Meditate 10 min hab` and get a violet daily habit at `0/66`. `h` (or the Habit toggle, or "Make it a habit") turns a repeating task into one.
- Ticking counts once per period; a second tick says "Already done today · next Tue" and writes nothing.
- Rows show `12/66`, **last chance**, **restarted · best 9**, `by Sun`; a habit is never red/overdue.
- A Habits group (list side pane, board rail, phone cards at the top) with `3 of 3` and a link to History.
- Reaching the goal removes the task, writes `- [x] Read 20 pages 🌱 🏆 2026-10-26` to `done.md` and toasts "Habit formed …" with Undo and Keep as task. Deleting a habit writes `- [-] … 🌱 ❌ date`.
- At most 3 habits in progress (`habits.maxInProgress`); goal 66, 1 miss in a row, 10% misses per attempt, all in `config.yaml`.

## Acceptance criteria

The spec's section 14, each owned by a task below:

- [ ] Core parses and writes `🌱` / `🌱 N`, keeps `🌱` in done lines, reads `🏆` and `- [-] … ❌`; round trips leave other bytes alone. (Task 1)
- [ ] The walk gives every row of 5.3, plus weekly, monthly, stride, both restart kinds, best, boundaries, goal from `🌱 N` and config, percentage misses. (Task 3)
- [ ] One count per period; a second tick says so and writes nothing. (Tasks 4, 5)
- [ ] Reaching the goal (in the app or seen on sync) removes the task, writes the formed line, toasts; Undo and Keep as task work. (Tasks 4, 5)
- [ ] Delete and Drop habit write the dropped line; Not a habit removes only `🌱`. (Tasks 4, 5, 8)
- [ ] Rows, Habits group (list, board, phone), detail block and History look like the mockups in light and dark; colours pass 4.5:1. (Tasks 6, 7, 8)
- [ ] `h`, `hab`/`habit`, the add-sheet toggle, the move-sheet entries; `when done` hidden for habits. (Task 9)
- [ ] The limit: refusals, `hab` adds an ordinary repeating task, over the limit `4 of 3` in red, `0` = no limit. (Tasks 5, 7, 9)
- [ ] `habits.*` and `shortcuts.habit` validated with the usual banner. (Task 2)
- [ ] Stats unchanged for non-habit data; formed and dropped lines don't count. (Task 1)
- [ ] e2e on both projects: add, tick, `1/66`; seeded miss shows last chance; goal 3 forms on the third tick. (Tasks 6–9)
- [ ] Docs and the `taskapp-files` skill updated. (Task 10)

## Global Constraints

- Marker `🌱`, optional goal 1–999 right after it (`🌱 30`). App writes it after `⏫`, before `🔁`.
- Done lines: completion `- [x] {title} 🌱 🔁 {rule} ✅ {date}` (no goal number), formed `- [x] {title} 🌱 🏆 {date}`, dropped `- [-] {title} 🌱 ❌ {date}`.
- A `🌱` with no 🔁 rule or a `when done` rule is not a habit and stays in the title as text.
- Defaults: `maxInProgress: 3`, `goal: 66`, `missesInARow: 1`, `missesPerAttempt: 10%`, `shortcuts.habit: h`.
- Ranges: `maxInProgress` 0–99, `goal` 1–999, `missesInARow` 0–99, `missesPerAttempt` 0–999 or `0%`–`100%` (rounded down).
- Colours: `--habit #6A48D7`, ink `#4F33B3`, tint `#F1EEFC` (light); `#A894FF` / `#1F1A33` (dark).
- Progress is never stored. Nothing in this plan adds a file, an ID or a counter.
- Existing tests change only where the behaviour they cover changes; say which in the PR.

## Review Focus

1. **Old builds and Obsidian keep the new lines.** A `- [-]` line and a `- [x] … 🏆` line in `done.md` must survive parse/serialize byte for byte, and a `🏆` line typed into `tasks.md` must be swept to `done.md` unchanged, never stamped with ✅. (Task 1 tests.)
2. **Same formed line from two devices.** Both sides append `- [x] Read 🌱 🏆 2026-10-26` → the merge keeps one. (Task 4 test.)
3. **A habit losing its rule.** Setting a habit's repeat to none or `when done` makes it "not a habit" (no stray `🌱` text left in the title). (Task 4 test.)
4. **Formed seen on sync must not loop.** A habit formed from an outside completion is formed once; its toast offers Keep as task, not Undo (Undo would bring back a task the next sync forms again). (Task 5 test.)
5. **Renaming during a background save.** A habit title edit is held until the field is left, so a refresh or page hide never renames (and restarts) a habit without the confirm. (Task 8 test.)

---

### Task 1: Core file format

**Files:**
- Modify: `packages/tasks-core/src/model.ts`, `src/tasks-file.ts`, `src/done-file.ts`
- Test: `packages/tasks-core/test/tasks-file.test.ts`, `test/done-file.test.ts`, `test/stats.test.ts`

**Interfaces:**
- Produces (model.ts):
  - `interface HabitMark { goal: number | null }` (the `🌱` field; `goal` from `🌱 N`).
  - `Task.habit?: HabitMark`, `DoneEntry.habit?: HabitMark`.
  - `interface HabitEnd { kind: 'formed' | 'dropped'; title: string; on: ISODate }`; `DoneLine.end?: HabitEnd` (set only on formed and dropped lines, whose `entry` stays null).
- Produces (tasks-file.ts): `Fields.habit: HabitMark | null`; `taskKey` includes the habit and its goal; `taskLines` writes `🌱` / `🌱 N` after `⏫`; `isUsableHabitRule(rule: RepeatRule | null): boolean` (not null, not `after`).
- Produces (done-file.ts): `habitEnd(line: string): HabitEnd | null`; `formedLine(title: string, on: ISODate): DoneLine`; `droppedLine(title: string, on: ISODate): DoneLine`; `doneLine` keeps `🌱` (no goal) for a habit.

- [ ] **Step 1: Write the failing tests**

In `tasks-file.test.ts` (`describe('habits (#44)')`):
- `parses 🌱 and 🌱 N`: `- [ ] Meditate 🌱 🔁 every day 📅 2026-10-26` → `habit: { goal: null }`, title `Meditate`; `- [ ] Gym 🌱 30 🔁 every week on Monday 📅 2026-10-26` → `goal: 30`; `🌱` after the rule and before `📅` also read (`- [ ] Read 🔁 every day 🌱 📅 2026-10-26`).
- `🌱 without a usable rule stays in the title`: `- [ ] Plant 🌱` → no habit, title `Plant 🌱`; same with `🔁 every 3 days when done`.
- `🌱 0 and 🌱 1000 are habits with the configured goal, the number stays in the title`.
- `round trip keeps unchanged habit lines byte for byte` (odd spacing, `🌱️` with VS16).
- `writes 🌱 after ⏫ and before 🔁`: an app-made important habit with goal 30 serializes as `- [ ] No phone ⏫ 🌱 30 🔁 every day 📅 2026-10-27`.

In `done-file.test.ts`:
- `doneLine keeps 🌱 without the goal`: `- [x] Gym 🌱 🔁 every week on Monday ✅ 2026-10-26`.
- `reads formed and dropped lines as ends, not entries`: `- [x] Read 20 pages 🌱 🏆 2026-10-26` → `entry: null`, `end: { kind: 'formed', title: 'Read 20 pages', on: '2026-10-26' }`; `- [-] Cold shower 🌱 ❌ 2026-07-20` → dropped; `- [-] Old task ❌ 2026-07-20` (no 🌱) → no end; all serialize back unchanged.
- `formedLine / droppedLine write the spec lines`.
- `sweepCompleted moves a 🏆 line from tasks.md unchanged`: tasks.md `# Tasks\n- [x] Read 🌱 🏆 2026-10-26\n` → done.md gets exactly that line, no ✅.
- `an undated ticked habit in tasks.md is swept keeping 🌱 and stays a habit on its next date`.

In `stats.test.ts`: `formed and dropped lines are not completions` (`all` counts only the ✅ line).

- [ ] **Step 2: Run** `pnpm --filter @omark/tasks-core test` — expect the new tests to FAIL (no `habit` field). Save one failing line for the PR.

- [ ] **Step 3: Implement.** `parseFields`: add `🌱` and `🏆` to `RULE_END`; take every `🌱` (with VS16) like `⏫`, the last `🌱 N` (1–999, `(?!\d)`) giving the goal, but only when `isDone` or the parsed rule is usable, else leave them in the title. On done lines take the `🏆` date with `takeDate`. `habitEnd`: a `- [x]` line with `🌱`, a valid `🏆` date and no `✅`, or a `- [-]` line (`/^- \[-\](?=[ \t]|$)(.*)$/`) with `🌱` and a valid `❌` date. `parseDone` sets `end`; `sweepCompleted` appends a habit-end block unchanged. `canonical` gets the habit flag.

- [ ] **Step 4: Run** `pnpm --filter @omark/tasks-core test` and `pnpm typecheck` — PASS, all old tests unchanged.

- [ ] **Step 5: Commit** `Read and write the habit marks in tasks.md and done.md`

### Task 2: Habits config

**Files:**
- Modify: `packages/tasks-core/src/config.ts`
- Test: `packages/tasks-core/test/config.test.ts`

**Interfaces:**
- Produces: `interface HabitConfig { maxInProgress: number; goal: number; missesInARow: number; missesPerAttempt: number | { percent: number } }`; `Config.habits: HabitConfig`; `DEFAULT_CONFIG.habits = { maxInProgress: 3, goal: 66, missesInARow: 1, missesPerAttempt: { percent: 10 } }`; `Command` gains `'habit'` (default `['h']`, added to `YIELDING`).

- [ ] **Step 1: Write the failing tests**
- `reads the habits section`: `habits:\n  maxInProgress: 0\n  goal: 30\n  missesInARow: 2\n  missesPerAttempt: 3\n` → those values; `missesPerAttempt: 25%` → `{ percent: 25 }`.
- `rejects bad habit values with the line`: `goal: 0` → error `habits.goal must be a whole number from 1 to 999` on that line; `missesPerAttempt: 120%` → `habits.missesPerAttempt must be a whole number from 0 to 999 or a percentage from 0% to 100%`; `habits:\n  foo: 1` → `Unknown setting "habits.foo"`; `habits: 3` → `habits must be a list of "setting: value" lines`.
- `shortcuts.habit defaults to h and yields`: an older config binding `h` to `today` still loads with no error and `habit: []`.
- `the default config.yaml parses to the defaults` (existing test, now with the habits block and `habit: h` added to `DEFAULT_CONFIG_YAML` with one comment line per key, wording from spec 11).

- [ ] **Step 2: Run** `pnpm --filter @omark/tasks-core test config` — FAIL.
- [ ] **Step 3: Implement** a `case 'habits'` in `parse` that walks the map like `shortcuts`, and `cloneDefaults` copying `habits`.
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `Read the habits settings from config.yaml`

### Task 3: The counting walk

**Files:**
- Create: `packages/tasks-core/src/habits.ts`; export from `src/index.ts`
- Test: `packages/tasks-core/test/habits.test.ts`

**Interfaces:**
- Consumes: Task 1's `HabitMark`, `DoneDoc`, `HabitEnd`; Task 2's `HabitConfig`; `matchesRule`, `addDays`, `daysBetween`, `dayOfWeek`.
- Produces:
  ```ts
  export interface HabitRules { goal: number; missesInARow: number; missesPerAttempt: number }
  export function habitRules(habit: HabitMark, config: HabitConfig): HabitRules
  export interface Period { start: ISODate; end: ISODate }
  export function periodOf(rule: RepeatRule, anchor: ISODate, d: ISODate): Period
  export type PeriodMark = 'done' | 'missed' | 'restart' | 'idle' | 'today'
  export interface HabitProgress {
    rules: HabitRules; count: number; best: number; bestAttempt: number | null; attempt: number;
    missesInARow: number; missesThisAttempt: number;
    since: ISODate | null;         // first completion of this attempt
    period: Period;                // the period holding today
    doneThisPeriod: boolean; restarted: boolean; lastChance: boolean;
    formedOn: ISODate | null;      // the completion that reached the goal
    marks: { period: Period; mark: PeriodMark }[]; // the last 28 periods, oldest first
  }
  export function walkHabit(completions: ISODate[], rule: RepeatRule, today: ISODate, rules: HabitRules): HabitProgress
  export function habitCompletions(title: string, done: DoneDoc, beforeLine?: number): ISODate[]
  export function habitProgress(task: Task, done: DoneDoc, today: ISODate, config: HabitConfig): HabitProgress
  export function formedEstimate(p: HabitProgress, rule: RepeatRule, today: ISODate): ISODate | null
  ```

- [ ] **Step 1: Write the failing tests** — a `progress(dates, today, rule = daily, rules = {66, 1, 6})` helper over `walkHabit`, then one `it` per row:
  - 5.3 table: `1,2,3 Oct / 3 Oct` → count 3; `1,2,4 / 4` → 3, missesThisAttempt 1, missesInARow 0; `1,2 / 4` → 2, lastChance true; `1,2 / 5` → count 0, best 2, attempt 2, restarted true; `1,2,5 / 5` → 1, attempt 2, since `2026-10-05`; `1 Oct twice / 1 Oct` → 1, doneThisPeriod true.
  - Weekly Mon/Wed/Fri: done Mon + Thu → 2; done Mon only, today Fri → 1 with missesThisAttempt 1.
  - `every week on Sunday` period is Sunday–Saturday (`periodOf`); `weekdays` Friday period is Fri–Sun.
  - Monthly `every month on the 15th`: done 15 Sep, 20 Oct, today 10 Nov → 2.
  - Stride `every 3 days` counted from the first completion: done 1, 4, 7 Oct → 3; done 1, 7 Oct (4 Oct period missed) → 2, misses 1.
  - Restart on misses per attempt: rules `{66, 1, 2}`, alternate done/missed for 6 days → restart at the third miss.
  - `missesInARow: 0` → the first miss restarts.
  - Best count and `bestAttempt` across two restarts.
  - Formed: rules goal 3, done 1, 2, 3 Oct → `formedOn` `2026-10-03`, walk stops.
  - `habitProgress` boundaries: completions before a `🏆` or `❌` line with the same title don't count; other titles don't count; a completion without `🌱` doesn't count.
  - Goal from `🌱 30` beats config; `missesPerAttempt { percent: 10 }` with goal 66 → 6, with goal 30 → 3; a number stays a number.
  - `marks`: `1,2 / 5` → `done, done, missed, restart, today`; capped at 28.
  - `formedEstimate`: daily, count 12 of 66, today done → today + 54 days.
  - A new habit (no completions): count 0, attempt 1, no last chance, `period` holds today.

- [ ] **Step 2: Run** `pnpm --filter @omark/tasks-core test habits` — FAIL (module missing).

- [ ] **Step 3: Implement.** Periods: for `daily`, `weekdays`, `weekly` without `n`, `monthly` without `n`, the period holding `d` starts at the latest date ≤ `d` that `matchesRule`, and ends the day before the next one. For stride rules (`every`, `yearly`, `weekly`/`monthly` with `n`) rule dates run from `anchor` (the first counted completion, or today when there is none) in both directions: `anchor + k·n` days/weeks, `anchor` moved `k·n` months, or the listed weekdays / rule day in weeks or months `k·n` from the anchor's. The walk is spec 5.2 as written: a period with a completion counts once and clears misses in a row; an ended empty period is a miss unless the attempt is waiting after a restart (`idle`); over either limit restarts (best = max, attempt + 1, wait for the next completion); today's empty period is `today`, not a miss. `lastChance` = today's period empty, an attempt running (`since !== null`, not restarted), and one more miss would break either limit.

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `Count habit progress from done.md`

### Task 4: Habit operations, sorting, quick add, history

**Files:**
- Create: `packages/tasks-core/src/habit-ops.ts`; export from `index.ts`
- Modify: `src/ops.ts` (`setRepeat`), `src/buckets.ts` (`tasksInBucket`), `src/quick-add.ts`
- Test: `test/habit-ops.test.ts`, `test/buckets.test.ts`, `test/quick-add.test.ts`, `test/merge.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  export function habitsInProgress(doc: TasksDoc): Task[]
  export function canStartHabit(doc: TasksDoc, config: HabitConfig): boolean  // maxInProgress 0 or fewer in progress
  export function setHabit(s: State, id: string, on: boolean): State           // on needs a usable rule, else s
  export function setHabitGoal(s: State, id: string, goal: number | null): State
  export function formHabit(s: State, id: string, today: ISODate): { state: State; task: Task; at: number } | null
  export function dropHabit(s: State, id: string, today: ISODate): State
  export function restoreTask(s: State, task: Task, at: number): State          // inserts at item index `at` (clamped)
  export function formedHabits(s: State, today: ISODate, config: HabitConfig): string[]  // ids whose progress has formedOn
  export interface FormedHabit { title: string; goal: number; first: ISODate; last: ISODate; days: number; attempts: number }
  export interface DroppedHabit { title: string; best: number; attempts: number; on: ISODate }
  export function habitHistory(done: DoneDoc, config: HabitConfig): { formed: FormedHabit[]; dropped: DroppedHabit[] } // newest first
  ```
  `QuickAdd.habit: boolean`; `ShortcutKind` gains `'habit'` (words `hab` / `habit`).

- [ ] **Step 1: Write the failing tests**
  - `setHabit on/off`: on adds `🌱` to a daily task; off removes `🌱` and its goal, nothing else in the line changes; on for a task with no rule or `when done` returns the same state.
  - `setRepeat to none or when done drops the habit` (Review Focus 3): the line has no `🌱` left anywhere.
  - `formHabit` removes the block (notes too), appends `formedLine`, returns the task and its index; `restoreTask` with that task minus `habit` puts it back where it was.
  - `dropHabit` removes the block and appends `- [-] {title} 🌱 ❌ {today}`.
  - `canStartHabit`: 2 of 3 → true, 3 of 3 → false, 4 of 3 → false, `maxInProgress: 0` → true.
  - `habitHistory`: a formed habit with one restart → `{ goal: 3, first, last, days, attempts: 2 }`; a dropped one → best and attempts; a dropped then re-added then formed title shows in both lists.
  - `tasksInBucket` orders important, then habits, then date.
  - `readQuickAdd('Meditate 10 min hab')` → `habit: true`, title `Meditate 10 min`; `habit` full word too; inside a typed 🔁 rule it is not a word.
  - `merge3 keeps one formed line both devices added` (Review Focus 2) via `mergeDoneText`.
- [ ] **Step 2: Run** `pnpm --filter @omark/tasks-core test` — FAIL.
- [ ] **Step 3: Implement** using `updateTask`/`readBack` patterns from `ops.ts` (export the two helpers it needs rather than copying them).
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `Add habit operations, sorting, the hab word and history`

### Task 5: Store

**Files:**
- Modify: `apps/tasks/src/lib/store.svelte.ts`, `src/lib/messages.ts`, `src/components/Toast.svelte`, `src/App.svelte` (pass `confirm`)
- Test: `apps/tasks/src/lib/store.test.ts`, `src/lib/messages.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces (AppStore):
  ```ts
  readonly habits: ReadonlyMap<string, HabitProgress>;   // every open habit task, by id
  readonly habitCount: { inProgress: number; max: number };
  readonly history: { formed: FormedHabit[]; dropped: DroppedHabit[] };
  add(title: string, when?: DateChoice, important?: boolean, habit?: boolean): boolean;
  setHabit(id: string, on: boolean): 'ok' | 'limit' | 'needsRule';
  makeHabit(id: string, rule: RepeatRule): void;   // the repeat picker's habit mode: rule + 🌱 in one undo step
  setHabitGoal(id: string, goal: number | null): void;
  drop(id) unchanged; remove(id) drops a habit;
  ```
  `Toast` gains `action?: { label: string; run: () => void }`. `StoreDeps.confirm?: (message: string) => boolean` (default `() => true`; App passes `window.confirm`). `edit` patch gains `confirmed?: boolean`.
- Messages (exact copy): `habitTick(title, count, goal, next, ctx)` → `Read 20 pages · 31/66 · next Tue`; `alreadyDone(span: 'today' | 'this week' | 'this period', next, ctx)` → `Already done today · next Tue`; `habitFormed(title, goal, days)` → `Habit formed: Read 20 pages · 66 in 71 days · moved to History`; `habitLimit(max)` → `3 habits in progress already. Finish or drop one first, or raise the limit in Settings.`; `addedNotHabit(max, title)` → `3 habits in progress already. Journal 5 lines added as a repeating task; make it a habit when one is formed or dropped.`; `nowHabit()` → `Now a habit`; `notHabit()` → `No longer a habit`; `droppedHabit(title)` → `Dropped habit · Cold shower`; `keptAsTask()` → `Kept as a repeating task`; `renameHabit(title)` → `Renaming restarts Meditate at 0. Rename?`; `habitGoal(goal)` → `Goal 30`.

- [ ] **Step 1: Write the failing tests** (store.test.ts, fake workspace as the file already does):
  - `ticking a habit twice in a day writes one line and says Already done today` (span: one-day period `today`, up to 7 days `this week`, else `this period`).
  - `the tick toast shows the count`.
  - `the goal-th tick forms the habit`: config goal 3, two seeded completions; complete → task gone, done.md ends with completion then `🏆` line, toast `Habit formed: …` with `action.label === 'Keep as task'`; `undo()` brings both files back; `action.run()` instead puts the task back without `🌱` and keeps the formed line.
  - `a habit formed on sync is formed once and offers only Keep as task` (Review Focus 4): an outside done.md with the third completion → after `refresh()` the task is gone, one `🏆` line, `toast.undo === false`; a second `refresh()` writes nothing more.
  - `remove() on a habit writes the dropped line`; `undo()` restores.
  - `setHabit at the limit returns 'limit' and toasts habitLimit`; `maxInProgress: 0` never refuses; no rule → `'needsRule'`, nothing changes.
  - `add with habit at the limit adds a daily repeating task without 🌱 and toasts addedNotHabit`; under the limit adds `🌱 🔁 every day` dated today when no rule was typed.
  - `renaming a habit with progress asks first`: `confirm` returning false leaves the title; true renames.
  - `habits` map updates when the clock passes midnight (`tick()`).
- [ ] **Step 2: Run** `pnpm --filter tasks test store` — FAIL.
- [ ] **Step 3: Implement.** `habits` is `$derived` from `state`, `ctx.today` and `config.habits`. One `settleHabits(message?)` forms every id from `formedHabits` and runs after load, after `adopt()` brought changes or a new config, and after `complete`/`setHabitGoal`; on load and adopt it replaces the state without an undo entry and toasts with `undo: false` plus Keep as task; after `complete` it is part of the same commit. `Toast.svelte` renders the action button before Undo.
- [ ] **Step 4: Run** `pnpm --filter tasks test` and `pnpm typecheck` — PASS. **Step 5: Commit** `Count, form and drop habits in the store`

### Task 6: Colours and habit rows

**Files:**
- Modify: `apps/tasks/src/styles/tokens.css`, `src/components/TaskRow.svelte`, `src/components/Bucket.svelte`
- Create: `apps/tasks/src/lib/contrast.test.ts`, `apps/tasks/e2e/habits.spec.ts`
- Modify: `packages/tasks-core/src/labels.ts` (new `habitLabel`), test `test/labels.test.ts`

**Interfaces:**
- Produces: tokens `--habit`, `--habit-ink`, `--habit-soft` (light and both dark blocks); `habitLabel(t: Task, p: HabitProgress, ctx: WeekCtx, style: DateLabelStyle): { count: string; when: string | null; tag: 'last chance' | `restarted · best ${number}` | null }` (`12/66`; `when` = the date for a later bucket, `by Sun` for a multi-day period still open today, null in Today). `TaskRow` takes `habit?: HabitProgress`; row has `data-habit="true"`, the tag as `data-testid="habit-tag"`, the count as `data-testid="habit-count"`.

- [ ] **Step 1: Write the failing tests**
  - `contrast.test.ts`: reads `tokens.css`, checks `--habit-ink` / `--habit` on `--surface`, `--sel`, `--habit-soft` ≥ 4.5:1 in light and dark.
  - `labels.test.ts`: `habitLabel` for on track (`4/30`, null, null), last chance, restarted · best 9, done and in Tomorrow (`31/66`, `Tue`), weekly open all week (`3/15`, `by Sun`), a missed-period date never reads as overdue.
  - `habits.spec.ts` (both projects): `add a habit, tick it, see 1/66` (`Meditate 10 min hab` → row with `data-habit`, `0/66`; tick → `1/66` in Tomorrow; done.md `- [x] Meditate 10 min 🌱 🔁 every day ✅ 2026-10-16`); `a seeded history with a miss shows last chance`; `two misses in a row show restarted · best 2`; `ticking twice says Already done today and writes once`.
- [ ] **Step 2: Run** `pnpm --filter tasks test contrast` and `pnpm e2e -- habits` — FAIL.
- [ ] **Step 3: Implement** the row per `RowStates.dc.html`: violet circle and title, no `↻`, bar on desktop only, red tag desktop / red dot phone. `Bucket` passes `store.habits.get(task.id)`.
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `Show habit rows in violet with their progress`

### Task 7: Habits group and History

**Files:**
- Create: `apps/tasks/src/components/HabitsGroup.svelte`, `src/components/HabitHistory.svelte`
- Modify: `src/components/TaskListView.svelte`, `src/components/WeekBoardView.svelte`, `src/App.svelte` (opens History)
- Test: `apps/tasks/e2e/habits.spec.ts`

**Interfaces:**
- Consumes: `store.habits`, `store.habitCount`, `store.history`, `formedEstimate`.
- Produces: `HabitsGroup` props `{ store; variant: 'list' | 'cards'; onopen: (id) => void; onhistory: () => void }`, `data-testid="habits-group"`, header count `data-testid="habits-count"` (`3 of 3`, `class:over` red when over; `3` alone when `max` is 0), link `data-testid="habits-history"`. `HabitHistory` is a `Sheet` on the phone and a `<dialog>` on desktop, `data-testid="habit-history"`, sections In progress, Formed, Dropped. The group hides when there are no habits and no history.

- [ ] **Step 1: Write the failing e2e tests** (both projects unless noted): `the Habits group lists habits with their state line`; `over the limit the header shows 4 of 3 in red`; `History lists formed and dropped habits` (seeded `🏆` and `❌` lines); `the board rail shows the group` (desktop only); `phone shows habit cards under the stats line` (iphone only).
- [ ] **Step 2: Run** `pnpm e2e -- habits` — FAIL.
- [ ] **Step 3: Implement** per `Main.dc.html`, `Phone.dc.html`, `History.dc.html`: list side pane above Important, not urgent; board rail above it; phone cards scroll sideways, a tap opens the edit sheet.
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `Add the Habits group and History`

### Task 8: Detail block, drop, not a habit, rename

**Files:**
- Create: `apps/tasks/src/components/HabitBlock.svelte`
- Modify: `src/components/TaskDetail.svelte`, `src/components/EditSheet.svelte`, `src/lib/task-edit.svelte.ts`
- Test: `apps/tasks/e2e/habits.spec.ts`, `src/lib/store.test.ts` (rename hold)

**Interfaces:**
- Consumes: `store.habits`, `setHabit`, `setHabitGoal`, `remove`, `formedEstimate`.
- Produces: `HabitBlock` props `{ store; task; progress }`, `data-testid="habit-block"`, 28 squares `data-testid="habit-period"` with `data-mark`, buttons Goal (number field, empty = configured), **Not a habit**, **Drop habit**. `createTaskEdit` `commit(settle?: boolean, final?: boolean)`: a habit with counted completions holds a title edit until `final` (blur, Enter, sheet close, unmount); the registered pending commit is not final.

- [ ] **Step 1: Write the failing tests**
  - store/task-edit test: `a pending flush does not rename a habit` (Review Focus 5).
  - e2e: `the detail shows 12 of 66, the warning and 28 squares`; `Drop habit writes the dropped line and History lists it`; `Not a habit removes only 🌱`; `Goal 30 writes 🌱 30`; `goal 3 forms on the third tick, Keep as task puts it back` (config `habits:\n  goal: 3`); `renaming asks first` (dialog dismissed keeps the title).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** per `Detail.dc.html`. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Add the habit block to the detail and edit sheet`

### Task 9: Ways in: h, hab, toggles, repeat picker

**Files:**
- Modify: `src/lib/commands.svelte.ts`, `src/components/Hints.svelte`, `src/components/ShortcutField.svelte`, `src/components/AddSheet.svelte`, `src/components/AddInput.svelte`, `src/components/MoveOptions.svelte`, `src/components/MoveSheet.svelte`, `src/components/EditSheet.svelte`, `src/components/RepeatPicker.svelte`, `src/App.svelte`
- Test: `src/lib/keys.test.ts`, `apps/tasks/e2e/habits.spec.ts`

**Interfaces:**
- Consumes: `store.setHabit`, `store.makeHabit`, `store.add(…, habit)`, `QuickAdd.habit`.
- Produces: `ShellCommand` gains `'habitRepeat'` (opens `RepeatPicker` with `habit` prop: `when done` hidden, `every day` preselected, save calls `makeHabit`). Words shown violet (`b.hab`). Add-sheet Habit toggle beside Important; move sheet "Make it a habit" / "Not a habit" (detail `hab`).

- [ ] **Step 1: Write the failing tests** — keys.test: `h` maps to `habit`. e2e: `h toggles a habit on a repeating task and off again`; `h on a task with no rule opens the repeat picker without when done, and saving makes a habit`; `h on a fourth habit is refused with the message` (`habitLimit`); `typing hab at the limit adds an ordinary repeating task`; `the add-sheet Habit toggle and the move-sheet entry work` (iphone only); `a habit's repeat picker has no when done`; `stats count a habit tick` (Stats `Today 1`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Make habits with h, hab and the sheets`

### Task 10: Docs, skill, settings note

**Files:**
- Modify: `.claude/skills/taskapp-files/SKILL.md` (and its references if any), `doc/TaskApp v1 spec.md` (3.3, 3.4, 5.1, 9.1, 9.2, 9.4, 10, 11), `README.md`, `packages/tasks-core/test/skill-examples.test.ts`
- Test: `skill-examples.test.ts` (examples in the skill parse as documented)

- [ ] **Step 1: Write the failing test**: the skill's new habit examples (a habit line, a completion, a formed and a dropped line) parse to the documented fields.
- [ ] **Step 2: Run** — FAIL. **Step 3: Write the docs** (spec 12: how to write `🌱`, completing keeps `🌱`, the period and restart rules for "how is my meditation going?", the app writes `🏆` itself, at the limit Claude says so instead of adding a fourth `🌱`). **Step 4: Run** — PASS.
- [ ] **Step 5:** If #45's shared settings schema is on `main`, merge main and add the Habits section there; otherwise comment on #45 listing `habits.maxInProgress`, `habits.goal`, `habits.missesInARow`, `habits.missesPerAttempt`, `shortcuts.habit` with ranges and defaults.
- [ ] **Step 6: Commit** `Document habits`

## Tests I'll write first

Listed per task above; the headline ones: the six 5.3 rows in `habits.test.ts`, the byte round trips in `tasks-file.test.ts` / `done-file.test.ts`, the store's once-per-period and formed tests, and `habits.spec.ts` on both projects.

## Risks

- **Format:** a `🌱` in a title today becomes a habit field when the task has a rule. Unlikely in AL's files; the round trip test keeps unchanged lines byte for byte anyway.
- **Merge:** nothing new is stored, so devices can't disagree; two identical formed lines collapse (tested).
- **Performance:** the walk runs per habit on every state change over `done.md`; at most a few habits and a few hundred periods each.
- **Rename hold:** a habit title typed but never left (page killed) is lost; the notes still save.
- **Shared files with #45:** `config.ts` and `DEFAULT_CONFIG_YAML` get a small, separate block.

## Out of scope

Spec 15 (reminders, amounts, slip habits, per-habit miss settings, charts and long history, reopening from History). Already in the spec; nothing new for the backlog.
