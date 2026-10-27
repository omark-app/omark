import { expect, test } from 'vitest';
import {
  addDays,
  buildFixList,
  daysBetween,
  eventToRows,
  knownCodes,
  parseProjects,
  weekday,
} from '@omark/time-core';
import type { CalendarEvent, EventRow } from '@omark/time-core';
import { FakeCalendar } from '../src/fake.ts';
import { demoSeed } from '../src/seed.ts';
import { local } from '../src/wall-time.ts';

const TODAY = '2026-10-26';
const TZ = 'Europe/Warsaw';

function rowsOf(today: string, tz: string): EventRow[] {
  const seed = demoSeed(today, tz);
  const codes = knownCodes(parseProjects(seed.projectsCsv).projects);
  const ctx = { knownCodes: codes, timeZone: tz, allDayHours: 8, trackFrom: addDays(today, -10), today };
  return seed.events.flatMap((e) => eventToRows(e, ctx));
}

const startDate = (e: CalendarEvent) => ('date' in e.start! ? e.start.date : e.start!.dateTime.slice(0, 10));

test('the calendar and projects', () => {
  const seed = demoSeed(TODAY, TZ);
  expect(seed.calendars).toEqual([{ id: 'primary', name: 'Demo calendar', primary: true, timeZone: TZ, owned: true }]);
  const file = parseProjects(seed.projectsCsv);
  expect(file.problems).toEqual([]);
  expect(file.projects.find((p) => p.code === 'MYAPP')?.description).toBe('My app - product work');
  expect(file.projects.map((p) => [p.code, p.client, p.rate, p.currency, p.archived])).toEqual([
    ['ACME', 'Acme Corp', 120, 'EUR', ''],
    ['MYAPP', '', null, '', ''],
    ['OLD', 'Old Co', 90, 'PLN', '2026-06-30'],
  ]);
});

test('the rows show what the demo needs', () => {
  const rows = rowsOf(TODAY, TZ);
  const hours = (code: string) => rows.filter((r) => r.known && r.project === code).reduce((s, r) => s + r.hours, 0);
  expect(hours('ACME')).toBeGreaterThan(0);
  expect(hours('MYAPP')).toBeGreaterThan(0);
  expect(rows.some((r) => !r.known && r.project === 'ACMEE')).toBe(true);
  expect(rows.filter((r) => r.allDay).map((r) => r.project)).toEqual(['MYAPP']);
  expect(rows.some((r) => r.description === 'kickoff')).toBe(true);
  expect(rows.some((r) => r.description === 'skipped')).toBe(false);
  expect(rows.some((r) => /Lunch|Gym/.test(r.description) || /Lunch|Gym/.test(r.project))).toBe(false);
  const fix = buildFixList(rows);
  expect(fix.overlaps).toHaveLength(1);
  expect(fix.unknown.map((u) => u.code)).toEqual(['ACMEE']);
});

test('the events: weekdays inside the window, unique ids, colours', () => {
  const { events } = demoSeed(TODAY, TZ);
  for (const e of events) {
    const date = startDate(e);
    expect(date >= addDays(TODAY, -10) && date <= addDays(TODAY, 4)).toBe(true);
    expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBeGreaterThan(0);
    expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBeLessThan(6);
    expect(e.calendarId).toBe('primary');
  }
  expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  expect(events.every((e) => /^demo-\d+$/.test(e.id))).toBe(true);
  expect(events.find((e) => e.title === 'Lunch')).toBeDefined();
  expect(events.find((e) => e.title === 'Gym')).toBeDefined();
  expect(events.every((e) => e.colorId === null && e.marker === null)).toBe(true);
  expect(events.find((e) => e.title === 'ACME; Meetings; kickoff')?.response).toBe('needsAction');
  expect(events.find((e) => e.title === 'ACME; Meetings; skipped')?.response).toBe('declined');
  expect(events.find((e) => e.title === 'MYAPP; Conference')?.start).toHaveProperty('date');
});

test('the same call gives the same seed, and the fake calendar takes it', async () => {
  expect(demoSeed(TODAY, TZ)).toEqual(demoSeed(TODAY, TZ));
  const seed = demoSeed(TODAY, TZ);
  const fake = new FakeCalendar(seed.calendars, seed.events);
  const read = await fake.readChanges('primary', null);
  expect(read.events).toHaveLength(seed.events.length);
});

test('another day gives the same shape, moved', () => {
  const a = demoSeed(TODAY, TZ);
  const b = demoSeed(addDays(TODAY, 7), TZ);
  expect(b.events.map((e) => e.title)).toEqual(a.events.map((e) => e.title));
  expect(b.events.map((e) => e.id)).toEqual(a.events.map((e) => e.id));
  for (const [i, e] of a.events.entries()) {
    expect(daysBetween(startDate(e), startDate(b.events[i]!))).toBe(7);
  }
});

const ZONES = [
  // [today, zone, first date with the new offset, offset before, offset after]
  ['2026-03-30', 'Europe/Warsaw', '2026-03-29', '+01:00', '+02:00'],
  ['2026-03-30', 'Asia/Jerusalem', '2026-03-27', '+02:00', '+03:00'],
  ['2026-04-27', 'Africa/Cairo', '2026-04-24', '+02:00', '+03:00'],
] as const;

test.each(ZONES)('around a DST change (%s %s) the wall times stay the same', (today, zone, from, before, after) => {
  const base = demoSeed(TODAY, TZ).events;
  const spring = demoSeed(today, zone).events;
  expect(spring.map((e) => e.id)).toEqual(base.map((e) => e.id));
  let changeDay = false;
  for (const [i, e] of base.entries()) {
    const s = spring[i]!;
    if ('date' in e.start!) continue;
    const st = s.start as { dateTime: string };
    const en = s.end as { dateTime: string };
    expect(st.dateTime.slice(11, 19)).toBe((e.start as { dateTime: string }).dateTime.slice(11, 19));
    expect(en.dateTime.slice(11, 19)).toBe((e.end as { dateTime: string }).dateTime.slice(11, 19));
    const offset = st.dateTime.slice(0, 10) < from ? before : after;
    expect(st.dateTime.endsWith(offset)).toBe(true);
    expect(en.dateTime.endsWith(offset)).toBe(true);
    if (st.dateTime.slice(0, 10) === from) changeDay = true;
  }
  if (weekday(from) <= 4) expect(changeDay).toBe(true);
});

test('Gym is at 17:00 local on the Jerusalem change day', () => {
  const gym = demoSeed('2026-03-30', 'Asia/Jerusalem').events.find(
    (e) => e.title === 'Gym' && (e.start as { dateTime: string }).dateTime.startsWith('2026-03-27'),
  );
  expect((gym?.start as { dateTime: string }).dateTime).toBe('2026-03-27T17:00:00+03:00');
});

test('another day gives the same shape, moved, in Jerusalem too', () => {
  const a = demoSeed('2026-03-23', 'Asia/Jerusalem').events;
  const b = demoSeed('2026-03-30', 'Asia/Jerusalem').events;
  expect(b.map((e) => e.title)).toEqual(a.map((e) => e.title));
  for (const [i, e] of a.entries()) {
    expect(daysBetween(startDate(e), startDate(b[i]!))).toBe(7);
    if ('date' in e.start!) continue;
    expect((b[i]!.start as { dateTime: string }).dateTime.slice(11, 19)).toBe((e.start as { dateTime: string }).dateTime.slice(11, 19));
  }
});

test.each([
  ['Santiago, skipped midnight', '2026-09-06', 0, 'America/Santiago', '2026-09-06T01:00:00-03:00'],
  ['New York, skipped 02:30', '2026-03-08', 150, 'America/New_York', '2026-03-08T03:30:00-04:00'],
  ['New York, repeated 01:30', '2026-11-01', 90, 'America/New_York', '2026-11-01T01:30:00-05:00'],
  ['Warsaw, repeated 02:30', '2026-10-25', 150, 'Europe/Warsaw', '2026-10-25T02:30:00+01:00'],
  ['Warsaw, skipped 02:30', '2026-03-29', 150, 'Europe/Warsaw', '2026-03-29T03:30:00+02:00'],
  ['Cairo, skipped midnight', '2026-04-24', 0, 'Africa/Cairo', '2026-04-24T01:00:00+03:00'],
  ['an ordinary time', '2026-06-10', 570, 'America/Santiago', '2026-06-10T09:30:00-04:00'],
])('wall time: %s', (_name, date, minutes, zone, expected) => {
  expect(local(date, minutes, zone)).toEqual({ dateTime: expected });
});
