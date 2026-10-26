import { addDays, formatLocal, startOfDay, weekday } from '@omark/time-core';
import type { CalendarEvent, CalendarInfo, ResponseStatus } from '@omark/time-core';

const DAYS_BEFORE = 10;
const DAYS_AFTER = 4;
const MINUTE = 60_000;

const PROJECTS_CSV = [
  'code,description,client,rate,currency,archived',
  'ACME,Acme Corp website rebuild,Acme Corp,120,EUR,',
  'MYAPP,My app - product work,,,,',
  'OLD,Old client,Old Co,90,PLN,2026-06-30',
  '',
].join('\n');

interface Item {
  title: string;
  /** Local wall time in minutes from midnight; absent for an all-day event. */
  at?: [start: number, end: number];
  response?: ResponseStatus;
}

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * What happens on each work day, in order from the first one in the window.
 * The window always has at least ten work days.
 */
const DAYS: Item[][] = [
  [{ title: 'ACME; Coding; Homepage layout', at: [h(9), h(12)] }, { title: 'Lunch', at: [h(12, 30), h(13, 15)] }],
  [{ title: 'MYAPP; Design; Settings screen', at: [h(10), h(13)] }, { title: 'ACME; Meetings; Weekly sync', at: [h(14), h(15)] }],
  [
    { title: 'ACME; CS; Support tickets', at: [h(9), h(10, 30)] },
    { title: 'ACME; Coding; API work', at: [h(11), h(14)] },
    { title: 'Gym', at: [h(17), h(18)] },
  ],
  [{ title: 'MYAPP; Design; Onboarding flow', at: [h(9), h(12)] }, { title: 'Lunch', at: [h(12, 30), h(13, 15)] }],
  // The overlap: both run from 10:30 to 11:00.
  [{ title: 'ACME; Coding; Checkout page', at: [h(9), h(11)] }, { title: 'ACME; Meetings; Client call', at: [h(10, 30), h(11, 30)] }],
  [{ title: 'ACMEE; Coding; typo', at: [h(10), h(12)] }, { title: 'Gym', at: [h(17), h(18)] }],
  [{ title: 'MYAPP; Conference' }],
  [{ title: 'ACME; Coding; Invoice export', at: [h(9), h(13)] }, { title: 'Lunch', at: [h(13), h(13, 45)] }],
  [
    { title: 'ACME; Meetings; kickoff', at: [h(10), h(11)], response: 'needsAction' },
    { title: 'ACME; CS; Release notes', at: [h(13), h(14)] },
  ],
  [
    { title: 'ACME; Meetings; skipped', at: [h(12), h(13)], response: 'declined' },
    { title: 'MYAPP; Design; Icon set', at: [h(9), h(11, 30)] },
  ],
  [{ title: 'ACME; Coding; Bug fixes', at: [h(9), h(12)] }, { title: 'Gym', at: [h(17), h(18)] }],
];

/**
 * About two weeks of calendar events around `today`, and sample projects, for
 * the demo and the e2e. Pure: the same arguments give the same seed. The days
 * are the work days from 10 days before `today` to 4 days after; moving
 * `today` by 7 days moves everything by 7 days.
 */
export function demoSeed(
  today: string,
  timeZone: string,
): { calendars: CalendarInfo[]; events: CalendarEvent[]; projectsCsv: string } {
  const calendars: CalendarInfo[] = [{ id: 'primary', name: 'Demo calendar', primary: true, timeZone, owned: true }];

  const workDays: string[] = [];
  for (let d = addDays(today, -DAYS_BEFORE); d <= addDays(today, DAYS_AFTER); d = addDays(d, 1)) {
    if (weekday(d) <= 4) workDays.push(d);
  }

  const events: CalendarEvent[] = [];
  for (const [i, date] of workDays.entries()) {
    for (const item of DAYS[i] ?? []) {
      events.push(toEvent(`demo-${events.length + 1}`, item, date, timeZone));
    }
  }
  return { calendars, events, projectsCsv: PROJECTS_CSV };
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

/** A local wall time as an RFC 3339 instant with the zone's offset at that instant. */
function local(date: string, minutes: number, tz: string): { dateTime: string } {
  const ms = startOfDay(date, tz) + minutes * MINUTE;
  return { dateTime: formatLocal(ms, tz).replace(/(T\d\d:\d\d)([+-])/, '$1:00$2') };
}
