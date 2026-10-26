import { hasRowTimes, inWindow, type RowContext } from './rows.ts';
import type { CalendarEvent, ColourPatch, EventTime, TrackerColour } from './source.ts';
import { parseTitle } from './title.ts';
import { localDate, parseInstant, startOfDay } from './zone.ts';

export interface ColourContext extends Pick<RowContext, 'knownCodes' | 'timeZone' | 'trackFrom' | 'today'> {
  /** Google colour ids the tracker uses. */
  ids: Record<TrackerColour, string>;
}

function startDate(start: EventTime | null, tz: string): string | null {
  if (!start) return null;
  return 'date' in start ? start.date : localDate(parseInstant(start.dateTime), tz);
}

function startMs(start: EventTime, tz: string): number {
  return 'date' in start ? startOfDay(start.date, tz) : parseInstant(start.dateTime);
}

/** What to set on an event; null means leave it alone. */
export function colourAction(event: CalendarEvent, ctx: ColourContext): ColourPatch | null {
  if (event.status === 'cancelled' || event.response === 'declined') return null;
  const date = startDate(event.start, ctx.timeZone);
  if (date === null || !inWindow(date, ctx) || !hasRowTimes(event, ctx.timeZone)) return null;
  const title = parseTitle(event.title, ctx.knownCodes);
  if (!title) return clearAction(event, ctx.ids);
  const want: TrackerColour = title.known ? 'green' : 'red';
  if (event.colorId === ctx.ids[want] && event.marker === want) return null;
  return { colorId: ctx.ids[want], marker: want };
}

/**
 * Takes the tracker's colour off an event it coloured. A colour the user
 * changed by hand stays; only the marker goes. Ignores window and status.
 */
export function clearAction(
  event: CalendarEvent,
  ids: Record<TrackerColour, string>,
): ColourPatch | null {
  if (event.marker === null) return null;
  if (event.colorId === ids[event.marker]) return { colorId: null, marker: null };
  return { colorId: event.colorId, marker: null };
}

/** The events that need a patch, newest start first. */
export function colourPlan(
  events: CalendarEvent[],
  ctx: ColourContext,
): { event: CalendarEvent; patch: ColourPatch }[] {
  const plan: { event: CalendarEvent; patch: ColourPatch; at: number }[] = [];
  for (const event of events) {
    const patch = colourAction(event, ctx);
    if (patch && event.start) plan.push({ event, patch, at: startMs(event.start, ctx.timeZone) });
  }
  plan.sort(
    (a, b) =>
      b.at - a.at ||
      (a.event.calendarId < b.event.calendarId ? -1 : a.event.calendarId > b.event.calendarId ? 1 : 0) ||
      (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0),
  );
  return plan.map(({ event, patch }) => ({ event, patch }));
}
