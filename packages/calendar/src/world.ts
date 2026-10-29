import { addDays, weekday } from '@omark/time-core';
import type { CalendarEvent, CalendarInfo, ResponseStatus } from '@omark/time-core';
import { local } from './wall-time.ts';

interface Item {
  title: string;
  /** Local wall time in minutes from midnight; absent for an all-day event. */
  at?: [start: number, end: number];
  response?: ResponseStatus;
}

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Maya's work days, in order from the first one in the window: most hours on the client, NOVA, a little on her
 * course, an early run. The window always has ten work days, sometimes eleven.
 */
const DAYS: Item[][] = [
  [{ title: 'NOVA; Design; Onboarding screens', at: [h(9), h(12, 30)] }, { title: 'Lunch', at: [h(13), h(14)] }],
  [{ title: 'NOVA; Meetings; Weekly sync', at: [h(10), h(11)] }, { title: 'NOVA; Design; Card controls', at: [h(11, 30), h(15)] }],
  [
    { title: 'COURSE; Writing; Lesson 1 outline', at: [h(8), h(9)] },
    { title: 'NOVA; Design; Card controls', at: [h(9, 30), h(13)] },
    { title: 'Coffee with Inês', at: [h(17, 30), h(18, 30)] },
  ],
  [
    { title: 'RUN; Training; Intervals', at: [h(7), h(8)] },
    { title: 'NOVA; Research; User interviews', at: [h(10), h(12, 30)] },
    { title: 'NOVA; Design; Interview notes', at: [h(14), h(16)] },
  ],
  // The overlap: both run from 10:30 to 11:00.
  [{ title: 'NOVA; Design; Payments flow', at: [h(9), h(11)] }, { title: 'NOVA; Meetings; Client review', at: [h(10, 30), h(11, 30)] }],
  // The unknown code to fix: COURS for COURSE.
  [{ title: 'COURS; Recording; Intro video', at: [h(8), h(9)] }, { title: 'NOVA; Design; Payments flow', at: [h(10), h(14)] }],
  [{ title: 'NOVA; Workshop' }],
  [{ title: 'NOVA; Design; Design system', at: [h(9), h(13)] }, { title: 'Lunch', at: [h(13), h(13, 45)] }],
  [
    { title: 'NOVA; Meetings; Sprint planning', at: [h(10), h(11)], response: 'needsAction' },
    { title: 'NOVA; Design; Handoff', at: [h(13), h(16)] },
  ],
  [
    { title: 'NOVA; Meetings; Release demo', at: [h(12), h(13)], response: 'declined' },
    { title: 'NOVA; Design; Icons', at: [h(9), h(11, 30)] },
  ],
  [{ title: 'NOVA; Design; Bug review', at: [h(9), h(12)] }, { title: 'Dinner with friends', at: [h(19, 30), h(22)] }],
];

/** Every Saturday: her long run. */
const SATURDAY: Item = { title: 'RUN; Training; Long run', at: [h(8), h(9, 45)] };

/**
 * The calendar of the one app's demo world (one app spec, section 9): Maya's events from 10 days before
 * `today` to 4 days after, in `timeZone`. Pure: the same arguments give the same events.
 */
export function worldCalendar(today: string, timeZone: string): { calendars: CalendarInfo[]; events: CalendarEvent[] } {
  const calendars: CalendarInfo[] = [{ id: 'primary', name: 'Maya', primary: true, timeZone, owned: true }];
  const events: CalendarEvent[] = [];
  let work = 0;
  for (let d = addDays(today, -10); d <= addDays(today, 4); d = addDays(d, 1)) {
    const day = weekday(d);
    const items = day <= 4 ? (DAYS[work++] ?? []) : day === 5 ? [SATURDAY] : [];
    for (const item of items) events.push(toEvent(`world-${events.length + 1}`, item, d, timeZone));
  }
  return { calendars, events };
}

function toEvent(id: string, item: Item, date: string, tz: string): CalendarEvent {
  return {
    calendarId: 'primary',
    id,
    status: 'confirmed',
    title: item.title,
    ...(item.at
      ? { start: local(date, item.at[0], tz), end: local(date, item.at[1], tz) }
      : { start: { date }, end: { date: addDays(date, 1) } }),
    response: item.response ?? null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
  };
}
