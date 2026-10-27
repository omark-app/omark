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

test('weeklyByProject orders by total, then code', () => {
  const r = [
    row({ project: 'ACME', hours: 1 }),
    row({ project: 'GAMMA', hours: 3 }),
    row({ project: 'BETA', hours: 3 }),
    row({ project: 'ZED', hours: 5 }),
  ];
  expect(weeklyByProject(r, range, 'monday', now).series.map((s) => s.key)).toEqual(['ZED', 'BETA', 'GAMMA', 'ACME']);
});

test('weeklyByCategory orders by total, none last, and includePlanned', () => {
  const r = [
    row({ date: '2026-10-27', category: '', hours: 5 }),
    row({ date: '2026-10-27', category: 'Dev', hours: 2 }),
    row({ date: '2026-10-27', category: 'Zed', hours: 1 }),
    row({ date: '2026-11-12', category: 'zed', hours: 4, end: '2026-11-12T10:00+00:00' }),
  ];
  const done = weeklyByCategory(r, 'ACME', range, 'monday', now);
  expect(done.series.map((s) => [s.key, s.label, s.hours])).toEqual([
    ['dev', 'Dev', [2, 0, 0]],
    ['zed', 'Zed', [1, 0, 0]],
    ['', '', [5, 0, 0]],
  ]);
  const all = weeklyByCategory(r, 'ACME', range, 'monday', now, true);
  expect(all.series.map((s) => [s.key, s.hours])).toEqual([
    ['zed', [1, 0, 4]],
    ['dev', [2, 0, 0]],
    ['', [5, 0, 0]],
  ]);
});

test('weeks start on the chosen day and rows before from are left out', () => {
  const r = [
    row({ date: '2026-10-26', hours: 9 }),
    row({ date: '2026-10-28', hours: 2 }),
    row({ date: '2026-11-01', hours: 1 }),
    row({ date: '2026-11-05', hours: 4 }),
    row({ date: '2026-11-06', hours: 8 }),
  ];
  const s = weeklyByProject(r, { from: '2026-10-28', to: '2026-11-05' }, 'saturday', now);
  expect(s.weeks).toEqual(['2026-10-24', '2026-10-31']);
  expect(s.series).toEqual([{ key: 'ACME', label: 'ACME', hours: [2, 5] }]);
});

test('a row dated exactly on `to` is counted, and sums are rounded', () => {
  const r = [
    row({ date: '2026-11-15', hours: 1 }),
    row({ date: '2026-11-15', hours: 0.1 }),
    row({ date: '2026-11-15', hours: 0.2 }),
  ];
  const s = weeklyByProject(r, range, 'monday', now);
  expect(s.series[0]!.hours).toEqual([0, 0, 1.3]);
});

test('weekly hours add exact seconds', () => {
  const thirds = [0, 1, 2].map((i) =>
    row({ eventId: `t${i}`, date: '2026-10-27', start: `2026-10-27T0${i + 1}:00+00:00`, end: `2026-10-27T0${i + 1}:20+00:00`, hours: 0.3333 }),
  );
  expect(weeklyByProject(thirds, range, 'monday', now).series[0]!.hours).toEqual([1, 0, 0]);
});
