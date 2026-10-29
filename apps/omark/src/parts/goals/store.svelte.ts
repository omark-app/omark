import {
  addArea, addGoal, addNotNow, areaActivity, areas, deleteArea, deleteGoal, deleteNotNow, editArea, editGoal, editNotNow,
  moveArea, parseGoals, projectFacts, serializeGoals, setVision,
} from '@omark/goals-core';
import type { Area, AreaPatch, DoneInput, Goal, GoalPatch, GoalsDoc, HoursRow, ISODate, NewGoal, OpenInput, ProjectFacts } from '@omark/goals-core';
import { mergeSettings, setSetting } from '@omark/settings';
import { FileSync } from '@omark/storage';
import type { LocalCache, StorageAdapter, SyncStatus } from '@omark/storage';
import { allTasks, habitProgress, habitsInProgress, parseConfig, parseDone, parseTasks } from '@omark/tasks-core';
import type { HabitProgress } from '@omark/tasks-core';
import { addProject, mergeProjects, parseEventsFile, parseProjects, PROJECT_COLUMNS, serializeProjects } from '@omark/time-core';
import type { Project } from '@omark/time-core';
import { GOALS_SCHEMA, goalsConfig, mergeGoalsText } from './files.ts';

/** The folders Goals reads: its own `goals/`, the Omark folder's top (`projects.csv`), and Tasks' and Time's. */
export interface GoalsDeps {
  goals: StorageAdapter;
  top: StorageAdapter;
  tasks: StorageAdapter;
  time: StorageAdapter;
  /** This device's copy of Goals' files and of `projects.csv`. */
  cache: LocalCache;
  today: () => ISODate;
}

const GOALS = 'goals.md';
const PROJECTS = 'projects.csv';
const CONFIG = 'config.yaml';
const HEADER = `${PROJECT_COLUMNS.join(',')}\n`;
/** Hours count from this many years of Time's files, back from this one (the stale period is at most 24 months). */
const YEARS = 3;
const UNREACHABLE = "Can't reach the Omark folder right now; try again when it can be reached.";

/** A file read: its text, `null` when there is none, `undefined` when it couldn't be read. */
type Read = string | null | undefined;

/** What the other parts' files say. */
interface Facts {
  done: DoneInput[];
  open: OpenInput[];
  rows: HoursRow[];
  habits: { title: string; progress: HabitProgress }[];
}

/**
 * Omark Goals' state (Goals spec 4): `goals.md` and Goals' `config.yaml` through `FileSync` (an offline copy,
 * conditional writes, merges), and the facts read from Tasks' and Time's files and `projects.csv`, which Goals never
 * writes, except a new row in `projects.csv`. Edits go through goals-core's ops; `goals.md` is created on the first
 * one. A file that can't be read is never taken for a missing one: no first run, no writes onto it, no facts lost.
 */
export class GoalsStore {
  doc = $state.raw<GoalsDoc>(parseGoals(''));
  /** The text `doc` was read from or written as. */
  private text = '';
  /** `goals.md` is known to be there (`yes`), known to be missing, or couldn't be read (offline, no copy here). */
  private found = $state<'yes' | 'missing' | 'unreachable'>('missing');
  /** No area yet in a `goals.md` there is (or isn't yet): the board shows its first-run placeholders. */
  firstRun = $derived(this.found !== 'unreachable' && areas(this.doc).length === 0);
  /** `goals.md` couldn't be read and this device has no copy: the board waits, and takes no edits. */
  unreachable = $derived(this.found === 'unreachable');
  phase = $state<'loading' | 'ready'>('loading');
  status = $state<SyncStatus>('syncing');
  projects = $state.raw<Project[]>([]);
  /** `projects.csv` as last read (null: there is none; undefined: never read). */
  private projectsText: Read = undefined;
  /** `projects.csv` is synced (opened, or created by a new project), so its copy is kept and written. */
  private projectsOpen = false;
  staleAfter = $state(3);
  configError = $state<string | null>(null);
  /** Goals' `config.yaml` as last read (as for `projectsText`), and whether it is synced. */
  private configText: Read = undefined;
  private configOpen = false;
  private facts = $state.raw<Facts>({ done: [], open: [], rows: [], habits: [] });
  /** Some part's file has never been read (offline): Needs update waits rather than raise a false alarm. */
  private factsPartial = $state(true);
  /** Today, as of the last read (`open` and `refresh`). */
  private today = $state<ISODate>('');

  private readonly goals: FileSync;
  private readonly config: FileSync;
  private readonly projectsSync: FileSync;

  activity = $derived(
    areaActivity(this.doc, {
      ...this.facts,
      today: this.today,
      staleAfter: this.staleAfter,
      ...(typeof this.projectsText === 'string' || this.projectsText === null ? { projects: this.projects.map((p) => p.code) } : {}),
    }).map((a) => (this.factsPartial ? { ...a, needsUpdate: false } : a)),
  );

  constructor(private readonly deps: GoalsDeps) {
    this.today = deps.today();
    this.goals = new FileSync({ name: GOALS, adapter: deps.goals, cache: deps.cache, merge: mergeGoalsText, initial: '' });
    this.goals.onStatus((s) => (this.status = s));
    this.goals.onRemoteChange(() => this.show(this.goals.text()));
    this.config = new FileSync({
      name: CONFIG, adapter: deps.goals, cache: deps.cache, initial: '',
      merge: (b, l, r) => mergeSettings(GOALS_SCHEMA, b, l, r).text,
    });
    this.projectsSync = new FileSync({ name: PROJECTS, adapter: deps.top, cache: deps.cache, merge: mergeProjects, initial: HEADER });
  }

  /** Opens `goals.md` (its offline copy first) and reads the facts. A missing file is the first run, not created. */
  async open(): Promise<void> {
    const cached = await this.goals.cached().catch(() => null);
    if (cached !== null) {
      this.found = 'yes';
      this.show(cached);
      void this.goals.pull();
    } else {
      await this.look();
    }
    this.phase = 'ready';
    await this.readFacts();
  }

  /** Reads `goals.md` and the facts again (on focus, and when the tab shows). */
  async refresh(): Promise<void> {
    if (this.found === 'yes') await this.goals.pull();
    else await this.look();
    await this.readFacts();
  }

  /** Waits until every edit made so far has been written (or has failed and stays on this device). */
  async settled(): Promise<void> {
    if (this.found === 'yes') await this.goals.pull();
    if (this.projectsOpen) await this.projectsSync.pull();
    if (this.configOpen) await this.config.pull();
  }

  setVision = (text: string) => this.apply(() => setVision(this.doc, text));
  addArea = (name: string) => this.apply(() => addArea(this.doc, name, this.codes()).doc);
  editArea = (i: number, patch: AreaPatch) => this.apply(() => editArea(this.doc, i, patch, this.codes()));
  moveArea = (i: number, dir: -1 | 1) => this.apply(() => moveArea(this.doc, i, dir));
  deleteArea = (i: number) => this.apply(() => deleteArea(this.doc, i));
  addGoal = (i: number, goal: NewGoal) => this.apply(() => addGoal(this.doc, i, goal, this.deps.today()));
  editGoal = (i: number, g: number, patch: GoalPatch) => this.apply(() => editGoal(this.doc, i, g, patch, this.deps.today()));
  deleteGoal = (i: number, g: number) => this.apply(() => deleteGoal(this.doc, i, g));
  addNotNow = (text: string) => this.apply(() => addNotNow(this.doc, text));
  editNotNow = (k: number, text: string) => this.apply(() => editNotNow(this.doc, k, text));
  deleteNotNow = (k: number) => this.apply(() => deleteNotNow(this.doc, k));

  /**
   * Adds a project to `projects.csv` with its code and description only (Goals spec 7.3); the rest stays O.Time's.
   * Null when added, else why not (a code taken, not a code, or the file couldn't be read).
   */
  async addProject(code: string, description: string): Promise<string | null> {
    if (this.projectsText === undefined) return UNREACHABLE;
    // An existing file is opened first, so the new row is written onto it; a missing one is created by the write.
    if (this.projectsText !== null && !this.projectsOpen) {
      this.setProjects(await this.projectsSync.open());
      this.projectsOpen = true;
    }
    const base = this.projectsText ?? HEADER;
    const project: Project = { code, description, client: '', rate: null, currency: '', archived: '', extra: {} };
    let text: string;
    try {
      text = serializeProjects(addProject(parseProjects(base), project));
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    this.setProjects(text);
    this.projectsOpen = true;
    await this.projectsSync.stage(text, base).catch(() => {});
    return null;
  }

  /** Sets `stale_after` (Goals spec 6.3) in Goals' `config.yaml`, keeping its other lines. Null when set, else why not. */
  async setStaleAfter(months: number): Promise<string | null> {
    if (!Number.isInteger(months) || months < 1 || months > 24) return 'Needs update after must be a whole number of months from 1 to 24';
    if (this.configText === undefined) return UNREACHABLE;
    if (this.configText !== null && !this.configOpen) this.configText = await this.config.open();
    this.configOpen = true;
    const base = this.configText ?? '';
    const text = setSetting(base, ['stale_after'], months);
    this.configText = text;
    this.readConfig();
    await this.config.stage(text, base).catch(() => {});
    return null;
  }

  /** A goal's hours and open tasks, for one with a project code in `projects.csv` (Goals spec 5.1). */
  factsFor(goal: Goal): ProjectFacts | null {
    if (goal.code && this.projectsText !== undefined && !this.projects.some((p) => p.code === goal.code!.toUpperCase())) return null;
    return projectFacts(goal, { rows: this.facts.rows, open: this.facts.open, today: this.deps.today() });
  }

  /** Habits in progress in Tasks that link to `area` (its tag or a code on its goals), with their progress. */
  habitsFor(area: Area): { title: string; progress: HabitProgress }[] {
    const a = this.activity[areas(this.doc).indexOf(area)];
    if (!a) return [];
    const keys = new Set([...(area.tag ? [area.tag.toLowerCase()] : []), ...a.codes.map((c) => c.toLowerCase())]);
    return this.facts.habits.filter((h) => [...h.title.matchAll(/(?<![^\s([{])#([\p{L}\p{N}_/-]+)/gu)].some((m) => keys.has(m[1]!.toLowerCase())));
  }

  /** Finds out whether `goals.md` is there: opens it through FileSync when it is (FileSync would create a missing one). */
  private async look(): Promise<void> {
    let remote;
    try {
      remote = await this.deps.goals.read(GOALS);
    } catch {
      this.found = 'unreachable';
      this.status = 'offline';
      return;
    }
    if (remote) {
      this.found = 'yes';
      this.show(await this.goals.open());
    } else {
      this.found = 'missing';
      this.status = 'saved';
    }
  }

  private codes(): string[] {
    return this.projects.map((p) => p.code);
  }

  private show(text: string): void {
    this.text = text;
    this.doc = parseGoals(text);
  }

  private setProjects(text: string | null): void {
    this.projectsText = text;
    this.projects = text === null ? [] : parseProjects(text).projects;
  }

  private readConfig(): void {
    const config = goalsConfig(typeof this.configText === 'string' ? this.configText : '');
    this.staleAfter = config.staleAfter;
    this.configError = config.error;
  }

  /** An edit, once the board has opened a `goals.md` that is there or missing (never onto one it couldn't read). */
  private async apply(edit: () => GoalsDoc): Promise<void> {
    if (this.phase !== 'ready' || this.found === 'unreachable') return;
    const next = edit();
    if (next === this.doc) return;
    const base = this.text;
    const text = serializeGoals(next);
    this.show(text);
    this.found = 'yes';
    // An edit that can't be kept on this device still goes out; the status shows it.
    await this.goals.stage(text, base).catch(() => {});
    // Merged onto a newer copy here: show that.
    if (this.goals.text() !== this.text) this.show(this.goals.text());
  }

  /**
   * Reads the other parts' files, `projects.csv` and Goals' `config.yaml`. A file that can't be read keeps what it
   * gave last time; one never read leaves Needs update off.
   */
  private async readFacts(): Promise<void> {
    const read = async (folder: StorageAdapter, name: string): Promise<Read> => {
      try {
        return (await folder.read(name))?.text ?? null;
      } catch {
        return undefined;
      }
    };
    const today = this.deps.today();
    this.today = today;
    const year = Number(today.slice(0, 4));
    const [tasksText, doneText, tasksConfig, configFile, projectsFile, ...years] = await Promise.all([
      read(this.deps.tasks, 'tasks.md'),
      read(this.deps.tasks, 'done.md'),
      read(this.deps.tasks, 'config.yaml'),
      this.configOpen ? this.config.pull().then((r) => r.text, () => undefined) : read(this.deps.goals, CONFIG),
      this.projectsOpen ? this.projectsSync.pull().then((r) => r.text, () => undefined) : read(this.deps.top, PROJECTS),
      ...Array.from({ length: YEARS }, (_, k) => read(this.deps.time, `events-${year - k}.csv`)),
    ]);
    const prev = this.facts;
    const failed = [tasksText, doneText, ...years].some((t) => t === undefined);
    const done = doneText === undefined ? null : parseDone(doneText ?? '');
    const tasksDoc = tasksText === undefined ? null : parseTasks(tasksText ?? '');
    const habitConfig = parseConfig(tasksConfig ?? '').config.habits;
    this.facts = {
      done: done ? done.lines.flatMap((l) => (l.entry ? [{ title: l.entry.title, doneOn: l.entry.doneOn }] : [])) : prev.done,
      open: tasksDoc ? allTasks(tasksDoc).map((t) => ({ title: t.title })) : prev.open,
      rows: years.some((t) => t === undefined) ? prev.rows : years.flatMap((t) => (t ? parseEventsFile(t).rows : [])),
      habits: tasksDoc && done
        ? habitsInProgress(tasksDoc).map((t) => ({ title: t.title, progress: habitProgress(t, done, today, habitConfig) }))
        : prev.habits,
    };
    // Facts are whole once every source has been read at least once.
    if (!failed) this.factsPartial = false;
    if (configFile !== undefined && !(this.configOpen && configFile === this.configText)) this.configText = configFile;
    this.readConfig();
    if (projectsFile !== undefined) this.setProjects(projectsFile);
  }
}
