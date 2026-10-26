import { expect, test } from 'vitest';
import { groupCategories } from '../src/categories.ts';
import type { EventRow } from '../src/rows.ts';
import { isDone, namedRange, summarise } from '../src/summary.ts';

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

test('namedRange weeks and months', () => {
  expect(namedRange('thisWeek', '2026-10-28', 'monday')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  expect(namedRange('thisWeek', '2026-10-28', 'sunday')).toEqual({ from: '2026-10-25', to: '2026-10-31' });
  expect(namedRange('lastWeek', '2026-10-28', 'monday')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  expect(namedRange('thisMonth', '2026-02-10', 'monday')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(namedRange('lastMonth', '2026-01-15', 'monday')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
});

test('isDone is end <= now', () => {
  const r = row({ end: '2026-10-26T10:00+00:00' });
  expect(isDone(r, Date.parse('2026-10-26T10:00:00Z'))).toBe(true);
  expect(isDone(r, Date.parse('2026-10-26T09:59:00Z'))).toBe(false);
});

test('groupCategories uses the most used spelling', () => {
  const g = groupCategories([
    row({ category: 'coding' }),
    row({ category: 'Coding' }),
    row({ category: 'Coding' }),
    row({ category: '' }),
    row({ category: 'b' }),
    row({ category: 'B' }),
  ]);
  expect(g.get('coding')!.name).toBe('Coding');
  expect(g.get('coding')!.rows).toHaveLength(3);
  expect(g.get('')!.name).toBe('');
  expect(g.get('b')!.name).toBe('B');
});

test('summarise', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const rows = [
    row({ category: 'Coding', hours: 2 }),
    row({ category: 'Coding', hours: 1 }),
    row({ category: 'coding', hours: 0.5 }),
    row({ category: 'CS', hours: 1 }),
    row({ category: '', hours: 0.25 }),
    row({ project: 'OOO', known: false, hours: 8 }),
    row({ date: '2026-12-01', hours: 5 }),
    row({ category: 'Coding', hours: 3, date: '2026-10-30', end: '2026-10-30T10:00+00:00' }),
  ];
  const s = summarise(rows, { from: '2026-10-26', to: '2026-11-01' }, now);
  expect(s.unknown).toBe(8);
  expect(s.done).toBe(4.75);
  expect(s.planned).toBe(3);
  expect(s.projects).toHaveLength(1);
  expect(s.projects[0]).toEqual({
    code: 'ACME',
    done: 4.75,
    planned: 3,
    categories: [
      { name: 'Coding', done: 3.5, planned: 3 },
      { name: 'CS', done: 1, planned: 0 },
      { name: '', done: 0.25, planned: 0 },
    ],
  });
});
