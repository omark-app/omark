import { diff3Merge } from 'node-diff3';
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
 * every block either side added or edited is kept (local's first, then remote's), so nothing is lost and
 * the same task edited on both sides comes out as two tasks. A base block survives a conflict only if
 * both sides kept it.
 */
export function merge3(base: string[], local: string[], remote: string[]): string[] {
  const merged: string[] = [];
  for (const region of diff3Merge(local, base, remote, { excludeFalseConflicts: true })) {
    if (region.ok) {
      merged.push(...region.ok);
      continue;
    }
    if (!region.conflict) continue;
    const { a, o, b } = region.conflict;
    const out: string[] = [];
    for (const x of a) if (!o.includes(x) || b.includes(x)) out.push(x); // local new/edited, or base kept by both
    for (const x of b) if (!o.includes(x) && !out.includes(x)) out.push(x); // remote new/edited
    merged.push(...out);
  }
  return merged;
}

/** Merges three versions of `tasks.md`; the result is LF with one final newline ('' when empty). */
export function mergeTasksText(base: string, local: string, remote: string): string {
  return mergeText(base, local, remote);
}

/** Merges three versions of `done.md`; the result is LF with one final newline ('' when empty). */
export function mergeDoneText(base: string, local: string, remote: string): string {
  return mergeText(base, local, remote);
}

function mergeText(base: string, local: string, remote: string): string {
  const blocks = merge3(toBlocks(base), toBlocks(local), toBlocks(remote));
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
