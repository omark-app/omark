import { expect, test } from 'vitest';
import type { CalendarEvent } from '../src/source.ts';
import { WINDOW_DAYS, eventToRows, inWindow, windowEnd, type RowContext } from '../src/rows.ts';

const ctx: RowContext = {
  knownCodes: new Set(['ACME']),
  timeZone: 'Europe/Warsaw',
  allDayHours: 8,
  trackFrom: '2026-01-01',
  today: '2026-10-26',
};

let n = 0;
function ev(p: Partial<CalendarEvent>): CalendarEvent {
  n += 1;
  return {
    calendarId: 'primary',
    id: `e${n}`,
    status: 'confirmed',
    title: 'ACME; Coding; x',
    start: { dateTime: '2026-10-22T09:00:00+02:00' },
    end: { dateTime: '2026-10-22T10:30:00+02:00' },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...p,
  };
}

const timed = (start: string, end: string, p: Partial<CalendarEvent> = {}) =>
  ev({ start: { dateTime: start }, end: { dateTime: end }, ...p });

test('window helpers', () => {
  expect(WINDOW_DAYS).toBe(90);
  expect(windowEnd('2026-10-26')).toBe('2027-01-24');
  expect(inWindow('2026-01-01', ctx)).toBe(true);
  expect(inWindow('2025-12-31', ctx)).toBe(false);
});

test('a structured event gives one row', () => {
  const e = ev({});
  expect(eventToRows(e, ctx)).toEqual([
    {
      date: '2026-10-22',
      start: '2026-10-22T09:00+02:00',
      end: '2026-10-22T10:30+02:00',
      hours: 1.5,
      project: 'ACME',
      category: 'Coding',
      description: 'x',
      allDay: false,
      known: true,
      calendar: 'primary',
      eventId: e.id,
      extra: {},
    },
  ]);
});

test('unknown code is kept, unstructured title is dropped', () => {
  const rows = eventToRows(ev({ title: 'OOO; away' }), ctx);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.known).toBe(false);
  expect(rows[0]!.project).toBe('OOO');
  expect(eventToRows(ev({ title: 'Lunch' }), ctx)).toEqual([]);
});

test('absent category and description are empty, code is upper case', () => {
  const [row] = eventToRows(ev({ title: 'acme' }), ctx);
  expect(row).toMatchObject({ project: 'ACME', category: '', description: '' });
});

test('an event across midnight is split per local day', () => {
  const rows = eventToRows(timed('2026-10-22T22:00:00+02:00', '2026-10-23T02:00:00+02:00'), ctx);
  expect(rows.map((r) => [r.date, r.start, r.end, r.hours])).toEqual([
    ['2026-10-22', '2026-10-22T22:00+02:00', '2026-10-23T00:00+02:00', 2],
    ['2026-10-23', '2026-10-23T00:00+02:00', '2026-10-23T02:00+02:00', 2],
  ]);
});

test('an event ending at midnight is one row', () => {
  const rows = eventToRows(timed('2026-10-22T09:00:00+02:00', '2026-10-23T00:00:00+02:00'), ctx);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.hours).toBe(15);
});

test('a split across New Year', () => {
  const rows = eventToRows(timed('2026-12-31T23:00:00+01:00', '2027-01-01T01:00:00+01:00'), ctx);
  expect(rows.map((r) => r.date)).toEqual(['2026-12-31', '2027-01-01']);
});

test('the DST change night counts real hours', () => {
  const rows = eventToRows(timed('2026-10-25T01:00:00+02:00', '2026-10-25T03:00:00+01:00'), ctx);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.hours).toBe(3);
  const [r] = eventToRows(timed('2026-10-25T01:00:00+02:00', '2026-10-25T04:00:00+01:00'), ctx);
  expect(r!.hours).toBe(4);
  expect(r!.end).toBe('2026-10-25T04:00+01:00');
});

test('an instant in another offset is shown in the zone', () => {
  const [row] = eventToRows(timed('2026-10-22T09:00:00-04:00', '2026-10-22T10:00:00-04:00'), ctx);
  expect(row!.start).toBe('2026-10-22T15:00+02:00');
  expect(row!.end).toBe('2026-10-22T16:00+02:00');
});

test('an all-day event gives a row per day', () => {
  const rows = eventToRows(ev({ start: { date: '2026-10-21' }, end: { date: '2026-10-24' } }), ctx);
  expect(rows.map((r) => [r.date, r.start, r.end, r.hours, r.allDay])).toEqual([
    ['2026-10-21', '2026-10-21T00:00+02:00', '2026-10-22T00:00+02:00', 8, true],
    ['2026-10-22', '2026-10-22T00:00+02:00', '2026-10-23T00:00+02:00', 8, true],
    ['2026-10-23', '2026-10-23T00:00+02:00', '2026-10-24T00:00+02:00', 8, true],
  ]);
});

test('declined, cancelled, tentative, needsAction', () => {
  expect(eventToRows(ev({ response: 'declined' }), ctx)).toEqual([]);
  expect(eventToRows(ev({ status: 'cancelled' }), ctx)).toEqual([]);
  expect(eventToRows(ev({ response: 'needsAction' }), ctx)).toHaveLength(1);
  expect(eventToRows(ev({ response: 'tentative' }), ctx)).toHaveLength(1);
  expect(eventToRows(ev({ status: 'tentative' }), ctx)).toHaveLength(1);
});

test('missing times or end before start give nothing', () => {
  expect(eventToRows(ev({ start: null }), ctx)).toEqual([]);
  expect(eventToRows(ev({ end: null }), ctx)).toEqual([]);
  expect(eventToRows(timed('2026-10-22T10:00:00+02:00', '2026-10-22T09:00:00+02:00'), ctx)).toEqual([]);
});

test('the window edges', () => {
  const at = (d: string) => eventToRows(timed(`${d}T09:00:00+01:00`, `${d}T10:00:00+01:00`), ctx);
  expect(at('2025-12-31')).toEqual([]);
  expect(at('2026-01-01')).toHaveLength(1);
  expect(at('2027-01-23')).toHaveLength(1);
  expect(at('2027-01-24')).toEqual([]);
});

test('the window uses the start date in the zone', () => {
  // 2025-12-31T23:30Z is 2026-01-01 00:30 in Warsaw.
  expect(eventToRows(timed('2025-12-31T23:30:00Z', '2026-01-01T00:30:00Z'), ctx)).toHaveLength(1);
});

test('a zero-length event gives one row with 0 hours', () => {
  const rows = eventToRows(timed('2026-10-22T09:00:00+02:00', '2026-10-22T09:00:00+02:00'), ctx);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.hours).toBe(0);
});

test('instances of a series are separate rows with their own ids', () => {
  const a = ev({ recurringEventId: 's', id: 's_1' });
  const b = ev({ recurringEventId: 's', id: 's_2' });
  expect(eventToRows(a, ctx)[0]!.eventId).toBe('s_1');
  expect(eventToRows(b, ctx)[0]!.eventId).toBe('s_2');
});
