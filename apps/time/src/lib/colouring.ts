import { clearAction, colourAction, compareText, EditAccessRequiredError, formatLocal, keyOf, parseInstant, startOfDay, windowEnd } from '@omark/time-core';
import type { CalendarEvent, CalendarSource, ColourContext, EventTime } from '@omark/time-core';
import type { ColourJob, DeviceState, StateStore } from './state.ts';
import type { SyncResult } from './sync.ts';

export interface ColourDeps {
  source: CalendarSource;
  state: StateStore;
  /** Asked before each patch; true stops the run (the queue stays for the next one). */
  shouldStop?: () => boolean;
  onProgress?: (left: number) => void;
}

/** `off`: colouring is off; `needs-edit`: this device's sign-in can't edit events; `stopped`: asked to stop. */
export type ColourOutcome = 'off' | 'done' | 'needs-edit' | 'stopped';

type Queue = 'colourQueue' | 'clearQueue';

const at = (start: EventTime, tz: string) => ('date' in start ? startOfDay(start.date, tz) : parseInstant(start.dateTime));

const newestFirst = (a: ColourJob, b: ColourJob) =>
  b.at - a.at || compareText(a.calendarId, b.calendarId) || compareText(a.eventId, b.eventId);

/**
 * The queue with `events` planned again: each one's old job is dropped, and a new one added when it still
 * needs a patch. So a sync before a job's turn never sends a stale colour.
 */
function plan(queue: ColourJob[], events: CalendarEvent[], patchFor: (e: CalendarEvent) => ColourJob['patch'] | null, tz: string): ColourJob[] {
  const latest = new Map(events.map((e) => [keyOf(e.calendarId, e.id), e]));
  const kept = queue.filter((j) => !latest.has(keyOf(j.calendarId, j.eventId)));
  for (const e of latest.values()) {
    const patch = patchFor(e);
    if (patch && e.start) kept.push({ calendarId: e.calendarId, eventId: e.id, patch, at: at(e.start, tz) });
  }
  return kept.sort(newestFirst);
}

/** Every event in the window (track_from to 90 days ahead) of the chosen calendars. */
async function windowEvents(source: CalendarSource, result: SyncResult): Promise<CalendarEvent[]> {
  const { trackFrom, today, timeZone: tz } = result.context;
  const out: CalendarEvent[] = [];
  for (const calendar of result.config.calendars) {
    out.push(...(await source.readRange(calendar, formatLocal(startOfDay(trackFrom, tz), tz), formatLocal(startOfDay(windowEnd(today), tz), tz))));
  }
  return out;
}

/**
 * After a sync (spec 8): with colouring off, the colour queue is dropped and only a clear the user asked for
 * runs. With it on, the whole window is planned the first time, then only what the sync read; the plan is
 * saved before the first patch, then sent newest first.
 */
export async function colourAfterSync(result: SyncResult, deps: ColourDeps): Promise<ColourOutcome> {
  const state = await deps.state.load();
  if (!result.config.colourEvents) {
    if (state.colourQueue.length > 0 || state.colourPlanned) await deps.state.save({ ...state, colourQueue: [], colourPlanned: false });
    return state.clearQueue.length > 0 ? runQueue('clearQueue', deps) : 'off';
  }
  const ctx: ColourContext = { ...result.context, ids: await deps.source.colourIds() };
  const events = state.colourPlanned ? result.events : await windowEvents(deps.source, result);
  const colourQueue = plan(state.colourQueue, events, (e) => colourAction(e, ctx), ctx.timeZone);
  await deps.state.save({ ...state, colourQueue, colourPlanned: true, clearQueue: [] });
  return runQueue('colourQueue', deps);
}

/** Plans taking the tracker's colours off the window's events (colouring turned off); returns how many. */
export async function planClear(result: SyncResult, deps: Pick<ColourDeps, 'source' | 'state'>): Promise<number> {
  const ids = await deps.source.colourIds();
  const events = await windowEvents(deps.source, result);
  const state: DeviceState = await deps.state.load();
  const clearQueue = plan([], events, (e) => clearAction(e, ids), result.context.timeZone);
  await deps.state.save({ ...state, clearQueue });
  return clearQueue.length;
}

/** Sends a queue's patches in order, saving the queue after each, so a reload carries on where this stopped. */
export async function runQueue(queue: Queue, deps: ColourDeps): Promise<ColourOutcome> {
  let state = await deps.state.load();
  while (state[queue].length > 0) {
    if (deps.shouldStop?.()) return 'stopped';
    const [job, ...rest] = state[queue];
    try {
      await deps.source.setColour(job!.calendarId, job!.eventId, job!.patch);
    } catch (e) {
      if (e instanceof EditAccessRequiredError) return 'needs-edit';
      throw e;
    }
    state = { ...(await deps.state.load()), [queue]: rest };
    await deps.state.save(state);
    deps.onProgress?.(rest.length);
  }
  return 'done';
}
