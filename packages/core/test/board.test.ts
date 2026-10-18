import { describe, expect, test } from 'vitest';
import type { BucketKey } from '../src/index.ts';
import { packBoard } from '../src/index.ts';

type Rows = [BucketKey, number][];
const pack = (rows: Rows, columns?: number) => packBoard(rows.map(([key, n]) => ({ key, rows: n })), columns);
const tallest = (rows: Rows, cols: BucketKey[][]): number =>
  Math.max(...cols.map((c) => c.reduce((sum, k) => sum + rows.find(([key]) => key === k)![1], 0)));

describe('packBoard', () => {
  test('a quiet board keeps the default layout', () => {
    const rows: Rows = [['overdue', 1], ['today', 1], ['week', 1], ['next', 1], ['later', 1], ['someday', 1]];
    expect(pack(rows)).toEqual([['overdue', 'today'], ['week'], ['next'], ['later', 'someday']]);
  });

  test('without Overdue the default is Today | This week | Next week | Later + Someday', () => {
    const rows: Rows = [['today', 6], ['week', 4], ['next', 3], ['later', 1], ['someday', 1]];
    expect(pack(rows)).toEqual([['today'], ['week'], ['next'], ['later', 'someday']]);
    const quiet: Rows = [['today', 1], ['week', 1], ['next', 1], ['later', 1], ['someday', 1]];
    expect(pack(quiet)).toEqual([['today'], ['week'], ['next'], ['later', 'someday']]);
  });

  test('the user board on Sun 18 Oct: Overdue gets its own column and the weeks stack', () => {
    // Overdue 6 tasks, Today 5, This week empty, Next week 2, Later and Someday folded.
    const rows: Rows = [['overdue', 7], ['today', 6], ['week', 1], ['next', 3], ['later', 1], ['someday', 1]];
    const cols = pack(rows);
    expect(cols).toEqual([['overdue'], ['today'], ['week', 'next'], ['later', 'someday']]);
    expect(tallest(rows, cols)).toBe(7);
    // The default layout would stack Overdue and Today: 7 + 6 rows, headers included.
    expect(tallest(rows, [['overdue', 'today'], ['week'], ['next'], ['later', 'someday']])).toBe(13);
  });

  test('a long open Later gets a column to itself and the weeks stack', () => {
    const rows: Rows = [['today', 3], ['week', 2], ['next', 2], ['later', 12], ['someday', 1]];
    expect(pack(rows)).toEqual([['today'], ['week', 'next'], ['later'], ['someday']]);
  });

  test('always four columns, each non-empty, in bucket order', () => {
    const keys: BucketKey[] = ['overdue', 'today', 'week', 'next', 'later', 'someday'];
    for (let seed = 1; seed < 200; seed++) {
      const rows: Rows = keys.map((k, i) => [k, 1 + ((seed * (i + 3) * 7) % 11)]);
      const cols = pack(rows);
      expect(cols).toHaveLength(4);
      expect(cols.every((c) => c.length > 0)).toBe(true);
      expect(cols.flat()).toEqual(keys);
    }
  });

  test('never taller than any other split', () => {
    const rows: Rows = [['overdue', 2], ['today', 9], ['week', 4], ['next', 1], ['later', 5], ['someday', 3]];
    const best = tallest(rows, pack(rows));
    const keys = rows.map(([k]) => k);
    for (let a = 1; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) {
      const split = [keys.slice(0, a), keys.slice(a, b), keys.slice(b, c), keys.slice(c)];
      expect(best).toBeLessThanOrEqual(tallest(rows, split));
    }
  });

  test('is deterministic', () => {
    const rows: Rows = [['overdue', 3], ['today', 3], ['week', 3], ['next', 3], ['later', 3], ['someday', 3]];
    const first = pack(rows);
    for (let i = 0; i < 5; i++) expect(pack(rows)).toEqual(first);
    // Equal heights everywhere: the default layout wins the tie.
    expect(first).toEqual([['overdue', 'today'], ['week'], ['next'], ['later', 'someday']]);
  });

  test('no more buckets than columns: one each', () => {
    expect(pack([['today', 4], ['week', 1]])).toEqual([['today'], ['week']]);
    expect(pack([['today', 4], ['week', 1], ['next', 2]], 2)).toEqual([['today'], ['week', 'next']]);
  });
});
