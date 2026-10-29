import {
  addArea, addGoal, addNotNow, areaActivity, deleteArea, deleteGoal, deleteNotNow, editArea, editGoal, editNotNow, moveArea,
  parseGoals, projectFacts, serializeGoals, setVision,
} from '@omark/goals-core';
import type { Area, AreaPatch, DoneInput, Goal, GoalPatch, GoalsDoc, HoursRow, ISODate, NewGoal, OpenInput, ProjectFacts } from '@omark/goals-core';
import { setSetting } from '@omark/settings';
import { FileSync } from '@omark/storage';
import type { LocalCache, StorageAdapter, SyncStatus } from '@omark/storage';
import { allTasks, habitProgress, habitsInProgress, parseConfig, parseDone, parseTasks } from '@omark/tasks-core';
import type { HabitProgress } from '@omark/tasks-core';
import { addProject, mergeProjects, parseEventsFile, parseProjects, PROJECT_COLUMNS, serializeProjects } from '@omark/time-core';
import type { Project } from '@omark/time-core';
import { goalsConfig, mergeGoalsText } from './files.ts';

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

/** What the other parts' files say; empty until read, and for a file that could not be read. */
interface Facts {
  done: DoneInput[];
  open: OpenInput[];
  rows: HoursRow[];
  habits: { title: string; progress: HabitProgress }[];
}

const NO_FACTS: Facts = { done: [], open: [], rows: [], habits: [] };

/**
 * Omark Goals' state (Goals spec 4): `goals.md` through `FileSync` (an offline copy, conditional writes and a
 * line merge), and the facts read from Tasks' and Time's files and `projects.csv`, which Goals never writes,
 * except a new row in `projects.csv`. Edits go through goals-core's ops; `goals.md` is created on the first one.
 */
export class GoalsStore {
  doc = $state.raw<GoalsDoc>(parseGoals(''));
  /** The text `doc` was read from or written as. */
  private text = '';
  /** Nothing in `goals.md` yet (or no file): the board shows its first-run placeholders. */
  firstRun = $derived(this.doc.head.length === 0 && this.doc.sections.length === 0);
  phase = $state<'loading' | 'ready'>('loading');
  status = $state<SyncStatus>('syncing');
  projects = $state.raw<Project[]>([]);
  /** `projects.csv` was read (it may not exist): only then do goal codes have to be in it. */
  private projectsRead = false;
  private projectsText: string | null = null;
  /** `projects.csv` is synced (opened, or created by a new project), so its copy is kept and written. */
  private projectsOpen = false;
  staleAfter = $state(3);
  configError = $state<string | null>(null);
  private facts = $state.raw<Facts>(NO_FACTS);
  /** Today, as of the last read (`open` and `refresh`). */
  private today = $state<ISODate>('');

  private readonly goals: FileSync;
  /** Goals' `config.yaml`, synced once it exists or is first written. */
  private readonly config: FileSync;
  private configText: string | null = null;
  private configOpen = false;
  private readonly projectsSync: FileSync;

  activity = $derived(
    areaActivity(this.doc, {
      ...this.facts,
      today: this.today,
      staleAfter: this.staleAfter,
      ...(this.projectsRead && { projects: this.projects.map((p) => p.code) }),
    }),
  );

  constructor(private readonly deps: GoalsDeps) {
    this.today = deps.today();
    this.goals = new FileSync({ name: GOALS, adapter: deps.goals, cache: deps.cache, merge: mergeGoalsText, initial: '' });
    this.goals.onStatus((s) => (this.status = s));
    this.goals.onRemoteChange(() => this.show(this.goals.text()));
    this.config = new FileSync({ name: CONFIG, adapter: deps.goals, cache: deps.cache, merge: mergeGoalsText, initial: '' });
    this.projectsSync = new FileSync({ name: PROJECTS, adapter: deps.top, cache: deps.cache, merge: mergeProjects, initial: HEADER });
  }

  /** Opens `goals.md` (its offline copy first) and reads the facts. A missing file is the first run, not created. */
  async open(): Promise<void> {
    const cached = await this.goals.cached().catch(() => null);
    if (cached !== null) {
      this.show(cached);
      void this.goals.pull();
    } else {
      const remote = await this.deps.goals.read(GOALS).catch(() => null);
      // Opened through FileSync only when the file is there: FileSync would create a missing one.
      this.show(remote ? await this.goals.open() : '');
      if (!remote) this.status = 'saved';
    }
    this.phase = 'ready';
    await this.readFacts();
  }

  /** Reads `goals.md` and the facts again (on focus). */
  async refresh(): Promise<void> {
    if (this.text !== '' || (await this.goals.cached().catch(() => null)) !== null) await this.goals.pull();
    await this.readFacts();
  }

  /** Waits until every edit made so far has been written (or has failed and stays on this device). */
  async settled(): Promise<void> {
    if (this.text !== '') await this.goals.pull();
    if (this.projectsOpen) await this.projectsSync.pull();
    if (this.configOpen) await this.config.pull();
  }

  setVision = (text: string) => this.apply(setVision(this.doc, text));
  addArea = (name: string) => this.apply(addArea(this.doc, name, this.codes()).doc);
  editArea = (i: number, patch: AreaPatch) => this.apply(editArea(this.doc, i, patch, this.codes()));
  moveArea = (i: number, dir: -1 | 1) => this.apply(moveArea(this.doc, i, dir));
  deleteArea = (i: number) => this.apply(deleteArea(this.doc, i));
  addGoal = (i: number, goal: NewGoal) => this.apply(addGoal(this.doc, i, goal, this.deps.today()));
  editGoal = (i: number, g: number, patch: GoalPatch) => this.apply(editGoal(this.doc, i, g, patch, this.deps.today()));
  deleteGoal = (i: number, g: number) => this.apply(deleteGoal(this.doc, i, g));
  addNotNow = (text: string) => this.apply(addNotNow(this.doc, text));
  editNotNow = (k: number, text: string) => this.apply(editNotNow(this.doc, k, text));
  deleteNotNow = (k: number) => this.apply(deleteNotNow(this.doc, k));

  /**
   * Adds a project to `projects.csv` with its code and description only (Goals spec 7.3); the rest stays O.Time's.
   * Null when added, else why not (a code taken or not a code).
   */
  async addProject(code: string, description: string): Promise<string | null> {
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
    if (this.configText !== null && !this.configOpen) this.configText = await this.config.open();
    this.configOpen = true;
    const base = this.configText ?? '';
    const text = setSetting(base, ['stale_after'], months);
    this.configText = text;
    this.staleAfter = months;
    this.configError = null;
    await this.config.stage(text, base).catch(() => {});
    return null;
  }

  /** A goal's hours and open tasks, for one with a project code. */
  factsFor(goal: Goal): ProjectFacts | null {
    return projectFacts(goal, { rows: this.facts.rows, open: this.facts.open, today: this.deps.today() });
  }

  /** Habits in progress in Tasks that link to `area` (its tag or a code on its goals), with their progress. */
  habitsFor(area: Area): { title: string; progress: HabitProgress }[] {
    const i = this.doc.sections.filter((s) => s.kind === 'area').indexOf(area);
    const a = this.activity[i];
    if (!a) return [];
    const keys = new Set([...(area.tag ? [area.tag.toLowerCase()] : []), ...a.codes.map((c) => c.toLowerCase())]);
    return this.facts.habits.filter((h) => [...h.title.matchAll(/(?<![^\s([{])#([\p{L}\p{N}_/-]+)/gu)].some((m) => keys.has(m[1]!.toLowerCase())));
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

  private async apply(next: GoalsDoc): Promise<void> {
    if (next === this.doc) return;
    const base = this.text;
    const text = serializeGoals(next);
    this.text = text;
    this.doc = next;
    // An edit that can't be kept on this device still goes out; the status shows it.
    await this.goals.stage(text, base).catch(() => {});
  }

  /** Reads the other parts' files and `projects.csv`; a file that can't be read gives no facts. */
  private async readFacts(): Promise<void> {
    const read = async (folder: StorageAdapter, name: string) => (await folder.read(name).catch(() => undefined))?.text;
    const today = this.deps.today();
    this.today = today;
    const year = Number(today.slice(0, 4));
    const [tasksText, doneText, tasksConfig, goalsConfigText, projectsFile, ...years] = await Promise.all([
      read(this.deps.tasks, 'tasks.md'),
      read(this.deps.tasks, 'done.md'),
      read(this.deps.tasks, 'config.yaml'),
      read(this.deps.goals, 'config.yaml'),
      this.deps.top.read(PROJECTS).then((f) => f?.text ?? null, () => undefined),
      ...Array.from({ length: YEARS }, (_, k) => read(this.deps.time, `events-${year - k}.csv`)),
    ]);
    const tasksDoc = tasksText === undefined ? null : parseTasks(tasksText);
    const done = parseDone(doneText ?? '');
    const habitConfig = parseConfig(tasksConfig ?? '').config.habits;
    this.facts = {
      done: done.lines.flatMap((l) => (l.entry ? [{ title: l.entry.title, doneOn: l.entry.doneOn }] : [])),
      open: tasksDoc ? allTasks(tasksDoc).map((t) => ({ title: t.title })) : [],
      rows: years.flatMap((t) => (t === undefined ? [] : parseEventsFile(t).rows)),
      habits: tasksDoc
        ? habitsInProgress(tasksDoc).map((t) => ({ title: t.title, progress: habitProgress(t, done, today, habitConfig) }))
        : [],
    };
    if (!this.configOpen && goalsConfigText !== undefined) this.configText = goalsConfigText;
    const config = goalsConfig(this.configText ?? '');
    this.staleAfter = config.staleAfter;
    this.configError = config.error;
    if (projectsFile !== undefined) {
      this.projectsRead = true;
      this.setProjects(projectsFile);
    }
  }
}
