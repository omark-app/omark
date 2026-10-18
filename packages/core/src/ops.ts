import { dateForBucket } from './buckets.ts';
import type { MovableBucket } from './buckets.ts';
import { doneLines } from './done-file.ts';
import type { ISODate, Item, RepeatRule, State, Task, WeekCtx } from './model.ts';
import { fitDate, nextDate } from './recurrence.ts';


let lastId = 0;
const defaultNewId = (): string => `n${++lastId}`;

const indexOf = (s: State, id: string): number =>
  s.doc.items.findIndex((i) => i.kind === 'task' && i.task.id === id);

export function findTask(s: State, id: string): Task | null {
  const i = indexOf(s, id);
  const item = s.doc.items[i];
  return item && item.kind === 'task' ? item.task : null;
}

function withItems(s: State, items: Item[]): State {
  return { ...s, doc: { ...s.doc, items } };
}

/** Replaces the task with `id` by `change(task)`; unknown id returns `s`. */
function updateTask(s: State, id: string, change: (t: Task) => Task): State {
  const i = indexOf(s, id);
  if (i < 0) return s;
  const items = s.doc.items.slice();
  items[i] = { kind: 'task', task: change((items[i] as { task: Task }).task) };
  return withItems(s, items);
}

/** Moves the item of `id` directly before the item of `beforeId`; no-op for equal or unknown ids. */
function placeBefore(s: State, id: string, beforeId: string | null | undefined): State {
  if (beforeId == null || beforeId === id) return s;
  const from = indexOf(s, id);
  if (from < 0 || indexOf(s, beforeId) < 0) return s;
  const items = s.doc.items.slice();
  const [moved] = items.splice(from, 1);
  items.splice(items.findIndex((i) => i.kind === 'task' && i.task.id === beforeId), 0, moved!);
  return withItems(s, items);
}

export function addTask(
  s: State, title: string, bucket: MovableBucket, ctx: WeekCtx, newId: () => string = defaultNewId,
): { state: State; id: string } | null {
  const trimmed = title.trim();
  if (trimmed === '') return null;
  const id = newId();
  const task: Task = {
    id, title: trimmed, notes: [], date: dateForBucket(bucket, ctx), repeat: null, raw: null, rawKey: null,
  };
  return { state: withItems(s, [...s.doc.items, { kind: 'task', task }]), id };
}

export function setDate(s: State, id: string, date: ISODate | null, beforeId?: string | null): State {
  if (indexOf(s, id) < 0) return s;
  return placeBefore(updateTask(s, id, (t) => ({ ...t, date })), id, beforeId);
}

export function moveToBucket(
  s: State, id: string, bucket: MovableBucket, ctx: WeekCtx, beforeId?: string | null,
): State {
  return setDate(s, id, dateForBucket(bucket, ctx), beforeId);
}

export function reorder(s: State, id: string, beforeId: string): State {
  return placeBefore(s, id, beforeId);
}

/**
 * Completes a task: appends its done line to done.md with its notes as indented lines under it (not
 * counted as completions). A one-off task leaves tasks.md; a repeating one keeps its notes there too and
 * moves to its next date.
 */
export function completeTask(s: State, id: string, today: ISODate): { state: State; next: ISODate | null } {
  const task = findTask(s, id);
  if (!task) return { state: s, next: null };
  const done = { ...s.done, lines: [...s.done.lines, ...doneLines(task, today)] };
  if (!task.repeat) {
    const items = s.doc.items.filter((i) => !(i.kind === 'task' && i.task.id === id));
    return { state: { ...withItems(s, items), done }, next: null };
  }
  const next = nextDate(task.repeat, task.date, today);
  return { state: { ...updateTask(s, id, (t) => ({ ...t, date: next })), done }, next };
}

export function deleteTask(s: State, id: string): State {
  if (indexOf(s, id) < 0) return s;
  return withItems(s, s.doc.items.filter((i) => !(i.kind === 'task' && i.task.id === id)));
}

export function editTask(s: State, id: string, patch: { title: string; notes: string[] }): State {
  const title = patch.title.trim();
  if (title === '') return s;
  return updateTask(s, id, (t) => ({ ...t, title, notes: [...patch.notes] }));
}

export function setRepeat(s: State, id: string, rule: RepeatRule | null, today: ISODate): State {
  return updateTask(s, id, (t) => ({
    ...t,
    repeat: rule,
    date: rule ? fitDate(rule, t.date, today) : t.date,
  }));
}

export function setAlways(s: State, lines: string[]): State {
  const always = lines.map((l) => l.trim()).filter((l) => l !== '');
  return { ...s, doc: { ...s.doc, always } };
}
