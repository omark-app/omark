import { expect, test } from 'vitest';
import { weeklyByCategory, weeklyByProject } from '../src/charts.ts';
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


const now = Date.parse('2026-11-10T00:00:00Z');
const range = { from: '2026-10-26', to: '2026-11-15' };
const rows = [
  row({ date: '2026-10-27', hours: 2, category: 'Dev' }),
  row({ date: '2026-10-28', hours: 1, category: 'dev' }),
  row({ date: '2026-10-28', hours: 4, project: 'ZED', category: '' }),
  row({ date: '2026-11-09', hours: 3, category: 'Ops' }),
  row({ date: '2026-11-12', hours: 5, end: '2026-11-12T10:00+00:00' }),
  row({ date: '2026-11-03', hours: 9, project: 'OOO', known: false }),
];

test('weeklyByProject', () => {
  const s = weeklyByProject(rows, range, 'monday', now);
  expect(s.weeks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  expect(s.series).toEqual([
    { key: 'ACME', label: 'ACME', hours: [3, 0, 3] },
    { key: 'ZED', label: 'ZED', hours: [4, 0, 0] },
  ]);
  const p = weeklyByProject(rows, range, 'monday', now, true);
  expect(p.series[0]).toEqual({ key: 'ACME', label: 'ACME', hours: [3, 0, 8] });
});

test('weeklyByCategory', () => {
  const s = weeklyByCategory(rows, 'acme', range, 'monday', now);
  expect(s.series).toEqual([
    { key: 'dev', label: 'Dev', hours: [3, 0, 0] },
    { key: 'ops', label: 'Ops', hours: [0, 0, 3] },
  ]);
});
