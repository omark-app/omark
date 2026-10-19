import { dateForBucket } from './buckets.ts';
import type { MovableBucket } from './buckets.ts';
import { doneLines } from './done-file.ts';
import type { ISODate, Item, RepeatRule, State, Task, WeekCtx } from './model.ts';
import { fitDate, nextDate } from './recurrence.ts';
import { parseFields, readBack } from './tasks-file.ts';


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

/**
 * Replaces the task with `id` by `change(task)` as its line reads back, so the state always means what
 * the file says; unknown id returns `s`.
 */
function updateTask(s: State, id: string, change: (t: Task) => Task): State {
  const i = indexOf(s, id);
  if (i < 0) return s;
  const items = s.doc.items.slice();
  items[i] = { kind: 'task', task: readBack(change((items[i] as { task: Task }).task)) };
  return withItems(s, items);
}

/**
 * `t` with 🔁 rule and 📅 date text typed into its title taken as those fields, replacing the ones it had,
 * as every other device reads the saved line (issue #8). Typing the same text again changes nothing.
 */
function takeTyped(t: Task): Task {
  const f = parseFields(t.title, false);
  return {
    ...t, title: f.title, date: f.date ?? t.date, repeat: f.repeat ?? t.repeat, ...(f.important && { important: true }),
  };
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
  const task = readBack(takeTyped({
    id, title: trimmed, notes: [], date: dateForBucket(bucket, ctx), repeat: null, raw: null, rawKey: null,
  }));
  // A title that was only field text (e.g. `🔁 every day`) leaves no title.
  if (task.title === '') return null;
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
 * moves to its next date. Whether it repeats is read from the line it saves as, never from the state
 * alone, so a task the file holds as repeating is never deleted (issue #8).
 */
export function completeTask(s: State, id: string, today: ISODate): { state: State; next: ISODate | null } {
  const found = findTask(s, id);
  if (!found) return { state: s, next: null };
  const task = readBack(found);
  const done = { ...s.done, lines: [...s.done.lines, ...doneLines(task, today)] };
  if (!task.repeat) {
    const items = s.doc.items.filter((i) => !(i.kind === 'task' && i.task.id === id));
    return { state: { ...withItems(s, items), done }, next: null };
  }
  const next = nextDate(task.repeat, task.date, today);
  return { state: { ...updateTask(s, id, () => ({ ...task, date: next })), done }, next };
}

export function deleteTask(s: State, id: string): State {
  if (indexOf(s, id) < 0) return s;
  return withItems(s, s.doc.items.filter((i) => !(i.kind === 'task' && i.task.id === id)));
}

export function editTask(s: State, id: string, patch: { title: string; notes: string[] }): State {
  const title = patch.title.trim();
  if (title === '') return s;
  const next = updateTask(s, id, (t) => takeTyped({ ...t, title, notes: [...patch.notes] }));
  // A title that was only field text leaves no title: ignored like a blank one.
  return findTask(next, id)?.title === '' ? s : next;
}

export function setRepeat(s: State, id: string, rule: RepeatRule | null, today: ISODate): State {
  return updateTask(s, id, (t) => ({
    ...t,
    repeat: rule,
    date: rule ? fitDate(rule, t.date, today) : t.date,
  }));
}

/** Flags or unflags a task as Important (the ⏫ field, issue #19); `s` itself when nothing changes. */
export function setImportant(s: State, id: string, important: boolean): State {
  const t = findTask(s, id);
  if (!t || (t.important === true) === important) return s;
  return updateTask(s, id, ({ important: _, ...rest }) => (important ? { ...rest, important: true } : rest));
}

export function setAlways(s: State, lines: string[]): State {
  const always = lines.map((l) => l.trim()).filter((l) => l !== '');
  return { ...s, doc: { ...s.doc, always } };
}
