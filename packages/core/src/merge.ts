import { diff3Merge, diffComm } from 'node-diff3';
import type { Item, TasksDoc } from './model.ts';
import { blockEnd, itemsStart, taskLines, toLines } from './tasks-file.ts';

/**
 * Splits a file into merge blocks, grouped as `parseTasks` reads them: in the Tasks section a `- [ ]` or
 * `- [x]` line and its indented lines form one block; every other line (headings, Always lines, blank
 * lines, free text) is a block of its own. Blocks are joined with `\n`; CRLF and a BOM are normalised away.
 */
export function toBlocks(text: string): string[] {
  const lines = toLines(text);
  const start = itemsStart(lines);
  const blocks = lines.slice(0, start);
  for (let i = start; i < lines.length; ) {
    const end = blockEnd(lines, i);
    blocks.push(lines.slice(i, end).join('\n'));
    i = end;
  }
  return blocks;
}

/**
 * Three-way merge of block lists. A change on one side wins; where both sides changed the same stretch,
 * every block either side added or edited is kept, so nothing is lost and the same task edited on both
 * sides comes out as two tasks. A base block survives a conflict only if both sides kept it. No block ends
 * up with more copies than either side has: a block both sides moved is not duplicated, and neither is a
 * block both sides added (the same completion of a repeating task on two devices).
 */
export function merge3(base: string[], local: string[], remote: string[]): string[] {
  const merged: { block: string; conflict: boolean }[] = [];
  for (const region of diff3Merge(local, base, remote, { excludeFalseConflicts: true })) {
    if (region.ok) {
      for (const block of region.ok) merged.push({ block, conflict: false });
    } else if (region.conflict) {
      const { a, o, b } = region.conflict;
      for (const block of resolveConflict(a, o, b)) merged.push({ block, conflict: true });
    }
  }
  return capCopies(merged, local, remote);
}

/**
 * Resolves one conflict hunk by counting copies. For each block x (counts aₓ, oₓ, bₓ in the hunk) the hunk
 * keeps min(oₓ, aₓ, bₓ) base copies both sides kept, plus max(aₓ − oₓ, bₓ − oₓ, 0) new copies. The copies
 * are emitted in base order: each block where it sits against the base on its side, local's first where
 * both sides put something at one spot. So a hunk where each side only changed blocks in place keeps its
 * order (emitting all of local, then remote, could swap two tasks, and a later merge against a base in the
 * old order would then read the swapped block as new and keep it twice).
 */
function resolveConflict(a: string[], o: string[], b: string[]): string[] {
  const ca = counts(a);
  const co = counts(o);
  const cb = counts(b);
  const quota = new Map<string, number>();
  for (const x of new Set([...a, ...b])) {
    const ax = ca.get(x) ?? 0;
    const ox = co.get(x) ?? 0;
    const bx = cb.get(x) ?? 0;
    quota.set(x, Math.min(ox, ax, bx) + Math.max(ax - ox, bx - ox, 0));
  }
  // Each side's blocks keyed by where they sit against the base: a kept block at its base index i, a
  // block that replaced base blocks from i at i too, and a pure insertion before base block i at i − ½.
  // Sorting by key (local before remote on a tie) interleaves the two sides around the base.
  const placed = (side: string[]): number[] => {
    const keys: number[] = [];
    let i = 0;
    for (const part of diffComm(o, side)) {
      if (part.common) {
        keys.push(...part.common.map(() => i++));
      } else {
        const key = part.buffer1.length > 0 ? i : i - 0.5;
        keys.push(...part.buffer2.map(() => key));
        i += part.buffer1.length;
      }
    }
    return keys;
  };
  const ka = placed(a);
  const kb = placed(b);
  const walk = [...a.map((x, i) => ({ x, key: ka[i]! })), ...b.map((x, i) => ({ x, key: kb[i]! }))]
    .sort((p, q) => p.key - q.key)
    .map((p) => p.x);
  const out: string[] = [];
  for (const x of walk) {
    const left = quota.get(x)!;
    if (left > 0) {
      out.push(x);
      quota.set(x, left - 1);
    }
  }
  return out;
}

/**
 * Removes surplus copies: a block appears at most max(local count, remote count) times. Copies from
 * conflict hunks go first, then from stable stretches, the latest first in each. A block cannot exceed
 * that bound by any one side's doing, so a surplus is always the same block kept from both sides (a base
 * block both sides moved, or a block both sides added in different places).
 */
function capCopies(merged: { block: string; conflict: boolean }[], local: string[], remote: string[]): string[] {
  const cl = counts(local);
  const cr = counts(remote);
  const surplus = new Map<string, number>();
  for (const [x, n] of counts(merged.map((m) => m.block))) {
    const extra = n - Math.max(cl.get(x) ?? 0, cr.get(x) ?? 0);
    if (extra > 0) surplus.set(x, extra);
  }
  if (surplus.size === 0) return merged.map((m) => m.block);

  const drop = new Set<number>();
  for (const fromConflict of [true, false]) {
    for (let i = merged.length - 1; i >= 0; i--) {
      const { block, conflict } = merged[i]!;
      const left = surplus.get(block) ?? 0;
      if (conflict === fromConflict && left > 0) {
        drop.add(i);
        surplus.set(block, left - 1);
      }
    }
  }
  return merged.flatMap((m, i) => (drop.has(i) ? [] : [m.block]));
}

function counts(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** Merges three versions of `tasks.md`; the result is LF with one final newline ('' when empty). */
export function mergeTasksText(base: string, local: string, remote: string): string {
  return mergeText(base, local, remote, toBlocks);
}

/**
 * Merges three versions of `done.md`; the result is LF with one final newline ('' when empty). A done line
 * and its note lines are one block, so concurrent completions never mix their notes.
 */
export function mergeDoneText(base: string, local: string, remote: string): string {
  return mergeText(base, local, remote, doneBlocks);
}

/**
 * Splits `done.md` into merge blocks as `parseDone` reads it: a `- [x]` line takes its indented lines,
 * every other line is a block of its own. Unlike `toBlocks` it never looks for `tasks.md` headings, so a
 * stray `# Always` or `# Tasks` line cannot split a done line from its notes.
 */
export function doneBlocks(text: string): string[] {
  const lines = toLines(text);
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const end = blockEnd(lines, i);
    blocks.push(lines.slice(i, end).join('\n'));
    i = end;
  }
  return blocks;
}

function mergeText(base: string, local: string, remote: string, split: (text: string) => string[]): string {
  const blocks = merge3(split(base), split(local), split(remote));
  return blocks.length === 0 ? '' : `${blocks.join('\n')}\n`;
}

/**
 * Gives tasks in `next` (a freshly parsed doc) the ids they had in `prev` when the block `serializeTasks`
 * would write for the old task is identical to the new one's. Each old id is used once, first match
 * first; other tasks keep `next`'s ids. Only ids change.
 */
export function carryIds(prev: TasksDoc, next: TasksDoc): TasksDoc {
  const free = new Map<string, string[]>();
  for (const item of prev.items) {
    if (item.kind !== 'task') continue;
    const key = taskLines(item.task).join('\n');
    const ids = free.get(key);
    if (ids) ids.push(item.task.id);
    else free.set(key, [item.task.id]);
  }
  const items = next.items.map((item): Item => {
    if (item.kind !== 'task') return item;
    const id = free.get(taskLines(item.task).join('\n'))?.shift();
    return id === undefined ? item : { kind: 'task', task: { ...item.task, id } };
  });
  return { ...next, items };
}
