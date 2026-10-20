import { expect, test } from 'vitest';
import type { Task, TasksDoc } from '../src/index.ts';
import { BUCKETS, allTasks, bucketOf, bucketRange, currentChoice, dateChoices, dateForBucket, movableBuckets, tasksInBucket } from '../src/index.ts';

const tue = { today: '2026-10-13', weekStart: 0 };
const fri = { today: '2026-10-16', weekStart: 0 };
const sat = { today: '2026-10-17', weekStart: 0 };
const sun = { today: '2026-10-18', weekStart: 0 };
const mk = (id: string, date: string | null): Task => ({ id, title: id, notes: [], date, repeat: null, raw: null, rawKey: null });
const docOf = (tasks: Task[]): TasksDoc => ({
  preamble: [], always: [], alwaysRaw: null,
  items: tasks.map((task) => ({ kind: 'task' as const, task })),
});

test('BUCKETS', () => {
  expect(BUCKETS.map((b) => b.name)).toEqual(['Today', 'Tomorrow', 'This week', 'Next week', 'Later', 'Someday']);
  expect(BUCKETS.map((b) => b.key)).toEqual(['today', 'tomorrow', 'week', 'next', 'later', 'someday']);
});

test('bucketOf: Today holds overdue tasks, Tomorrow is its own bucket (#26)', () => {
  const cases: [string | null, string][] = [
    ['2026-10-10', 'today'], ['2026-10-15', 'today'], ['2026-10-16', 'today'], ['2026-10-17', 'tomorrow'], ['2026-10-18', 'week'],
    ['2026-10-19', 'next'], ['2026-10-25', 'next'], ['2026-10-26', 'later'], [null, 'someday'],
  ];
  for (const [d, b] of cases) expect(bucketOf(mk('a', d), fri)).toBe(b);
  // On a Sunday, Monday is Tomorrow, not Next week.
  expect(bucketOf(mk('a', '2026-10-19'), sun)).toBe('tomorrow');
  expect(bucketOf(mk('a', '2026-10-20'), sun)).toBe('next');
});

test('dateForBucket', () => {
  expect(dateForBucket('today', fri)).toBe('2026-10-16');
  expect(dateForBucket('tomorrow', fri)).toBe('2026-10-17');
  expect(dateForBucket('week', fri)).toBe('2026-10-18');
  expect(dateForBucket('week', sat)).toBe('2026-10-18'); // tomorrow: `w` on a Saturday lands in Tomorrow
  expect(dateForBucket('week', sun)).toBe('2026-10-18');
  expect(dateForBucket('next', fri)).toBe('2026-10-25');
  expect(dateForBucket('someday', fri)).toBeNull();
});

test('movableBuckets leaves out Later, and This week when no day after tomorrow is left', () => {
  expect(movableBuckets(fri)).toEqual([
    { key: 'today', name: 'Today' },
    { key: 'tomorrow', name: 'Tomorrow' },
    { key: 'week', name: 'This week' },
    { key: 'next', name: 'Next week' },
    { key: 'someday', name: 'Someday' },
  ]);
  expect(movableBuckets(sat).map((b) => b.key)).toEqual(['today', 'tomorrow', 'next', 'someday']);
  expect(movableBuckets(sun).map((b) => b.key)).toEqual(['today', 'tomorrow', 'next', 'someday']);
});

test('allTasks keeps file order and skips non-tasks', () => {
  const doc = docOf([mk('a', null), mk('b', '2026-10-16')]);
  doc.items.splice(1, 0, { kind: 'raw', lines: ['x'] });
  expect(allTasks(doc).map((t) => t.id)).toEqual(['a', 'b']);
});

test('tasksInBucket orders by date then file order', () => {
  const doc = docOf([mk('t1', '2026-10-16'), mk('o', '2026-10-10'), mk('t2', '2026-10-16'), mk('m', '2026-10-17'), mk('w', '2026-10-18'), mk('s', null)]);
  expect(tasksInBucket(doc, 'today', fri).map((t) => t.id)).toEqual(['o', 't1', 't2']);
  expect(tasksInBucket(doc, 'tomorrow', fri).map((t) => t.id)).toEqual(['m']);
  expect(tasksInBucket(doc, 'week', fri).map((t) => t.id)).toEqual(['w']);
  expect(tasksInBucket(doc, 'someday', fri).map((t) => t.id)).toEqual(['s']);
});

test('bucketRange', () => {
  expect(bucketRange('next', fri)).toBe('19 Oct – 25 Oct');
  expect(bucketRange('week', tue)).toBe('Thu–Sun'); // tomorrow has its own bucket
  expect(bucketRange('week', fri)).toBe('Sun'); // one day left: no Sun–Sun
  expect(bucketRange('week', sat)).toBe('');
  expect(bucketRange('week', sun)).toBe('');
  expect(bucketRange('tomorrow', fri)).toBe('Sat');
  expect(bucketRange('tomorrow', sun)).toBe('Mon');
  expect(bucketRange('today', fri)).toBe('');
  expect(bucketRange('later', fri)).toBe('');
  expect(bucketRange('someday', fri)).toBe('');
});

test('tasksInBucket puts important tasks first, then date, then file order (#19)', () => {
  const imp = (id: string, date: string | null): Task => ({ ...mk(id, date), important: true });
  const doc = docOf([
    mk('w1', '2026-10-15'), imp('w2', '2026-10-16'), mk('w3', '2026-10-15'), imp('w4', '2026-10-15'),
    mk('o1', '2026-10-01'), imp('o2', '2026-10-12'), mk('s1', null), imp('s2', null),
  ]);
  expect(tasksInBucket(doc, 'week', tue).map((t) => t.id)).toEqual(['w4', 'w2', 'w1', 'w3']);
  expect(tasksInBucket(doc, 'today', tue).map((t) => t.id)).toEqual(['o2', 'o1']);
  expect(tasksInBucket(doc, 'someday', fri).map((t) => t.id)).toEqual(['s2', 's1']);
});

test('Today: important first, then overdue, then today (#26)', () => {
  const imp = (id: string, date: string | null): Task => ({ ...mk(id, date), important: true });
  const doc = docOf([mk('t1', '2026-10-16'), mk('o1', '2026-10-14'), imp('t2', '2026-10-16'), mk('o2', '2026-10-01'), imp('o3', '2026-10-15')]);
  expect(tasksInBucket(doc, 'today', fri).map((t) => t.id)).toEqual(['o3', 't2', 'o2', 'o1', 't1']);
});

test('dateChoices puts Tomorrow right after Today (#19)', () => {
  expect(dateChoices(fri).map((c) => c.name)).toEqual(['Today', 'Tomorrow', 'This week', 'Next week', 'Someday']);
  expect(dateChoices(sun).map((c) => c.key)).toEqual(['today', 'tomorrow', 'next', 'someday']);
});

test('currentChoice is Tomorrow for a task due tomorrow, else its bucket (#19)', () => {
  expect(currentChoice(mk('a', '2026-10-17'), fri)).toBe('tomorrow');
  expect(currentChoice(mk('a', '2026-10-18'), fri)).toBe('week');
  expect(currentChoice(mk('a', '2026-10-19'), sun)).toBe('tomorrow');
  expect(currentChoice(mk('a', '2026-10-16'), fri)).toBe('today');
  expect(currentChoice(mk('a', null), fri)).toBe('someday');
  expect(currentChoice(mk('a', '2026-10-01'), fri)).toBeNull();
  expect(currentChoice(mk('a', '2026-11-30'), fri)).toBeNull();
});
