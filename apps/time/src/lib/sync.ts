import {
  applyChanges,
  buildFixList,
  defaultTimeConfigText,
  eventsFileName,
  formatLocal,
  knownCodes,
  localDate,
  newlyInWindow,
  parseEventsFile,
  parseProjects,
  parseTimeConfig,
  recheckKnown,
  keyOf,
  removeCalendar,
  serializeEventsFile,
  startOfDay,
  SyncTokenExpiredError,
  windowEnd,
} from '@omark/time-core';
import type { CalendarEvent, CalendarSource, EventRow, ProjectsFile, RowContext, TimeConfig, YearFiles } from '@omark/time-core';
import { CONFIG, PROJECTS, PROJECTS_HEADER } from './files.ts';
import type { TextFiles } from './files.ts';
import type { DeviceState, StateStore } from './state.ts';
import { freshState } from './state.ts';

export interface SyncDeps {
  source: CalendarSource;
  files: TextFiles;
  state: StateStore;
  now: () => number;
}

export interface SyncResult {
  /** Every event read in this sync (changes, full reads and ranges), for colouring. */
  events: CalendarEvent[];
  changedYears: string[];
  /** Rows in the files after the sync, and how many. */
  allRows: EventRow[];
  rows: number;
  projects: ProjectsFile;
  fixCount: number;
  config: TimeConfig;
  context: RowContext;
  state: DeviceState;
}

const EMPTY_YEAR = serializeEventsFile([]);

/** The years from `from`'s to `to`'s, as text. */
function years(from: string, to: string): string[] {
  const out: string[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(String(y));
  return out;
}

/** The primary calendar's time zone, read once and kept. */
async function timeZoneOf(source: CalendarSource, state: DeviceState): Promise<string> {
  if (state.timeZone) return state.timeZone;
  const calendars = await source.listCalendars();
  return (calendars.find((c) => c.primary) ?? calendars[0])?.timeZone ?? 'UTC';
}

/**
 * One sync (spec 4.3): read projects.csv and config.yaml; ask each chosen calendar for what changed since
 * this device's last sync (a full read on the first one, after an expired token, or on rebuild); read the
 * days that entered the window since; re-read the window when the known codes changed; write the year
 * files that changed. The sync state is saved only after the files are, so a failure repeats the work
 * rather than skipping it.
 */
export async function sync(deps: SyncDeps, opts: { rebuild?: boolean } = {}): Promise<SyncResult> {
  const { source, files } = deps;
  const state = opts.rebuild ? { ...freshState(), timeZone: (await deps.state.load()).timeZone } : await deps.state.load();
  const timeZone = await timeZoneOf(source, state);
  const today = localDate(deps.now(), timeZone);

  const config = parseTimeConfig(await files.read(CONFIG, defaultTimeConfigText(today)), today).config;
  const projects = parseProjects(await files.read(PROJECTS, PROJECTS_HEADER));
  const known = knownCodes(projects.projects);
  const context: RowContext = { knownCodes: known, timeZone, allDayHours: config.allDayHours, trackFrom: config.trackFrom, today };

  const bases = new Map<string, string>();
  let yearFiles: YearFiles = new Map();
  for (const year of years(config.trackFrom, windowEnd(today))) {
    const text = await files.read(eventsFileName(year), EMPTY_YEAR);
    bases.set(year, text);
    yearFiles.set(year, opts.rebuild ? [] : parseEventsFile(text).rows);
  }
  const changed = new Set<string>(opts.rebuild ? [...bases.keys()] : []);
  const apply = (result: { files: YearFiles; changedYears: Set<string> }) => {
    yearFiles = result.files;
    for (const y of result.changedYears) changed.add(y);
  };
  const events: CalendarEvent[] = [];
  const tokens: Record<string, string> = {};

  // Calendars no longer chosen lose their rows (and their tokens, below).
  const chosen = new Set(config.calendars);
  for (const calendar of new Set([...yearFiles.values()].flat().map((r) => r.calendar))) {
    if (!chosen.has(calendar)) apply(removeCalendar(yearFiles, calendar));
  }

  for (const calendar of config.calendars) {
    let token = state.tokens[calendar] ?? null;
    let read;
    try {
      read = await source.readChanges(calendar, token);
    } catch (e) {
      if (!(e instanceof SyncTokenExpiredError) || token === null) throw e;
      token = null;
      read = await source.readChanges(calendar, null);
    }
    // A full read leaves out what was deleted meanwhile, so the calendar's rows are made again from it.
    if (token === null) apply(removeCalendar(yearFiles, calendar));
    apply(applyChanges(yearFiles, read.events, context));
    events.push(...read.events);
    tokens[calendar] = read.syncToken;
  }

  const codes = [...known].sort();
  const codesChanged = state.knownCodes !== null && JSON.stringify(codes) !== JSON.stringify(state.knownCodes);
  if (codesChanged) apply(recheckKnown(yearFiles, known));
  // Bare-code events gain or lose rows when the codes change, so the whole window is read again; otherwise
  // only the days that entered the window, which no sync token reports.
  const range = codesChanged ? { from: config.trackFrom, to: windowEnd(today) } : newlyInWindow(state.lastToday, today);
  if (range) {
    const at = (date: string) => formatLocal(startOfDay(date, timeZone), timeZone);
    for (const calendar of config.calendars) {
      const inRange = await source.readRange(calendar, at(range.from), at(range.to));
      apply(applyChanges(yearFiles, inRange, context));
      events.push(...inRange);
    }
  }

  for (const year of [...changed].sort()) {
    const rows = yearFiles.get(year) ?? [];
    const text = serializeEventsFile(rows);
    if (text !== bases.get(year)) await files.write(eventsFileName(year), text, bases.get(year)!);
    else changed.delete(year);
  }

  const allRows = [...yearFiles.values()].flat();
  const links = keepLinks(opts.rebuild ? {} : state.links, events, allRows);
  // Only the sync's own fields, onto the state as it is now: the colour queues are colouring's.
  const own = { tokens, lastToday: today, knownCodes: codes, timeZone, links };
  const next: DeviceState = opts.rebuild ? { ...state, ...own } : { ...(await deps.state.load()), ...own };
  await deps.state.save(next);
  return {
    events,
    changedYears: [...changed].sort(),
    allRows,
    rows: allRows.length,
    projects,
    fixCount: buildFixList(allRows).count,
    config,
    context,
    state: next,
  };
}

/** The links of the events just read, kept while their rows are unknown; the others' links stay as they were. */
function keepLinks(old: Record<string, string>, events: CalendarEvent[], rows: EventRow[]): Record<string, string> {
  const unknown = new Set(rows.filter((r) => !r.known).map((r) => keyOf(r.calendar, r.eventId)));
  const links = { ...old };
  for (const e of events) {
    const key = keyOf(e.calendarId, e.id);
    if (e.htmlLink && unknown.has(key)) links[key] = e.htmlLink;
    else delete links[key];
  }
  // A row that is no longer unknown (a project added) needs no link.
  for (const key of Object.keys(links)) if (!unknown.has(key)) delete links[key];
  return links;
}

/** The rows, projects and fix count from the files as this device has them, without the calendar (offline). */
export async function readSummary(
  files: TextFiles,
  state: StateStore,
  now: () => number,
): Promise<{ allRows: EventRow[]; rows: number; fixCount: number; projects: ProjectsFile }> {
  const timeZone = (await state.load()).timeZone ?? 'UTC';
  const today = localDate(now(), timeZone);
  const config = parseTimeConfig(await files.read(CONFIG, defaultTimeConfigText(today)), today).config;
  const projects = parseProjects(await files.read(PROJECTS, PROJECTS_HEADER));
  const allRows: EventRow[] = [];
  for (const year of years(config.trackFrom, windowEnd(today))) {
    allRows.push(...parseEventsFile(await files.read(eventsFileName(year), EMPTY_YEAR)).rows);
  }
  return { allRows, rows: allRows.length, fixCount: buildFixList(allRows).count, projects };
}
