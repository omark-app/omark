import { dateForChoice } from './buckets.ts';
import type { DateChoice } from './buckets.ts';
import { doneLines } from './done-file.ts';
import type { ISODate, Item, RepeatRule, State, Task, WeekCtx } from './model.ts';
import { fitDate, nextDate } from './recurrence.ts';
import { isUsableHabitRule, parseFields, readBack } from './tasks-file.ts';


let lastId = 0;
const defaultNewId = (): string => `n${++lastId}`;

export const indexOf = (s: State, id: string): number =>
  s.doc.items.findIndex((i) => i.kind === 'task' && i.task.id === id);

export function findTask(s: State, id: string): Task | null {
  const i = indexOf(s, id);
  const item = s.doc.items[i];
  return item && item.kind === 'task' ? item.task : null;
}

export function withItems(s: State, items: Item[]): State {
  return { ...s, doc: { ...s.doc, items } };
}

/**
 * Replaces the task with `id` by `change(task)` as its line reads back, so the state always means what
 * the file says; unknown id returns `s`.
 */
export function updateTask(s: State, id: string, change: (t: Task) => Task): State {
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
  const repeat = f.repeat ?? t.repeat;
  // A typed rule a habit can't have (`when done`) ends the habit, so no stray 🌱 is left (#44).
  const { habit, ...rest } = t;
  return {
    ...rest, title: f.title, date: f.date ?? t.date, repeat, ...(f.important && { important: true }),
    ...(habit && isUsableHabitRule(repeat) && { habit }),
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
  s: State, title: string, when: DateChoice, ctx: WeekCtx, newId: () => string = defaultNewId, important = false,
): { state: State; id: string } | null {
  const trimmed = title.trim();
  if (trimmed === '') return null;
  const id = newId();
  const task = readBack(takeTyped({
    id, title: trimmed, notes: [], date: dateForChoice(when, ctx), repeat: null,
    ...(important && { important: true }), raw: null, rawKey: null,
  }));
  // A title that was only field text (e.g. `🔁 every day`) leaves no title.
  if (task.title === '') return null;
  return { state: withItems(s, [...s.doc.items, { kind: 'task', task }]), id };
}

export function setDate(s: State, id: string, date: ISODate | null, beforeId?: string | null): State {
  if (indexOf(s, id) < 0) return s;
  return placeBefore(updateTask(s, id, (t) => ({ ...t, date })), id, beforeId);
}

/**
 * Gives the task the bucket's date. A task in Important, not urgent (⏫, no date) moved to Someday also
 * loses ⏫, or it would stay in the group (#38); any other important task keeps it.
 */
export function moveToBucket(
  s: State, id: string, bucket: DateChoice, ctx: WeekCtx, beforeId?: string | null,
): State {
  const t = findTask(s, id);
  const next = setDate(s, id, dateForChoice(bucket, ctx), beforeId);
  return bucket === 'someday' && t?.important && t.date === null ? setImportant(next, id, false) : next;
}

/**
 * Moves a task into Important, not urgent (#38): no date and ⏫, placed before `beforeId`, or last in the
 * group when none is given (the group is in the order tasks joined it).
 */
export function moveToGroup(s: State, id: string, beforeId?: string | null): State {
  const placed = setImportant(setDate(s, id, null, beforeId), id, true);
  return beforeId == null ? moveToGroupEnd(placed, id) : placed;
}

/** Moves task `id` to just after the last other Important, not urgent task; `s` when it is already after it. */
export function moveToGroupEnd(s: State, id: string): State {
  const items = s.doc.items;
  const last = items.findLastIndex((i) => i.kind === 'task' && i.task.id !== id && i.task.important === true && i.task.date === null);
  const from = indexOf(s, id);
  if (last < 0 || from < 0 || from > last) return s;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(last, 0, moved!);
  return withItems(s, next);
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

/** Sets the rule. A rule a habit can't have (none, `when done`) also ends the habit, so no stray 🌱 is left (#44). */
export function setRepeat(s: State, id: string, rule: RepeatRule | null, today: ISODate): State {
  return updateTask(s, id, ({ habit, ...t }) => ({
    ...t,
    repeat: rule,
    date: rule ? fitDate(rule, t.date, today) : t.date,
    ...(habit && isUsableHabitRule(rule) && { habit }),
  }));
}

/** Flags or unflags a task as Important (the ⏫ field, issue #19); `s` itself when nothing changes. */
export function setImportant(s: State, id: string, important: boolean): State {
  const t = findTask(s, id);
  if (!t || (t.important === true) === important) return s;
  return updateTask(s, id, ({ important: _, ...rest }) => (important ? { ...rest, important: true } : rest));
}
