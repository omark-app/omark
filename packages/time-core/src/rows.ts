// Turning a calendar event into tracked rows.
import { hoursBetween } from './hours.ts';
import type { CalendarEvent, EventTime } from './source.ts';
import { parseTitle } from './title.ts';
import { addDays, formatLocal, localDate, parseInstant, startOfDay } from './zone.ts';

/** Code-point order of two strings, for sorting. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One map key for an event: its calendar and event id. */
export function keyOf(calendar: string, eventId: string): string {
  return JSON.stringify([calendar, eventId]);
}

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

/**
 * The event's times can give rows: it has a start and an end, a timed event
 * does not end before it starts, and an all-day event ends after its first day.
 */
export function hasRowTimes(event: CalendarEvent, tz: string): boolean {
  if (!event.start || !event.end) return false;
  if ('date' in event.start) {
    const endDate = 'date' in event.end ? event.end.date : localDate(toMs(event.end, tz), tz);
    return endDate > event.start.date;
  }
  return toMs(event.end, tz) >= toMs(event.start, tz);
}

/**
 * The rows of one event; empty when it does not count. Rows stop at the
 * window end: nothing is dated on or after `windowEnd(ctx.today)`, so a very
 * long event cannot make a huge number of rows.
 */
export function eventToRows(event: CalendarEvent, ctx: RowContext): EventRow[] {
  if (event.status === 'cancelled' || event.response === 'declined') return [];
  if (!event.start || !event.end || !hasRowTimes(event, ctx.timeZone)) return [];
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
    const endDate = 'date' in event.end ? event.end.date : localDate(toMs(event.end, tz), tz);
    const last = endDate < windowEnd(ctx.today) ? endDate : windowEnd(ctx.today);
    const rows: EventRow[] = [];
    for (let d = first; d < last; d = addDays(d, 1)) {
      rows.push(row(d, startOfDay(d, tz), startOfDay(addDays(d, 1), tz), ctx.allDayHours, true));
    }
    return rows;
  }

  const startMs = toMs(event.start, tz);
  const rawEndMs = toMs(event.end, tz);
  if (!inWindow(localDate(startMs, tz), ctx)) return [];

  const endMs = Math.min(rawEndMs, startOfDay(windowEnd(ctx.today), tz));
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
