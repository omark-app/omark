import { expect, test } from 'vitest';
import { buildFixList } from '../src/fix-list.ts';
import type { EventRow } from '../src/rows.ts';

function row(over: Partial<EventRow>): EventRow {
  return {
    date: '2026-10-26',
    start: '2026-10-26T09:00+00:00',
    end: '2026-10-26T10:00+00:00',
    hours: 1,
    project: 'ACME',
    category: '',
    description: '',
    allDay: false,
    known: true,
    calendar: 'c',
    eventId: 'e',
    extra: {},
    ...over,
  };
}

test('an unknown event over two days appears once', () => {
  const list = buildFixList([
    row({ known: false, project: 'OOO', description: 'away', eventId: 'x', date: '2026-10-26', hours: 2 }),
    row({ known: false, project: 'OOO', description: 'away', eventId: 'x', date: '2026-10-27', hours: 1.5 }),
  ]);
  expect(list.unknown).toEqual([
    { calendar: 'c', eventId: 'x', code: 'OOO', title: 'OOO; ; away', dates: ['2026-10-26', '2026-10-27'], hours: 3.5 },
  ]);
  expect(list.count).toBe(1);
});

test('unknown events are latest first', () => {
  const list = buildFixList([
    row({ known: false, project: 'AAA', eventId: 'a', date: '2026-10-01' }),
    row({ known: false, project: 'BBB', eventId: 'b', date: '2026-10-05' }),
  ]);
  expect(list.unknown.map((u) => u.eventId)).toEqual(['b', 'a']);
});

test('overlapping timed rows make an overlap day', () => {
  const a = row({ eventId: 'a' });
  const b = row({ eventId: 'b', start: '2026-10-26T09:30+00:00', end: '2026-10-26T11:00+00:00', hours: 1.5 });
  const c = row({ eventId: 'c', start: '2026-10-26T12:00+00:00', end: '2026-10-26T13:00+00:00' });
  const list = buildFixList([c, b, a]);
  expect(list.overlaps).toEqual([{ date: '2026-10-26', rows: [a, b] }]);
  expect(list.count).toBe(1);
});

test('touching rows, all-day rows and zero-length rows do not overlap', () => {
  const a = row({ eventId: 'a' });
  const touching = row({ eventId: 'b', start: '2026-10-26T10:00+00:00', end: '2026-10-26T11:00+00:00' });
  const allDay = row({
    eventId: 'd',
    allDay: true,
    start: '2026-10-26T00:00+00:00',
    end: '2026-10-27T00:00+00:00',
    hours: 8,
  });
  const zero = row({ eventId: 'z', start: '2026-10-26T09:30+00:00', end: '2026-10-26T09:30+00:00', hours: 0 });
  expect(buildFixList([a, touching, allDay, zero]).overlaps).toEqual([]);
});

test('overlap days are latest first and count adds up', () => {
  const mk = (date: string, id: string) =>
    row({ date, eventId: id, start: `${date}T09:00+00:00`, end: `${date}T10:00+00:00` });
  const list = buildFixList([
    mk('2026-10-20', 'a'),
    mk('2026-10-20', 'b'),
    mk('2026-10-22', 'c'),
    mk('2026-10-22', 'd'),
    row({ known: false, project: 'OOO', eventId: 'u' }),
  ]);
  expect(list.overlaps.map((o) => o.date)).toEqual(['2026-10-22', '2026-10-20']);
  expect(list.count).toBe(3);
});
