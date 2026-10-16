import { expect, test } from 'vitest';
import type { Task, TasksDoc } from '../src/index.ts';
import { BUCKETS, allTasks, bucketOf, bucketRange, dateForBucket, tasksInBucket } from '../src/index.ts';

const fri = { today: '2026-10-16', weekStart: 0 };
const sun = { today: '2026-10-18', weekStart: 0 };
const mk = (id: string, date: string | null): Task => ({ id, title: id, notes: [], date, repeat: null, raw: null, rawKey: null });
const docOf = (tasks: Task[]): TasksDoc => ({
  preamble: [], always: [], alwaysRaw: null,
  items: tasks.map((task) => ({ kind: 'task' as const, task })),
});

test('BUCKETS', () => {
  expect(BUCKETS.map((b) => b.name)).toEqual(['Today', 'This week', 'Next week', 'Later', 'Someday']);
  expect(BUCKETS.map((b) => b.key)).toEqual(['today', 'week', 'next', 'later', 'someday']);
});

test('bucketOf', () => {
  const cases: [string | null, string][] = [
    ['2026-10-10', 'today'], ['2026-10-16', 'today'], ['2026-10-17', 'week'], ['2026-10-18', 'week'],
    ['2026-10-19', 'next'], ['2026-10-25', 'next'], ['2026-10-26', 'later'], [null, 'someday'],
  ];
  for (const [d, b] of cases) expect(bucketOf(mk('a', d), fri)).toBe(b);
});

test('dateForBucket', () => {
  expect(dateForBucket('today', fri)).toBe('2026-10-16');
  expect(dateForBucket('week', fri)).toBe('2026-10-18');
  expect(dateForBucket('week', sun)).toBe('2026-10-18');
  expect(dateForBucket('next', fri)).toBe('2026-10-25');
  expect(dateForBucket('someday', fri)).toBeNull();
});

test('allTasks keeps file order and skips non-tasks', () => {
  const doc = docOf([mk('a', null), mk('b', '2026-10-16')]);
  doc.items.splice(1, 0, { kind: 'raw', lines: ['x'] });
  expect(allTasks(doc).map((t) => t.id)).toEqual(['a', 'b']);
});

test('tasksInBucket orders by date then file order', () => {
  const doc = docOf([mk('t1', '2026-10-16'), mk('o', '2026-10-10'), mk('t2', '2026-10-16'), mk('w', '2026-10-17'), mk('s', null)]);
  expect(tasksInBucket(doc, 'today', fri).map((t) => t.id)).toEqual(['o', 't1', 't2']);
  expect(tasksInBucket(doc, 'week', fri).map((t) => t.id)).toEqual(['w']);
  expect(tasksInBucket(doc, 'someday', fri).map((t) => t.id)).toEqual(['s']);
});

test('bucketRange', () => {
  expect(bucketRange('next', fri)).toBe('19 Oct – 25 Oct');
  expect(bucketRange('week', fri)).toBe('Sat–Sun');
  expect(bucketRange('week', sun)).toBe('');
  expect(bucketRange('today', fri)).toBe('');
  expect(bucketRange('later', fri)).toBe('');
  expect(bucketRange('someday', fri)).toBe('');
});
