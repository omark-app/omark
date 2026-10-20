import { describe, expect, test } from 'vitest';
import type { BucketKey } from '../src/index.ts';
import { packBoard } from '../src/index.ts';

type Rows = [BucketKey, number][];
const pack = (rows: Rows, columns?: number) => packBoard(rows.map(([key, n]) => ({ key, rows: n })), columns);
const tallest = (rows: Rows, cols: BucketKey[][]): number =>
  Math.max(...cols.map((c) => c.reduce((sum, k) => sum + rows.find(([key]) => key === k)![1], 0)));

describe('packBoard', () => {
  test('a quiet board keeps the default layout Today | Tomorrow + This week | Next week | Later + Someday (#26)', () => {
    const rows: Rows = [['today', 1], ['tomorrow', 1], ['week', 1], ['next', 1], ['later', 1], ['someday', 1]];
    expect(pack(rows)).toEqual([['today'], ['tomorrow', 'week'], ['next'], ['later', 'someday']]);
  });

  test('a long Today (overdue folded in) gets a column to itself and the rest stack', () => {
    // Today 11 tasks (6 overdue), Tomorrow 2, This week empty, Next week 2, Later and Someday folded.
    const rows: Rows = [['today', 12], ['tomorrow', 3], ['week', 1], ['next', 3], ['later', 1], ['someday', 1]];
    const cols = pack(rows);
    expect(tallest(rows, cols)).toBe(12);
    expect(cols).toEqual([['today'], ['tomorrow', 'week'], ['next'], ['later', 'someday']]);
  });

  test('a long Tomorrow gets its own column', () => {
    const rows: Rows = [['today', 4], ['tomorrow', 8], ['week', 3], ['next', 4], ['later', 1], ['someday', 1]];
    const cols = pack(rows);
    // 8 | 4 + 3 + 1 + 1 split as 4, 8, 3, 6: the next tallest column is as short as it can be.
    expect(cols).toEqual([['today'], ['tomorrow'], ['week'], ['next', 'later', 'someday']]);
    expect(tallest(rows, cols)).toBe(8);
  });

  test('a long open Later gets a column to itself and the weeks stack', () => {
    const rows: Rows = [['today', 3], ['tomorrow', 1], ['week', 2], ['next', 2], ['later', 12], ['someday', 1]];
    expect(pack(rows)).toEqual([['today', 'tomorrow'], ['week', 'next'], ['later'], ['someday']]);
  });

  test('always four columns, each non-empty, in bucket order', () => {
    const keys: BucketKey[] = ['today', 'tomorrow', 'week', 'next', 'later', 'someday'];
    for (let seed = 1; seed < 200; seed++) {
      const rows: Rows = keys.map((k, i) => [k, 1 + ((seed * (i + 3) * 7) % 11)]);
      const cols = pack(rows);
      expect(cols).toHaveLength(4);
      expect(cols.every((c) => c.length > 0)).toBe(true);
      expect(cols.flat()).toEqual(keys);
    }
  });

  test('never taller than any other split', () => {
    const rows: Rows = [['today', 2], ['tomorrow', 9], ['week', 4], ['next', 1], ['later', 5], ['someday', 3]];
    const best = tallest(rows, pack(rows));
    const keys = rows.map(([k]) => k);
    for (let a = 1; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) {
      const split = [keys.slice(0, a), keys.slice(a, b), keys.slice(b, c), keys.slice(c)];
      expect(best).toBeLessThanOrEqual(tallest(rows, split));
    }
  });

  test('is deterministic', () => {
    const rows: Rows = [['today', 3], ['tomorrow', 3], ['week', 3], ['next', 3], ['later', 3], ['someday', 3]];
    const first = pack(rows);
    for (let i = 0; i < 5; i++) expect(pack(rows)).toEqual(first);
    // Equal heights everywhere: the default layout wins the tie.
    expect(first).toEqual([['today'], ['tomorrow', 'week'], ['next'], ['later', 'someday']]);
  });

  test('no more buckets than columns: one each', () => {
    expect(pack([['today', 4], ['week', 1]])).toEqual([['today'], ['week']]);
    expect(pack([['today', 4], ['week', 1], ['next', 2]], 2)).toEqual([['today'], ['week', 'next']]);
  });
});
