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
  RepeatRule,
  State,
  Stats,
  Task,
  WeekCtx,
} from '@taskapp/core';
import type { Snapshot, SyncStatus, Workspace } from '@taskapp/storage';
import type { Clock } from './clock.ts';
import * as msg from './messages.ts';

type MovableBucket = Exclude<BucketKey, 'later'>;
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
  readonly folded: Record<BucketKey, boolean>;
  readonly view: View;
  readonly toast: Toast | null;
  readonly status: SyncStatus;
  readonly stats: Stats;
  /** Set when the offline cache could not be used (e.g. iOS private mode); edits then live only in memory. */
  readonly cacheWarning: string | null;
  add(title: string, bucket?: MovableBucket): void;
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
  toggleFold(key: BucketKey): void;
  /** Phones always stay on the list. */
  switchView(): void;
  /**
   * Saves pending edits, re-reads the files and merges outside changes in (clearing undo); also runs
   * `tick`. Never rejects: failures show in `status`.
   */
  refresh(): Promise<void>;
  /** Saves now. Never rejects: if the cache write fails the edits stay pending and the next flush retries. */
  flush(): Promise<void>;
  /** Recomputes the week context from the clock (call at midnight and on focus). */
  tick(): void;
}

export interface StoreDeps {
  workspace: Workspace;
  clock: Clock;
  isPhone: () => boolean;
  cacheWarning?: string | null;
}

const TOAST_MS = 4200;
const UNDO_LIMIT = 100;
/** On the week board the first three columns never fold. */
const BOARD_OPEN: readonly BucketKey[] = ['today', 'week', 'next'];

const bucketName = (key: BucketKey): string => BUCKETS.find((b) => b.key === key)!.name;

const foldsFrom = (config: Config): Record<BucketKey, boolean> =>
  Object.fromEntries(BUCKETS.map((b) => [b.key, config.foldedOnOpen.includes(b.key)])) as Record<
    BucketKey,
    boolean
  >;

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
  let folded = $state.raw<Record<BucketKey, boolean>>(foldsFrom(first.config));
  let view = $state<View>(isPhone() ? 'list' : first.config.defaultView);
  let toast = $state.raw<Toast | null>(null);
  let status = $state<SyncStatus>(workspace.status());
  const stats = $derived(computeStats(state.done, ctx.today));
  workspace.onStatus((s) => {
    status = s;
  });

  let undoStack: State[] = [];
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Saves and refreshes run one at a time, so each sees the bases the previous one left. */
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

  /** Sends each file whose text differs from its base. A rejected save leaves the bases, so it is retried. */
  async function saveNow(): Promise<void> {
    const tasks = serializeTasks(state.doc);
    const done = serializeDone(state.done);
    const files: Parameters<Workspace['save']>[0] = {};
    if (tasks !== base.tasks) files.tasks = { text: tasks, base: base.tasks };
    if (done !== base.done) files.done = { text: done, base: base.done };
    if (!files.tasks && !files.done) return;
    try {
      await workspace.save(files);
    } catch {
      // The cache write failed (status shows offline). Replaying the same edit on the same base is
      // harmless, so the next flush simply sends it again.
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

  /** Takes in what `workspace.refresh()` returned, replaying any edits not yet saved onto it. */
  function adopt(next: Snapshot): void {
    if (next.config !== configText) applyConfig(next.config);
    if (next.tasks === base.tasks && next.done === base.done) return;

    const localTasks = serializeTasks(state.doc);
    const localDone = serializeDone(state.done);
    const tasksText = localTasks === base.tasks ? next.tasks : mergeTasksText(base.tasks, localTasks, next.tasks);
    const doneText = localDone === base.done ? next.done : mergeDoneText(base.done, localDone, next.done);
    base.tasks = next.tasks;
    base.done = next.done;
    // When the merge equals what we hold (e.g. only our own failed-to-cache edit came back), nothing came
    // in from outside: keep state and undo.
    if (tasksText !== localTasks || doneText !== localDone) {
      state = loadState(carryIds(state.doc, parseTasks(tasksText)), doneText, ctx.today);
      undoStack = [];
      if (selectedId !== null && !findTask(state, selectedId)) selectedId = null;
    }
    if (isDirty()) scheduleSave();
  }

  // ---- selection -------------------------------------------------------------------------------------

  const isOpen = (key: BucketKey): boolean => !folded[key] || (view === 'board' && BOARD_OPEN.includes(key));

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
    if (next === state) return false;
    undoStack.push(state);
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

  function add(title: string, bucket: MovableBucket = config.newTaskBucket): void {
    const res = addTask(state, title, bucket, ctx);
    if (!res) return;
    commit(res.state, msg.added(bucketName(bucketOf(findTask(res.state, res.id)!, ctx))));
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
    show(msg.undone(), false);
    scheduleSave();
  }

  // ---- view ------------------------------------------------------------------------------------------

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
    clearTimeout(saveTimer);
    saveTimer = undefined;
    return serial(saveNow);
  }

  function refresh(): Promise<void> {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    tick();
    return serial(async () => {
      await saveNow();
      let next: Snapshot;
      try {
        next = await workspace.refresh();
      } catch {
        return; // The cache could not be read (status shows offline); the next refresh tries again.
      }
      adopt(next);
    });
  }

  // Lines ticked in Obsidian were swept on load: write them out.
  if (isDirty()) scheduleSave();

  return {
    get state() { return state; },
    get ctx() { return ctx; },
    get config() { return config; },
    get configError() { return configError; },
    get selectedId() { return selectedId; },
    get folded() { return folded; },
    get view() { return view; },
    get toast() { return toast; },
    get status() { return status; },
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
    toggleFold(key) {
      folded = { ...folded, [key]: !folded[key] };
    },
    switchView() {
      if (!isPhone()) view = view === 'list' ? 'board' : 'list';
    },
    refresh,
    flush,
    tick,
  };
}
