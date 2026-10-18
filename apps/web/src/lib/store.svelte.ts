import { untrack } from 'svelte';
import {
  addTask,
  bucketOf,
  BUCKETS,
  carryIds,
  completeTask,
  computeStats,
  deleteTask,
  editTask,
  findTask,
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
  setAlways as setAlwaysOp,
  setDate as setDateOp,
  setRepeat as setRepeatOp,
  sweepCompleted,
  tasksInBucket,
  weekCtx,
} from '@taskapp/core';
import type {
  BucketKey,
  Config,
  ConfigError,
  DropOutcome,
  DropTarget,
  ISODate,
  MovableBucket,
  RepeatRule,
  State,
  Stats,
  Task,
  WeekCtx,
} from '@taskapp/core';
import type { SyncStatus, Workspace } from '@taskapp/storage';
import type { Clock } from './clock.ts';
import * as msg from './messages.ts';

export type View = 'list' | 'board';
export interface Toast {
  message: string;
  undo: boolean;
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
   */
  readonly folded: Record<BucketKey, boolean>;
  /**
   * The week board's columns, in bucket order (spec 11.2). Packed when the board is first shown after the
   * app opens and again on each switch to it (and once more when the first pull after a start from the
   * cache brings changes), then kept while the user works. An Overdue that fills up meanwhile joins Today's
   * column; one that empties keeps its place.
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
  add(title: string, bucket?: MovableBucket): boolean;
  select(id: string | null): void;
  selectNext(delta: 1 | -1): void;
  moveTo(id: string, bucket: MovableBucket): void;
  setDate(id: string, date: ISODate | null, beforeId?: string | null): void;
  /** Applies a move or reorder; a drop on Later changes nothing and returns `pickDate` for the UI to open. */
  drop(id: string, target: DropTarget): DropOutcome;
  complete(id: string): void;
  remove(id: string): void;
  /** Trims the title and notes and drops blank notes; a blank title or an edit that changes nothing is ignored. */
  edit(id: string, patch: { title: string; notes: string[] }): void;
  setRepeat(id: string, rule: RepeatRule | null): void;
  setAlways(lines: string[]): void;
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
}

const TOAST_MS = 4200;
const UNDO_LIMIT = 100;
/** On the week board the dated buckets start open whatever `foldedOnOpen` says (an empty one still folds). */
const BOARD_OPEN: readonly BucketKey[] = ['overdue', 'today', 'week', 'next'];
const BOARD_COLUMNS = 4;

const bucketName = (key: BucketKey): string => BUCKETS.find((b) => b.key === key)!.name;

const byBucket = <T>(value: (key: BucketKey) => T): Record<BucketKey, T> =>
  Object.fromEntries(BUCKETS.map((b) => [b.key, value(b.key)])) as Record<BucketKey, T>;

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Parsed files with any `- [x]` lines in tasks.md swept into done.md. */
function loadState(doc: State['doc'], doneText: string, today: ISODate): State {
  const state: State = { doc, done: parseDone(doneText) };
  return sweepCompleted(state, today) ?? state;
}

export async function createStore(deps: StoreDeps): Promise<AppStore> {
  const { workspace, clock, isPhone } = deps;
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
        toggled[key] ??
        (counts[key] === 0 || (foldedOnOpen.includes(key) && !(v === 'board' && BOARD_OPEN.includes(key)))),
    );
  const folded = $derived(foldsIn(view));
  /** Bumped to pack the board again; the packing itself reads nothing reactively, so work never moves it. */
  let packs = $state(0);
  let packed: { packs: number; columns: BucketKey[][] } | null = null;
  /** A start from the cache packs again once, if the first pull brings changes. */
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
    if (next.config !== configText) applyConfig(next.config);
    if (next.tasks === base.tasks && next.done === base.done) return false;

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

  const visibleTasks = (): Task[] =>
    BUCKETS.filter((b) => isOpen(b.key)).flatMap((b) => tasksInBucket(state.doc, b.key, ctx));

  /** The task to select when `id` leaves the visible list: the next one, else the previous one. */
  function neighbour(id: string): string | null {
    const vis = visibleTasks();
    const i = vis.findIndex((t) => t.id === id);
    return (vis[i + 1] ?? vis[i - 1])?.id ?? null;
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

  function add(title: string, bucket: MovableBucket = config.newTaskBucket): boolean {
    const res = addTask(state, title, bucket, ctx);
    if (!res) return false;
    commit(res.state, msg.added(bucketName(bucketOf(findTask(res.state, res.id)!, ctx))));
    return true;
  }

  function moveTo(id: string, bucket: MovableBucket): void {
    if (!findTask(state, id)) return;
    commitMove(id, moveToBucket(state, id, bucket, ctx));
  }

  function setDate(id: string, date: ISODate | null, beforeId?: string | null): void {
    if (!findTask(state, id)) return;
    commitMove(id, setDateOp(state, id, date, beforeId));
  }

  function drop(id: string, target: DropTarget): DropOutcome {
    const out = planDrop(state, id, target, ctx);
    if (out.kind === 'reorder') commit(out.state, msg.reordered(out.sameDate));
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

  function edit(id: string, patch: { title: string; notes: string[] }): void {
    const task = findTask(state, id);
    if (!task) return;
    const title = patch.title.trim();
    const notes = patch.notes.map((n) => n.trim()).filter((n) => n !== '');
    if (title === '' || (title === task.title && sameList(notes, task.notes))) return;
    commit(editTask(state, id, { title, notes }), msg.saved());
  }

  function setRepeat(id: string, rule: RepeatRule | null): void {
    const task = findTask(state, id);
    if (!task || (rule === null && task.repeat === null)) return;
    const fallback = neighbour(id);
    const message = rule ? msg.repeats(rule) : msg.repeatRemoved();
    if (commit(setRepeatOp(state, id, rule, ctx.today), message)) keepVisible(id, fallback);
  }

  function setAlways(lines: string[]): void {
    const next = setAlwaysOp(state, lines);
    if (sameList(next.doc.always, state.doc.always)) return;
    commit(next, msg.saved());
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

  /** Board column groups for the tasks as they are now; Overdue only when it has tasks. */
  function pack(): BucketKey[][] {
    const folds = foldsIn('board');
    const rows = BUCKETS.filter((b) => b.key !== 'overdue' || counts.overdue > 0).map((b) => ({
      key: b.key,
      rows: folds[b.key] ? 1 : 1 + counts[b.key],
    }));
    return packBoard(rows, BOARD_COLUMNS);
  }

  function boardColumns(): BucketKey[][] {
    if (packed?.packs !== packs) packed = { packs, columns: untrack(pack) };
    const columns = packed.columns;
    if (counts.overdue === 0 || columns.some((c) => c.includes('overdue'))) return columns;
    return columns.map((c) => (c.includes('today') ? ['overdue', ...c] : c));
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
      .catch((e: unknown) => console.error('TaskApp: refresh failed', e))
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function refreshOnce(): Promise<void> {
    const repack = repackOnPull;
    repackOnPull = false;
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
      if (adopt() && repack) packs++;
    });
  }

  // A save that met another device's change merged it in (#6): show it now, not on the next focus.
  workspace.onRemoteChange(() => void serial(async () => adopt()).catch((e: unknown) => console.error(e)));

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
    setAlways,
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
