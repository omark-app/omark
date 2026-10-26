// Turning a calendar event into tracked rows.
import { hoursBetween } from './hours.ts';
import type { CalendarEvent, EventTime } from './source.ts';
import { parseTitle } from './title.ts';
import { addDays, formatLocal, localDate, parseInstant, startOfDay } from './zone.ts';

/** Days ahead of today that are tracked. */
export const WINDOW_DAYS = 90;

export interface EventRow {
  date: string;
  start: string;
  end: string;
  hours: number;
  project: string;
  category: string;
  description: string;
  allDay: boolean;
  known: boolean;
  calendar: string;
  eventId: string;
  /** Unknown columns from the file, kept. */
  extra: Record<string, string>;
}

export interface RowContext {
  knownCodes: ReadonlySet<string>;
  timeZone: string;
  allDayHours: number;
  /** First tracked date, YYYY-MM-DD. */
  trackFrom: string;
  /** Today in the zone, YYYY-MM-DD. */
  today: string;
}

/** The first date after the window (exclusive). */
export function windowEnd(today: string): string {
  return addDays(today, WINDOW_DAYS);
}

/** The event's start date is on or after `trackFrom` and before the window end. */
export function inWindow(startDate: string, ctx: Pick<RowContext, 'trackFrom' | 'today'>): boolean {
  return ctx.trackFrom <= startDate && startDate < windowEnd(ctx.today);
}

function toMs(t: EventTime, tz: string): number {
  return 'date' in t ? startOfDay(t.date, tz) : parseInstant(t.dateTime);
}

/** The rows of one event; empty when it does not count. */
export function eventToRows(event: CalendarEvent, ctx: RowContext): EventRow[] {
  if (event.status === 'cancelled' || event.response === 'declined') return [];
  if (!event.start || !event.end) return [];
  const title = parseTitle(event.title, ctx.knownCodes);
  if (!title) return [];

  const tz = ctx.timeZone;
  const base = {
    project: title.code,
    category: title.category,
    description: title.description,
    known: title.known,
    calendar: event.calendarId,
    eventId: event.id,
  };
  const row = (date: string, startMs: number, endMs: number, hours: number, allDay: boolean): EventRow => ({
    date,
    start: formatLocal(startMs, tz),
    end: formatLocal(endMs, tz),
    hours,
    ...base,
    allDay,
    extra: {},
  });

  if ('date' in event.start) {
    const first = event.start.date;
    if (!inWindow(first, ctx)) return [];
    const last = 'date' in event.end ? event.end.date : localDate(toMs(event.end, tz), tz);
    const rows: EventRow[] = [];
    for (let d = first; d < last; d = addDays(d, 1)) {
      rows.push(row(d, startOfDay(d, tz), startOfDay(addDays(d, 1), tz), ctx.allDayHours, true));
    }
    return rows;
  }

  const startMs = toMs(event.start, tz);
  const endMs = toMs(event.end, tz);
  if (endMs < startMs || !inWindow(localDate(startMs, tz), ctx)) return [];

  const rows: EventRow[] = [];
  let from = startMs;
  let date = localDate(startMs, tz);
  for (;;) {
    const midnight = startOfDay(addDays(date, 1), tz);
    if (midnight < endMs) {
      rows.push(row(date, from, midnight, hoursBetween(from, midnight), false));
      from = midnight;
      date = addDays(date, 1);
    } else {
      rows.push(row(date, from, endMs, hoursBetween(from, endMs), false));
      return rows;
    }
  }
}
