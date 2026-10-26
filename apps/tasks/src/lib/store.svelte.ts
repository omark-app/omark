import { untrack } from 'svelte';
import { BRAND } from '../brand.ts';
import {
  addDays,
  addTask,
  bucketName,
  bucketOf,
  BUCKETS,
  canStartHabit,
  carryIds,
  completeTask,
  computeStats,
  daysBetween,
  deleteTask,
  dropHabit,
  editTask,
  findTask,
  formedHabits,
  formHabit,
  habitHistory,
  habitProgress,
  habitsInProgress,
  IMPORTANT_GROUP,
  isUsableHabitRule,
  mergeDoneText,
  mergeTasksText,
  metaLabel,
  moveToBucket,
  packBoard,
  parseConfig,
  parseDone,
  parseTasks,
  planDrop,
  restoreTask,
  serializeDone,
  serializeTasks,
  setDate as setDateOp,
  setHabit as setHabitOp,
  setHabitGoal as setHabitGoalOp,
  setImportant as setImportantOp,
  setRepeat as setRepeatOp,
  sweepCompleted,
  tasksInBucket,
  weekCtx,
} from '@omark/tasks-core';
import type {
  BucketKey,
  Config,
  ConfigError,
  DropOutcome,
  DropTarget,
  DroppedHabit,
  FormedHabit,
  HabitProgress,
  ISODate,
  DateChoice,
  RepeatRule,
  State,
  Stats,
  Task,
  WeekCtx,
} from '@omark/tasks-core';
import type { SyncStatus } from '@omark/storage';
import type { Workspace } from './workspace.ts';
import type { Clock } from './clock.ts';
import * as msg from './messages.ts';

export type View = 'list' | 'board';
export interface ToastAction {
  label: string;
  run: () => void;
}
export interface Toast {
  message: string;
  undo: boolean;
  /** A second button before Undo (Keep as task); clicking it runs `run` and hides the toast. */
  action?: ToastAction;
}

/**
 * The one place where UI actions become core operations. Every change pushes the previous `State` on the
 * undo stack, shows a toast with Undo and schedules a debounced save.
 */
export interface AppStore {
  readonly state: State;
  readonly ctx: WeekCtx;
  readonly config: Config;
  readonly configError: ConfigError | null;
  readonly selectedId: string | null;
  /** Open tasks per bucket. */
  readonly counts: Record<BucketKey, number>;
  /**
   * Whether each bucket is folded in the current view: the user's own fold or unfold wins; otherwise an
   * empty bucket is folded, and so is one in `foldedOnOpen` (but not the dated ones on the board).
   * Important, not urgent never folds (#38).
   */
  readonly folded: Record<BucketKey, boolean>;
  /**
   * The week board's columns, in bucket order (spec 11.2). Packed when the board is first shown after the
   * app opens and again on each switch to it (and once more when the first pull after a start from the
   * cache brings changes), then kept while the user works: a bucket that fills up or empties keeps its column.
   */
  readonly boardColumns: BucketKey[][];
  readonly view: View;
  readonly toast: Toast | null;
  readonly status: SyncStatus;
  /** When every file was last in step with OneDrive (status `saved`), here or in an earlier session. */
  readonly syncedAt: Date | null;
  readonly stats: Stats;
  /** Set when the offline cache could not be used (e.g. iOS private mode); edits then live only in memory. */
  readonly cacheWarning: string | null;
  /** Every open habit task's progress, by id (habits spec 5). */
  readonly habits: ReadonlyMap<string, HabitProgress>;
  /** Habits in progress against the limit (0 = no limit, spec 10.1). */
  readonly habitCount: { inProgress: number; max: number };
  /** The formed and dropped habits of done.md, newest first (spec 9.5). */
  readonly history: { formed: FormedHabit[]; dropped: DroppedHabit[] };
  /**
   * Adds a task (to the configured bucket by default); false when the title is blank. `habit` (a typed
   * `hab`) also makes it a habit, with `🔁 every day` when no rule was typed; at the limit it is added as
   * an ordinary repeating task and the toast says so (spec 10.1).
   */
  add(title: string, when?: DateChoice, important?: boolean, habit?: boolean): boolean;
  select(id: string | null): void;
  selectNext(delta: 1 | -1): void;
  moveTo(id: string, when: DateChoice): void;
  setDate(id: string, date: ISODate | null, beforeId?: string | null): void;
  /** Applies a move or reorder; a drop on Later changes nothing and returns `pickDate` for the UI to open. */
  drop(id: string, target: DropTarget): DropOutcome;
  /** A habit already done in today's period is not completed again; the toast says so (habits spec 6). */
  complete(id: string): void;
  /** Deletes a task; a habit is dropped instead (habits spec 8). */
  remove(id: string): void;
  /**
   * Trims the title and notes and drops blank notes; a blank title or an edit that changes nothing is ignored.
   * `when` and `important` come from shortcut words typed in the title (issue #19) and land in the same change.
   * Renaming a habit with progress asks first (`deps.confirm`) unless `confirmed` says the UI already did.
   */
  edit(
    id: string,
    patch: { title: string; notes: string[]; when?: DateChoice | null; important?: boolean; confirmed?: boolean },
  ): void;
  setRepeat(id: string, rule: RepeatRule | null): void;
  /** Flags or unflags a task as Important (issue #19). */
  setImportant(id: string, important: boolean): void;
  /**
   * Makes the task a habit or an ordinary repeating task again. Turning it on needs a usable rule
   * (`needsRule`: nothing changes, so the UI can open the repeat picker) and room under the limit
   * (`limit`: a toast says so).
   */
  setHabit(id: string, on: boolean): 'ok' | 'limit' | 'needsRule';
  /** The repeat picker's habit mode: the rule and 🌱 in one undo step, within the limit. */
  makeHabit(id: string, rule: RepeatRule): void;
  /** The habit's own goal, or null for the configured one. */
  setHabitGoal(id: string, goal: number | null): void;
  undo(): void;
  /**
   * Registers a callback that commits input still waiting in the UI (e.g. debounced typing). `flush()` and
   * `refresh()` run every callback before they stage, and `refresh()` again before it merges what it read.
   * Returns the unregister function.
   */
  registerPending(fn: () => void): () => void;
  toggleFold(key: BucketKey): void;
  /** Phones always stay on the list. */
  switchView(): void;
  /**
   * Stages pending edits, re-reads the files and merges outside changes in (clearing undo); also runs
   * `tick`. One at a time: a call while a refresh runs shares it. Never rejects: failures show in `status`.
   */
  refresh(): Promise<void>;
  /**
   * Puts pending edits in the cache now (the upload continues in the background). Never rejects: if the
   * cache write fails the edits stay pending and the next flush retries.
   */
  flush(): Promise<void>;
  /** Recomputes the week context from the clock (call at midnight and on focus). */
  tick(): void;
  /**
   * True when leaving the page now (e.g. the sign-in redirect) would lose edits: some are neither on
   * OneDrive nor in a cache that survives a reload. Call after `flush()`.
   */
  wouldLoseEdits(): boolean;
}

export interface StoreDeps {
  workspace: Workspace;
  clock: Clock;
  isPhone: () => boolean;
  cacheWarning?: string | null;
  /** True when the cache outlives the page (IndexedDB); a memory cache is lost on reload. Default false. */
  durableCache?: boolean;
  /** Keeps `syncedAt` across sessions (the app uses localStorage). */
  syncedAtStore?: { load(): Date | null; save(at: Date): void };
  /** Asks the user a yes/no question (the app uses `window.confirm`). Default: always yes. */
  confirm?: (message: string) => boolean;
}

const TOAST_MS = 4200;
const UNDO_LIMIT = 100;
/** On the week board the dated buckets start open whatever `foldedOnOpen` says (an empty one still folds). */
const BOARD_OPEN: readonly BucketKey[] = ['today', 'tomorrow', 'week', 'next'];
const BOARD_COLUMNS = 4;

/** The date buckets and the Important, not urgent group (#38). */
const ALL_KEYS: readonly BucketKey[] = [...BUCKETS.map((b) => b.key), IMPORTANT_GROUP.key];

const byBucket = <T>(value: (key: BucketKey) => T): Record<BucketKey, T> =>
  Object.fromEntries(ALL_KEYS.map((key) => [key, value(key)])) as Record<BucketKey, T>;

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Parsed files with any `- [x]` lines in tasks.md swept into done.md. */
function loadState(doc: State['doc'], doneText: string, today: ISODate): State {
  const state: State = { doc, done: parseDone(doneText) };
  return sweepCompleted(state, today) ?? state;
}

export async function createStore(deps: StoreDeps): Promise<AppStore> {
  const { workspace, clock, isPhone } = deps;
  const confirm = deps.confirm ?? (() => true);
  const snap = await workspace.open();

  // The file texts the store's edits start from (Ruling 21): what it last adopted or saved.
  const base = { tasks: snap.tasks, done: snap.done };
  let configText = snap.config;
  const first = parseConfig(snap.config);
  const firstCtx = weekCtx(clock.now(), first.config.firstDayOfWeek);

  let config = $state.raw<Config>(first.config);
  let configError = $state.raw<ConfigError | null>(first.error);
  let ctx = $state.raw<WeekCtx>(firstCtx);
  let state = $state.raw<State>(loadState(parseTasks(snap.tasks), snap.done, firstCtx.today));
  let selectedId = $state<string | null>(null);
  /** Fold state resets on every open (spec 4.1): the config as it was then, and the user's toggles since. */
  const foldedOnOpen = first.config.foldedOnOpen;
  let toggled = $state.raw<Partial<Record<BucketKey, boolean>>>({});
  let view = $state<View>(isPhone() ? 'list' : first.config.defaultView);
  const counts = $derived(byBucket((key) => tasksInBucket(state.doc, key, ctx).length));
  const foldsIn = (v: View): Record<BucketKey, boolean> =>
    byBucket(
      (key) =>
        // Important, not urgent never folds: it is there to be seen (#38).
        key !== IMPORTANT_GROUP.key &&
        (toggled[key] ??
          (counts[key] === 0 || (foldedOnOpen.includes(key) && !(v === 'board' && BOARD_OPEN.includes(key))))),
    );
  const folded = $derived(foldsIn(view));
  /** Bumped to pack the board again; the packing itself reads nothing reactively, so work never moves it. */
  let packs = $state(0);
  let packed: { packs: number; columns: BucketKey[][] } | null = null;
  /** A start from the cache packs again when the first successful pull brings changes. */
  let repackOnPull = snap.fromCache;
  let toast = $state.raw<Toast | null>(null);
  let status = $state<SyncStatus>(workspace.status());
  // Opening without a cache pulled before this point, so a `saved` status here is a fresh sync.
  let syncedAt = $state.raw<Date | null>(status === 'saved' ? clock.now() : (deps.syncedAtStore?.load() ?? null));
  const stats = $derived(computeStats(state.done, ctx.today));
  const habits = $derived(
    new Map(habitsInProgress(state.doc).map((t) => [t.id, habitProgress(t, state.done, ctx.today, config.habits)])),
  );
  const habitCount = $derived({ inProgress: habitsInProgress(state.doc).length, max: config.habits.maxInProgress });
  const history = $derived(habitHistory(state.done, config.habits));
  /** The user changed something that has not reached OneDrive since (cleared when all is saved). */
  let unsynced = false;
  workspace.onStatus((s) => {
    status = s;
    if (s === 'saved' && !isDirty()) unsynced = false;
    if (s === 'saved') {
      syncedAt = clock.now();
      deps.syncedAtStore?.save(syncedAt);
    }
  });

  let undoStack: State[] = [];
  const pending = new Set<() => void>();
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Staging and adopting refresh results run one at a time, each seeing the bases the previous one left. */
  let chain: Promise<void> = Promise.resolve();

  const serial = (op: () => Promise<void>): Promise<void> => {
    const run = chain.then(op);
    chain = run.catch(() => {});
    return run;
  };

  // ---- toasts, saving -------------------------------------------------------------------------------

  /** Shows a toast; its `action` button also hides it before it runs. */
  function show(message: string, undo: boolean, action?: ToastAction): void {
    const hideAndRun = (a: ToastAction): ToastAction => ({
      label: a.label,
      run: () => {
        toast = null;
        clearTimeout(toastTimer);
        a.run();
      },
    });
    toast = action ? { message, undo, action: hideAndRun(action) } : { message, undo };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, TOAST_MS);
  }

  function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void flush();
    }, config.saveDelaySeconds * 1000);
  }

  const isDirty = (): boolean =>
    serializeTasks(state.doc) !== base.tasks || serializeDone(state.done) !== base.done;

  /**
   * Stages each file whose text differs from its base (Ruling 23): resolves once the edits are in the
   * cache; the upload runs in the background. A rejected stage leaves the bases, so it is retried.
   */
  async function stageNow(): Promise<void> {
    const tasks = serializeTasks(state.doc);
    const done = serializeDone(state.done);
    const files: Parameters<Workspace['stage']>[0] = {};
    if (tasks !== base.tasks) files.tasks = { text: tasks, base: base.tasks };
    if (done !== base.done) files.done = { text: done, base: base.done };
    if (!files.tasks && !files.done) return;
    try {
      await workspace.stage(files);
    } catch {
      // A cache write failed (status shows offline). Replaying the same edit on the same base is
      // harmless (the merge finds the change already there), so the next flush simply sends it again.
      return;
    }
    if (files.tasks) base.tasks = tasks;
    if (files.done) base.done = done;
  }

  function applyConfig(text: string): void {
    configText = text;
    const parsed = parseConfig(text);
    config = parsed.config;
    configError = parsed.error;
    tick();
  }

  /**
   * Brings outside changes in after a refresh. Runs on the chain and reads the workspace's texts as they
   * are now (every staged edit plus whatever was absorbed from the remote), never the text the pull
   * returned earlier: a flush during the read may have staged more since. Against the current bases,
   * that text differs only by outside changes, and the state only by edits not yet staged.
   *
   * Input typed while the read was in flight is committed first, so it is a local change in the merge:
   * if the remote changed the same task, both versions are kept and the local one (identical to the
   * state's) keeps the task's id, so the open detail or edit sheet stays on it. True when outside changes
   * came in.
   */
  function adopt(): boolean {
    for (const fn of [...pending]) fn();
    const next = workspace.texts();
    const newConfig = next.config !== configText;
    if (newConfig) applyConfig(next.config);
    if (next.tasks === base.tasks && next.done === base.done) {
      // A lower goal or looser miss rules can form a habit.
      if (newConfig) settleOutside();
      return false;
    }

    const localTasks = serializeTasks(state.doc);
    const localDone = serializeDone(state.done);
    const tasksText = localTasks === base.tasks ? next.tasks : mergeTasksText(base.tasks, localTasks, next.tasks);
    const doneText = localDone === base.done ? next.done : mergeDoneText(base.done, localDone, next.done);
    base.tasks = next.tasks;
    base.done = next.done;
    // When the merge equals what we hold (e.g. only our own failed-to-cache edit came back), nothing came
    // in from outside: keep state and undo.
    const outside = tasksText !== localTasks || doneText !== localDone;
    if (outside) {
      state = loadState(carryIds(state.doc, parseTasks(tasksText)), doneText, ctx.today);
      undoStack = [];
      if (selectedId !== null && !findTask(state, selectedId)) selectedId = null;
    }
    if (outside || newConfig) settleOutside();
    if (isDirty()) scheduleSave();
    return outside;
  }

  // ---- selection -------------------------------------------------------------------------------------

  const isOpen = (key: BucketKey): boolean => !folded[key];

  /**
   * The open buckets' tasks, then Important, not urgent in the list (after the buckets). The board's rail
   * shows the group only while no task is open, so j/k there stay on the board.
   */
  const visibleTasks = (): Task[] =>
    ALL_KEYS.filter((key) => isOpen(key) && !(view === 'board' && key === IMPORTANT_GROUP.key))
      .flatMap((key) => tasksInBucket(state.doc, key, ctx));

  /** The task to select when `id` leaves the visible list: the next one, else the previous one. */
  function neighbour(id: string): string | null {
    const vis = visibleTasks();
    const i = vis.findIndex((t) => t.id === id);
    // Not in the list (a group task on the board): nothing to move on to.
    return i < 0 ? null : ((vis[i + 1] ?? vis[i - 1])?.id ?? null);
  }

  /** After a change to `id`: if it was selected and is now gone or folded away, select `fallback`. */
  function keepVisible(id: string, fallback: string | null): void {
    if (selectedId !== id) return;
    const t = findTask(state, id);
    if (!t || !isOpen(bucketOf(t, ctx))) selectedId = fallback;
  }

  // ---- changes ---------------------------------------------------------------------------------------

  /**
   * Makes `next` the state with undo, a toast and a save. False (and nothing happens) if nothing changed.
   * A habit the change brought to its goal is formed in the same step, and the toast says so instead.
   */
  function commit(next: State, message: string): boolean {
    const formed = settle(next);
    if (formed) next = formed.state;
    // A change that alters neither file (moving a task to the bucket it is in, setting the same
    // repeat, dropping a task where it already is) gets no toast and no undo entry.
    if (
      next === state ||
      (serializeTasks(next.doc) === serializeTasks(state.doc) &&
        serializeDone(next.done) === serializeDone(state.done))
    ) {
      return false;
    }
    undoStack.push(state);
    unsynced = true;
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    state = next;
    show(formed?.message ?? message, true, formed?.keep);
    scheduleSave();
    return true;
  }

  // ---- habits ----------------------------------------------------------------------------------------

  /**
   * Forms every open habit of `s` that has reached its goal (habits spec 7): it leaves tasks.md and done.md
   * gets its 🏆 line, after which the count starts again, so a habit is never formed twice. Null when none
   * had. The toast is for the last one formed, and its Keep as task puts that one back without 🌱.
   */
  function settle(s: State): { state: State; message: string; keep: ToastAction } | null {
    let out = s;
    let formed: { message: string; keep: ToastAction } | null = null;
    for (const id of formedHabits(s, ctx.today, config.habits)) {
      const task = findTask(out, id)!;
      const p = habitProgress(task, out.done, ctx.today, config.habits);
      // Not formed any more when an earlier habit of the same title was.
      const r = p.formedOn === null ? null : formHabit(out, id, ctx.today);
      if (!r) continue;
      out = r.state;
      const days = daysBetween(p.since ?? ctx.today, ctx.today) + 1;
      formed = { message: msg.habitFormed(task.title, p.rules.goal, days), keep: keepAsTask(r.task, r.at) };
    }
    return formed && { state: out, ...formed };
  }

  function keepAsTask(task: Task, at: number): ToastAction {
    const { habit: _, ...plain } = task;
    return { label: 'Keep as task', run: () => void commit(restoreTask(state, plain, at), msg.keptAsTask()) };
  }

  /**
   * Forms the habits that reached their goal outside the app (seen on open or in a refresh, Review Focus 4).
   * There is no step to undo back to, so the toast offers only Keep as task.
   */
  function settleOutside(): void {
    const formed = settle(state);
    if (!formed) return;
    state = formed.state;
    // An older state would bring the formed habit back unformed.
    undoStack = [];
    if (selectedId !== null && !findTask(state, selectedId)) selectedId = null;
    show(formed.message, false, formed.keep);
    scheduleSave();
  }

  /** True when another habit may start; otherwise the toast says why (spec 10.1). */
  function roomForHabit(): boolean {
    if (canStartHabit(state.doc, config.habits)) return true;
    show(msg.habitLimit(config.habits.maxInProgress), false);
    return false;
  }

  function setHabit(id: string, on: boolean): 'ok' | 'limit' | 'needsRule' {
    const task = findTask(state, id);
    if (!task || (task.habit !== undefined) === on) return 'ok';
    if (on && !isUsableHabitRule(task.repeat)) return 'needsRule';
    if (on && !roomForHabit()) return 'limit';
    const fallback = neighbour(id);
    if (commit(setHabitOp(state, id, on), on ? msg.nowHabit() : msg.notHabit())) keepVisible(id, fallback);
    return 'ok';
  }

  function makeHabit(id: string, rule: RepeatRule): void {
    const task = findTask(state, id);
    if (!task) return;
    if (!isUsableHabitRule(rule)) return setRepeat(id, rule);
    if (task.habit === undefined && !roomForHabit()) return;
    const fallback = neighbour(id);
    const next = setHabitOp(setRepeatOp(state, id, rule, ctx.today), id, true);
    if (commit(next, task.habit ? msg.repeats(rule) : msg.nowHabit())) keepVisible(id, fallback);
  }

  function setHabitGoal(id: string, goal: number | null): void {
    const fallback = neighbour(id);
    if (commit(setHabitGoalOp(state, id, goal), msg.habitGoal(goal ?? config.habits.goal))) keepVisible(id, fallback);
  }

  function movedMessage(s: State, id: string): string {
    const t = findTask(s, id)!;
    return msg.moved(bucketName(bucketOf(t, ctx)), metaLabel(t, ctx, config.dateLabels).text);
  }

  /** Commits a change that may move task `id` to another bucket. */
  function commitMove(id: string, next: State): void {
    const fallback = neighbour(id);
    if (commit(next, movedMessage(next, id))) keepVisible(id, fallback);
  }

  function add(title: string, when: DateChoice = config.newTaskBucket, important = false, habit = false): boolean {
    const res = addTask(state, title, when, ctx, undefined, important);
    if (!res) return false;
    let next = res.state;
    let message: string | null = null;
    if (habit) {
      const typed = findTask(next, res.id)!;
      // `hab` with no rule typed means every day; the date `when` gave stays (Someday becomes today).
      if (!typed.repeat) next = setRepeatOp(next, res.id, { type: 'daily' }, ctx.today);
      // A typed `when done` rule can't have a habit: the task is kept as typed.
      if (isUsableHabitRule(findTask(next, res.id)!.repeat)) {
        if (canStartHabit(state.doc, config.habits)) next = setHabitOp(next, res.id, true);
        else message = msg.addedNotHabit(config.habits.maxInProgress, typed.title);
      }
    }
    commit(next, message ?? msg.added(bucketName(bucketOf(findTask(next, res.id)!, ctx))));
    return true;
  }

  function moveTo(id: string, when: DateChoice): void {
    if (!findTask(state, id)) return;
    commitMove(id, moveToBucket(state, id, when, ctx));
  }

  function setDate(id: string, date: ISODate | null, beforeId?: string | null): void {
    if (!findTask(state, id)) return;
    // No date is Someday, which also takes a task out of Important, not urgent (#38).
    commitMove(id, date === null ? moveToBucket(state, id, 'someday', ctx, beforeId) : setDateOp(state, id, date, beforeId));
  }

  function drop(id: string, target: DropTarget): DropOutcome {
    const out = planDrop(state, id, target, ctx);
    if (out.kind === 'reorder') commit(out.state, msg.reordered(out.sameDate, out.sameFlag));
    else if (out.kind === 'move') commitMove(id, out.state);
    return out;
  }

  function complete(id: string): void {
    const task = findTask(state, id);
    if (!task) return;
    const before = task.habit ? habitProgress(task, state.done, ctx.today, config.habits) : null;
    if (before?.doneThisPeriod) {
      // One repetition per period: a second tick would look like progress (habits spec 6).
      const { start, end } = before.period;
      const days = daysBetween(start, end) + 1;
      show(msg.alreadyDone(days === 1 ? 'today' : days === 7 ? 'this week' : 'this period', addDays(end, 1), ctx), false);
      return;
    }
    const fallback = neighbour(id);
    const from = bucketOf(task, ctx);
    const res = completeTask(state, id, ctx.today);
    commit(res.state, completedMessage(task, res));
    // A repeating task that moved on to another bucket counts as having left (prototype).
    const after = findTask(state, id);
    if (selectedId === id && (!after || bucketOf(after, ctx) !== from)) selectedId = fallback;
    else keepVisible(id, fallback);
  }

  /** `Done · …`, or for a habit its count after the tick. */
  function completedMessage(task: Task, res: { state: State; next: ISODate | null }): string {
    if (!res.next) return msg.done(task.title);
    const after = task.habit ? findTask(res.state, task.id) : null;
    if (!after) return msg.doneRepeat(res.next, ctx);
    const p = habitProgress(after, res.state.done, ctx.today, config.habits);
    return msg.habitTick(task.title, p.count, p.rules.goal, res.next, ctx);
  }

  function remove(id: string): void {
    const task = findTask(state, id);
    if (!task) return;
    const fallback = neighbour(id);
    // Deleting a habit drops it: done.md keeps a ❌ line for History (habits spec 8).
    const [next, message] = task.habit
      ? [dropHabit(state, id, ctx.today), msg.droppedHabit(task.title)]
      : [deleteTask(state, id), msg.deleted(task.title)];
    if (commit(next, message)) keepVisible(id, fallback);
  }

  function edit(
    id: string,
    patch: { title: string; notes: string[]; when?: DateChoice | null; important?: boolean; confirmed?: boolean },
  ): void {
    const task = findTask(state, id);
    if (!task) return;
    const title = patch.title.trim();
    const notes = patch.notes.map((n) => n.trim()).filter((n) => n !== '');
    const moves = patch.when != null;
    const flags = patch.important === true && task.important !== true;
    if (title === '' || (title === task.title && sameList(notes, task.notes) && !moves && !flags)) return;
    let next = title === task.title && sameList(notes, task.notes) ? state : editTask(state, id, { title, notes });
    if (moves) next = moveToBucket(next, id, patch.when!, ctx);
    if (flags) next = setImportantOp(next, id, true);
    const after = findTask(next, id);
    // Progress is found by title, so a rename starts a habit at 0 (habits spec 8).
    if (task.habit && after && after.title !== task.title && !patch.confirmed) {
      const p = habitProgress(task, state.done, ctx.today, config.habits);
      if ((p.count > 0 || p.best > 0) && !confirm(msg.renameHabit(task.title))) return;
    }
    // A typed `som` takes a task out of Important, not urgent without changing its date (#38).
    const moved = after?.date !== task.date || (after !== null && bucketOf(after, ctx) !== bucketOf(task, ctx));
    if (moved) commitMove(id, next);
    else {
      // A rename onto a title with history can form the habit: the task leaves, as in `complete`.
      const fallback = neighbour(id);
      if (commit(next, flags ? msg.markedImportant() : msg.saved())) keepVisible(id, fallback);
    }
  }

  function setRepeat(id: string, rule: RepeatRule | null): void {
    const task = findTask(state, id);
    if (!task || (rule === null && task.repeat === null)) return;
    const fallback = neighbour(id);
    const message = rule ? msg.repeats(rule) : msg.repeatRemoved();
    if (commit(setRepeatOp(state, id, rule, ctx.today), message)) keepVisible(id, fallback);
  }

  function setImportant(id: string, important: boolean): void {
    if (!findTask(state, id)) return;
    // The flag moves an undated task between Important, not urgent and Someday (#38).
    const fallback = neighbour(id);
    if (commit(setImportantOp(state, id, important), important ? msg.markedImportant() : msg.notImportant())) keepVisible(id, fallback);
  }

  function undo(): void {
    const prev = undoStack.pop();
    if (!prev) {
      show(msg.nothingToUndo(), false);
      return;
    }
    state = prev;
    if (selectedId !== null && !findTask(state, selectedId)) selectedId = null;
    unsynced = true;
    show(msg.undone(), false);
    scheduleSave();
  }

  // ---- view ------------------------------------------------------------------------------------------

  /** Board column groups for the tasks as they are now. */
  function pack(): BucketKey[][] {
    const folds = foldsIn('board');
    const rows = BUCKETS.map((b) => ({
      key: b.key,
      rows: folds[b.key] ? 1 : 1 + counts[b.key],
    }));
    return packBoard(rows, BOARD_COLUMNS);
  }

  function boardColumns(): BucketKey[][] {
    if (packed?.packs !== packs) packed = { packs, columns: untrack(pack) };
    return packed.columns;
  }

  function selectNext(delta: 1 | -1): void {
    const vis = visibleTasks();
    if (vis.length === 0) return;
    const i = vis.findIndex((t) => t.id === selectedId);
    const j = i < 0 ? (delta > 0 ? 0 : vis.length - 1) : Math.min(vis.length - 1, Math.max(0, i + delta));
    selectedId = vis[j]!.id;
  }

  function tick(): void {
    const next = weekCtx(clock.now(), config.firstDayOfWeek);
    if (next.today !== ctx.today || next.weekStart !== ctx.weekStart) ctx = next;
  }

  function flush(): Promise<void> {
    for (const fn of [...pending]) fn();
    clearTimeout(saveTimer);
    saveTimer = undefined;
    return serial(stageNow);
  }

  /** Regaining focus fires both `focus` and `visibilitychange`: callers during a refresh share it. */
  let refreshing: Promise<void> | null = null;
  function refresh(): Promise<void> {
    // Never rejects: a refresh that failed (e.g. a pending edit that threw) leaves the status to say so,
    // and an unhandled rejection would be all anyone saw of it.
    refreshing ??= refreshOnce()
      .catch((e: unknown) => console.error(`${BRAND.app}: refresh failed`, e))
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  /** Adopts outside changes; the first successful pull after a start from the cache packs the board again. */
  function adoptRemote(): void {
    if (adopt() && repackOnPull) packs++;
  }

  async function refreshOnce(): Promise<void> {
    for (const fn of [...pending]) fn();
    clearTimeout(saveTimer);
    saveTimer = undefined;
    tick();
    await serial(stageNow);
    // The remote reads run outside the chain, so a slow network never holds up a flush.
    try {
      await workspace.refresh();
    } catch {
      return; // The cache could not be read (status shows offline); the next refresh tries again.
    }
    await serial(async () => {
      adoptRemote();
      repackOnPull = false;
    });
  }

  // A pull or save that met another device's change merged it in (#6): show it now, not on the next focus.
  // During the first pull this can run before `refreshOnce` adopts, so it may pack the board too.
  workspace.onRemoteChange(() => void serial(async () => adoptRemote()).catch((e: unknown) => console.error(e)));

  // Habits that reached their goal in Obsidian or by Claude are formed now.
  settleOutside();
  // Lines ticked in Obsidian were swept on load: write them out.
  if (isDirty()) scheduleSave();
  // Started from the cache without the network (a hanging one must not hold up the list): pull now.
  if (snap.fromCache) void refresh();

  return {
    get state() { return state; },
    get ctx() { return ctx; },
    get config() { return config; },
    get configError() { return configError; },
    get selectedId() { return selectedId; },
    get counts() { return counts; },
    get folded() { return folded; },
    get boardColumns() { return boardColumns(); },
    get view() { return view; },
    get toast() { return toast; },
    get status() { return status; },
    get syncedAt() { return syncedAt; },
    get stats() { return stats; },
    get habits() { return habits; },
    get habitCount() { return habitCount; },
    get history() { return history; },
    cacheWarning: deps.cacheWarning ?? null,
    add,
    select(id) {
      selectedId = id;
    },
    selectNext,
    moveTo,
    setDate,
    drop,
    complete,
    remove,
    edit,
    setRepeat,
    setImportant,
    setHabit,
    makeHabit,
    setHabitGoal,
    undo,
    registerPending(fn) {
      pending.add(fn);
      return () => {
        pending.delete(fn);
      };
    },
    toggleFold(key) {
      toggled = { ...toggled, [key]: !folded[key] };
    },
    switchView() {
      if (isPhone()) return;
      view = view === 'list' ? 'board' : 'list';
      if (view === 'board') packs++;
    },
    refresh,
    flush,
    wouldLoseEdits() {
      // After a flush, a store still dirty means staging (the cache write) failed.
      return isDirty() || (unsynced && !deps.durableCache);
    },
    tick,
  };
}
