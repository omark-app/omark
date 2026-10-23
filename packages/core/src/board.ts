import type { BucketKey } from './model.ts';

/** A bucket shown on the week board and its height in rows: 1 for the header, plus its tasks when open. */
export interface BucketRows {
  key: BucketKey;
  rows: number;
}

/**
 * The column each bucket has in the default board `[today] | [tomorrow, week] | [next] | [later, someday]`.
 * Important, not urgent is in the rail, not on the board (#38).
 */
const DEFAULT_COLUMN: Partial<Record<BucketKey, number>> = { today: 0, tomorrow: 1, week: 1, next: 2, later: 3, someday: 3 };

/** Every way to cut `n` items into `parts` contiguous non-empty groups, as the start index of each group after the first. */
function cuts(n: number, parts: number, from = 1): number[][] {
  if (parts === 1) return [[]];
  const out: number[][] = [];
  for (let i = from; i <= n - parts + 1; i++) {
    for (const rest of cuts(n, parts - 1, i + 1)) out.push([i, ...rest]);
  }
  return out;
}

/** Negative when column heights `a` are better balanced than `b`: the tallest is lower, then the next tallest, and so on. */
function compareHeights(a: number[], b: number[]): number {
  const sa = [...a].sort((x, y) => y - x);
  const sb = [...b].sort((x, y) => y - x);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i]! - sb[i]!;
  return 0;
}

/**
 * Splits the board's buckets (in order) into `columns` contiguous groups so the tallest column is as short
 * as possible (spec 11.2). Among equally tall layouts it takes the best balanced (the next tallest column
 * as short as possible, and so on), then the one that moves the fewest buckets out of their default
 * column, then the first by where the cuts fall. With no more buckets than columns, each gets its own.
 */
export function packBoard(buckets: readonly BucketRows[], columns = 4): BucketKey[][] {
  const keys = buckets.map((b) => b.key);
  if (keys.length <= columns) return keys.map((k) => [k]);

  let best: { starts: number[]; heights: number[]; moved: number } | null = null;
  for (const inner of cuts(keys.length, columns)) {
    const starts = [0, ...inner];
    const heights = starts.map((s, c) =>
      buckets.slice(s, starts[c + 1] ?? buckets.length).reduce((sum, b) => sum + b.rows, 0),
    );
    const moved = keys.filter((k, i) => DEFAULT_COLUMN[k] !== starts.findLastIndex((s) => s <= i)).length;
    const cmp = best === null ? -1 : compareHeights(heights, best.heights) || moved - best.moved;
    if (cmp < 0) best = { starts, heights, moved };
  }
  const starts = best!.starts;
  return starts.map((s, c) => keys.slice(s, starts[c + 1] ?? keys.length));
}
