import { expect, test } from 'vitest';
import type { CalendarEvent } from '../src/source.ts';
import { clearAction, colourAction, colourPlan, type ColourContext } from '../src/colour.ts';

const ids = { green: '10', red: '11' } as const;
const ctx: ColourContext = {
  knownCodes: new Set(['ACME']),
  ids: { ...ids },
  timeZone: 'Europe/Warsaw',
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
    title: 'ACME; x',
    start: { dateTime: '2026-10-22T09:00:00+02:00' },
    end: { dateTime: '2026-10-22T10:00:00+02:00' },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...p,
  };
}

test('a known code turns green', () => {
  expect(colourAction(ev({}), ctx)).toEqual({ colorId: '10', marker: 'green' });
});

test('a user colour on a structured title is overwritten', () => {
  expect(colourAction(ev({ colorId: '5' }), ctx)).toEqual({ colorId: '10', marker: 'green' });
});

test('already green with the marker is left alone', () => {
  expect(colourAction(ev({ colorId: '10', marker: 'green' }), ctx)).toBeNull();
});

test('green without the marker gets the marker', () => {
  expect(colourAction(ev({ colorId: '10' }), ctx)).toEqual({ colorId: '10', marker: 'green' });
});

test('an unknown code turns red', () => {
  expect(colourAction(ev({ title: 'OOO; x' }), ctx)).toEqual({ colorId: '11', marker: 'red' });
});

test('a known code that was red turns green', () => {
  expect(colourAction(ev({ colorId: '11', marker: 'red' }), ctx)).toEqual({ colorId: '10', marker: 'green' });
});

test('a plain title with no marker is left alone', () => {
  expect(colourAction(ev({ title: 'Lunch', colorId: '5' }), ctx)).toBeNull();
});

test('a plain title the tracker coloured is cleared', () => {
  const e = ev({ title: 'Lunch', colorId: '10', marker: 'green' });
  expect(colourAction(e, ctx)).toEqual({ colorId: null, marker: null });
});

test('a hand-changed colour stays when the marker is dropped (call 7)', () => {
  const e = ev({ title: 'Lunch', colorId: '5', marker: 'green' });
  expect(colourAction(e, ctx)).toEqual({ colorId: '5', marker: null });
});

test('declined and cancelled events are never touched', () => {
  expect(colourAction(ev({ response: 'declined' }), ctx)).toBeNull();
  expect(colourAction(ev({ status: 'cancelled' }), ctx)).toBeNull();
  const old = { title: 'Lunch', colorId: '10', marker: 'green' } as const;
  expect(colourAction(ev({ ...old, response: 'declined' }), ctx)).toBeNull();
  expect(colourAction(ev({ ...old, status: 'cancelled' }), ctx)).toBeNull();
});

test('events outside the window are left alone', () => {
  const before = { dateTime: '2025-12-31T23:00:00+01:00' };
  expect(colourAction(ev({ start: before }), ctx)).toBeNull();
  expect(colourAction(ev({ start: { dateTime: '2027-01-24T09:00:00+01:00' } }), ctx)).toBeNull();
  expect(colourAction(ev({ start: { date: '2027-01-24' } }), ctx)).toBeNull();
  expect(colourAction(ev({ start: { date: '2026-10-22' }, end: { date: '2026-10-23' } }), ctx)).toEqual({ colorId: '10', marker: 'green' });
});

test('the start date is read in the calendar zone', () => {
  // 2026-01-01 00:30 in Warsaw is still 2025-12-31 in UTC
  const start = { dateTime: '2025-12-31T23:30:00Z' };
  expect(colourAction(ev({ start }), ctx)).toEqual({ colorId: '10', marker: 'green' });
});

test('an event with no start is left alone', () => {
  expect(colourAction(ev({ start: null }), ctx)).toBeNull();
});

test('clearAction clears a colour the tracker set', () => {
  expect(clearAction(ev({ colorId: '11', marker: 'red' }), ids)).toEqual({ colorId: null, marker: null });
});

test('clearAction does nothing without a marker', () => {
  expect(clearAction(ev({ colorId: '11' }), ids)).toBeNull();
});

test('clearAction keeps a hand-changed colour', () => {
  expect(clearAction(ev({ colorId: '5', marker: 'red' }), ids)).toEqual({ colorId: '5', marker: null });
});

test('colourPlan keeps events needing a patch, latest start first', () => {
  const a = ev({ start: { dateTime: '2026-10-20T09:00:00+02:00' } });
  const b = ev({ start: { dateTime: '2026-10-22T09:00:00+02:00' } });
  const done = ev({ colorId: '10', marker: 'green' });
  const c = ev({ title: 'OOO', start: { dateTime: '2026-10-21T09:00:00+02:00' } });
  const d = ev({ title: 'OOO; y', start: { date: '2026-10-23' }, end: { date: '2026-10-24' } });
  const input = [a, done, b, c, d];
  const plan = colourPlan(input, ctx);
  expect(plan.map((p) => p.event)).toEqual([d, b, a]);
  expect(plan[0]!.patch).toEqual({ colorId: '11', marker: 'red' });
  expect(plan[1]!.patch).toEqual({ colorId: '10', marker: 'green' });
  expect(input).toEqual([a, done, b, c, d]);
});

test('colourPlan breaks ties by calendar then id', () => {
  const start = { dateTime: '2026-10-22T09:00:00+02:00' };
  const x = ev({ calendarId: 'b', id: 'a', start });
  const y = ev({ calendarId: 'a', id: 'z', start });
  const z = ev({ calendarId: 'a', id: 'b', start });
  expect(colourPlan([x, y, z], ctx).map((p) => p.event)).toEqual([z, y, x]);
});

test('an event whose times give no rows is left alone', () => {
  expect(colourAction(ev({ end: null }), ctx)).toBeNull();
  expect(colourAction(ev({ end: { dateTime: '2026-10-22T08:00:00+02:00' } }), ctx)).toBeNull();
  expect(colourAction(ev({ start: { date: '2026-10-22' }, end: { date: '2026-10-22' } }), ctx)).toBeNull();
  // A zero-length event gives a 0-hour row, so it is coloured.
  const zero = { dateTime: '2026-10-22T09:00:00+02:00' };
  expect(colourAction(ev({ start: zero, end: zero }), ctx)).toEqual({ colorId: '10', marker: 'green' });
});
