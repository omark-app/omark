import { untrack } from 'svelte';
import { mergeSettings } from '@omark/settings';
import { BRAND } from '../brand.ts';
import {
  addTask,
  bucketName,
  bucketOf,
  BUCKETS,
  carryIds,
  completeTask,
  computeStats,
  deleteTask,
  editTask,
  findTask,
  IMPORTANT_GROUP,
  mergeDoneText,
  mergeTasksText,
  metaLabel,
  moveToBucket,
  packBoard,
  parseConfig,
  parseDone,
  parseTasks,
  planDrop,
  serializeDone,
  serializeTasks,
  setDate as setDateOp,
  setImportant as setImportantOp,
  setRepeat as setRepeatOp,
  sweepCompleted,
  TASKS_SCHEMA,
  tasksInBucket,
  weekCtx,
} from '@omark/tasks-core';
import type {
  BucketKey,
  Config,
  ConfigError,
  DropOutcome,
  DropTarget,
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
export interface Toast {
  message: string;
  undo: boolean;
}

/**
 * The one place where UI actions become core operations. Every change to the tasks pushes the previous
 * `State` on the undo stack, shows a toast with Undo and schedules a debounced save.
 */
export interface AppStore {
  readonly state: State;
  readonly ctx: WeekCtx;
  readonly config: Config;
  readonly configError: ConfigError | null;
  /** The working text of config.yaml (what `config` was read from). */
  readonly configText: string;
  /**
   * Set when a setting changed here was also changed on another device: names them and says the change
   * made here was kept. Stays until the next `writeConfig` or the next such conflict.
   */
  readonly configNote: string | null;
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
  /** Adds a task (to the configured bucket by default); false when the title is blank. */
  add(title: string, when?: DateChoice, important?: boolean): boolean;
  select(id: string | null): void;
  selectNext(delta: 1 | -1): void;
  moveTo(id: string, when: DateChoice): void;
  setDate(id: string, date: ISODate | null, beforeId?: string | null): void;
  /** Applies a move or reorder; a drop on Later changes nothing and returns `pickDate` for the UI to open. */
  drop(id: string, target: DropTarget): DropOutcome;
  complete(id: string): void;
  remove(id: string): void;
  /**
   * Trims the title and notes and drops blank notes; a blank title or an edit that changes nothing is ignored.
   * `when` and `important` come from shortcut words typed in the title (issue #19) and land in the same change.
   */
  edit(id: string, patch: { title: string; notes: string[]; when?: DateChoice | null; important?: boolean }): void;
  setRepeat(id: string, rule: RepeatRule | null): void;
  /** Flags or unflags a task as Important (issue #19). */
  setImportant(id: string, important: boolean): void;
  undo(): void;
  /**
   * Replaces config.yaml with `text` (the whole new file): applies it at once and saves it like a task
   * edit, merged key by key with other devices' changes. No toast and no undo. The same text is a no-op.
   */
  writeConfig(text: string): void;
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

const conflictNote = (labels: readonly string[]): string =>
  `Also changed on another device: ${labels.join(', ')}. Kept the change made here.`;

/** Parsed files with any `- [x]` lines in tasks.md swept into done.md. */
function loadState(doc: State['doc'], doneText: string, today: ISODate): State {
  const state: State = { doc, done: parseDone(doneText) };
  return sweepCompleted(state, today) ?? state;
}

export async function createStore(deps: StoreDeps): Promise<AppStore> {
  const { workspace, clock, isPhone } = deps;
  const snap = await workspace.open();

  // The file texts the store's edits start from (Ruling 21): what it last adopted or saved.
  const base = { tasks: snap.tasks, done: snap.done, config: snap.config };
  let configText = $state.raw(snap.config);
  let configNote = $state.raw<string | null>(null);
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

  function show(message: string, undo: boolean): void {
    toast = { message, undo };
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
    serializeTasks(state.doc) !== base.tasks ||
    serializeDone(state.done) !== base.done ||
    configText !== base.config;

  /**
   * Stages each file whose text differs from its base (Ruling 23): resolves once the edits are in the
   * cache; the upload runs in the background. A rejected stage leaves the bases, so it is retried.
   */
  async function stageNow(): Promise<void> {
    const tasks = serializeTasks(state.doc);
    const done = serializeDone(state.done);
    const config = configText;
    const files: Parameters<Workspace['stage']>[0] = {};
    if (tasks !== base.tasks) files.tasks = { text: tasks, base: base.tasks };
    if (done !== base.done) files.done = { text: done, base: base.done };
    if (config !== base.config) files.config = { text: config, base: base.config };
    if (!files.tasks && !files.done && !files.config) return;
    try {
      await workspace.stage(files);
    } catch {
      // A cache write failed (status shows offline). Replaying the same edit on the same base is
      // harmless (the merge finds the change already there), so the next flush simply sends it again.
      return;
    }
    if (files.tasks) base.tasks = tasks;
    if (files.done) base.done = done;
    if (files.config) base.config = config;
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
    const configIn = next.config !== base.config;
    if (configIn) {
      // Like tasks.md: a config edit not staged yet is merged onto the new text, setting by setting.
      let text = next.config;
      if (configText !== base.config) {
        const merged = mergeSettings(TASKS_SCHEMA, base.config, configText, next.config);
        text = merged.text;
        if (merged.conflicts.length > 0) configNote = conflictNote(merged.conflicts.map((f) => f.label));
      }
      base.config = next.config;
      if (text !== configText) applyConfig(text);
    }
    if (next.tasks === base.tasks && next.done === base.done) {
      if (configIn && isDirty()) scheduleSave();
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

  /** Makes `next` the state with undo, a toast and a save. False (and nothing happens) if nothing changed. */
  function commit(next: State, message: string): boolean {
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
    show(message, true);
    scheduleSave();
    return true;
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

  function add(title: string, when: DateChoice = config.newTaskBucket, important = false): boolean {
    const res = addTask(state, title, when, ctx, undefined, important);
    if (!res) return false;
    commit(res.state, msg.added(bucketName(bucketOf(findTask(res.state, res.id)!, ctx))));
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
    const fallback = neighbour(id);
    const from = bucketOf(task, ctx);
    const res = completeTask(state, id, ctx.today);
    commit(res.state, res.next ? msg.doneRepeat(res.next, ctx) : msg.done(task.title));
    // A repeating task that moved on to another bucket counts as having left (prototype).
    const after = findTask(state, id);
    if (selectedId === id && (!after || bucketOf(after, ctx) !== from)) selectedId = fallback;
    else keepVisible(id, fallback);
  }

  function remove(id: string): void {
    const task = findTask(state, id);
    if (!task) return;
    const fallback = neighbour(id);
    if (commit(deleteTask(state, id), msg.deleted(task.title))) keepVisible(id, fallback);
  }

  function edit(
    id: string, patch: { title: string; notes: string[]; when?: DateChoice | null; important?: boolean },
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
    // A typed `som` takes a task out of Important, not urgent without changing its date (#38).
    const after = findTask(next, id);
    const moved = after?.date !== task.date || (after !== null && bucketOf(after, ctx) !== bucketOf(task, ctx));
    if (moved) commitMove(id, next);
    else commit(next, flags ? msg.markedImportant() : msg.saved());
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

  function writeConfig(text: string): void {
    if (text === configText) return;
    configNote = null;
    unsynced = true;
    applyConfig(text);
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

  // A staged config edit met another device's change to the same setting (merged in the workspace).
  workspace.onConfigConflict((labels) => {
    configNote = conflictNote(labels);
  });

  // A pull or save that met another device's change merged it in (#6): show it now, not on the next focus.
  // During the first pull this can run before `refreshOnce` adopts, so it may pack the board too.
  workspace.onRemoteChange(() => void serial(async () => adoptRemote()).catch((e: unknown) => console.error(e)));

  // Lines ticked in Obsidian were swept on load: write them out.
  if (isDirty()) scheduleSave();
  // Started from the cache without the network (a hanging one must not hold up the list): pull now.
  if (snap.fromCache) void refresh();

  return {
    get state() { return state; },
    get ctx() { return ctx; },
    get config() { return config; },
    get configError() { return configError; },
    get configText() { return configText; },
    get configNote() { return configNote; },
    get selectedId() { return selectedId; },
    get counts() { return counts; },
    get folded() { return folded; },
    get boardColumns() { return boardColumns(); },
    get view() { return view; },
    get toast() { return toast; },
    get status() { return status; },
    get syncedAt() { return syncedAt; },
    get stats() { return stats; },
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
    undo,
    writeConfig,
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
