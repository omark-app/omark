// Applying calendar changes to the year files.
import { compareRows, serializeEventsFile, type YearFiles } from './events-file.ts';
import { eventToRows, windowEnd, type EventRow, type RowContext } from './rows.ts';
import type { CalendarEvent } from './source.ts';

interface Result {
  files: YearFiles;
  changedYears: Set<string>;
}

/** Keep `next` for each touched year whose written content differs from before. */
function finish(files: YearFiles, next: Map<string, EventRow[]>): Result {
  const out: YearFiles = new Map(files);
  const changedYears = new Set<string>();
  for (const [year, rows] of next) {
    const sorted = [...rows].sort(compareRows);
    const before = files.get(year);
    const changed = serializeEventsFile(sorted) !== serializeEventsFile(before ?? []);
    if (changed) {
      changedYears.add(year);
      out.set(year, sorted);
    }
  }
  return { files: out, changedYears };
}

/**
 * Replace the rows of each given event (found by calendar and event id, in
 * every year) with the rows it now gives. The input is not changed.
 */
export function applyChanges(files: YearFiles, events: CalendarEvent[], ctx: RowContext): Result {
  // The last occurrence of an event wins.
  const latest = new Map<string, CalendarEvent>();
  for (const e of events) latest.set(`${e.calendarId}
${e.id}`, e);

  const next = new Map<string, EventRow[]>();
  const oldExtra = new Map<string, Record<string, string>>();
  for (const [year, rows] of files) {
    if (rows.some((r) => latest.has(`${r.calendar}
${r.eventId}`))) {
      const kept: EventRow[] = [];
      for (const r of rows) {
        const key = `${r.calendar}
${r.eventId}`;
        if (latest.has(key)) oldExtra.set(`${key}
${r.date}`, r.extra);
        else kept.push(r);
      }
      next.set(year, kept);
    }
  }
  for (const [key, event] of latest) {
    for (const row of eventToRows(event, ctx)) {
      const year = row.date.slice(0, 4);
      let list = next.get(year);
      if (!list) {
        list = [...(files.get(year) ?? [])];
        next.set(year, list);
      }
      list.push({ ...row, extra: { ...(oldExtra.get(`${key}
${row.date}`) ?? {}) } });
    }
  }
  return finish(files, next);
}

/**
 * Set `known` on every row from the current project codes. The input is not
 * changed. It only flips `known` on rows that exist: when the set of known
 * codes changes, events titled with a bare code (`OOO`, no `;`) gain or lose
 * rows and colours too, so the caller must also re-read the window (readRange
 * from track_from to the window end) and run applyChanges and colourPlan on it.
 */
export function recheckKnown(files: YearFiles, knownCodes: ReadonlySet<string>): Result {
  const next = new Map<string, EventRow[]>();
  for (const [year, rows] of files) {
    if (rows.some((r) => r.known !== knownCodes.has(r.project))) {
      next.set(
        year,
        rows.map((r) => ({ ...r, known: knownCodes.has(r.project) })),
      );
    }
  }
  return finish(files, next);
}

/**
 * The local dates that entered the window since the last sync, [from, to);
 * null when there are none or this is the first sync.
 */
export function newlyInWindow(lastToday: string | null, today: string): { from: string; to: string } | null {
  if (lastToday === null || lastToday >= today) return null;
  return { from: windowEnd(lastToday), to: windowEnd(today) };
}
