import type { HabitConfig } from './config.ts';
import { daysBetween } from './dates.ts';
import { droppedLine, formedLine } from './done-file.ts';
import { habitCompletions, habitProgress, habitRules, walkHabit } from './habits.ts';
import type { DoneDoc, ISODate, RepeatRule, State, Task, TasksDoc } from './model.ts';
import { findTask, indexOf, updateTask, withItems } from './ops.ts';
import { isUsableHabitRule, readBack } from './tasks-file.ts';
import { allTasks } from './buckets.ts';

/** The open habits, in file order. */
export function habitsInProgress(doc: TasksDoc): Task[] {
  return allTasks(doc).filter((t) => t.habit !== undefined);
}

/** Whether another habit may start: the limit is 0 (none) or more than the habits in progress (spec 10.1). */
export function canStartHabit(doc: TasksDoc, config: HabitConfig): boolean {
  return config.maxInProgress === 0 || habitsInProgress(doc).length < config.maxInProgress;
}

/**
 * Makes the task a habit (🌱, the configured goal) or an ordinary repeating task again, dropping any goal.
 * Turning it on needs a usable 🔁 rule and is `s` itself without one or when already a habit. It does not
 * check the limit; the app does.
 */
export function setHabit(s: State, id: string, on: boolean): State {
  const t = findTask(s, id);
  if (!t || (t.habit !== undefined) === on) return s;
  if (on && !isUsableHabitRule(t.repeat)) return s;
  return updateTask(s, id, ({ habit: _, ...rest }) => (on ? { ...rest, habit: { goal: null } } : rest));
}

/** Gives a habit its own goal (1–999), or null for the configured one; `s` for anything else. */
export function setHabitGoal(s: State, id: string, goal: number | null): State {
  const t = findTask(s, id);
  if (!t?.habit || (goal !== null && !(Number.isInteger(goal) && goal >= 1 && goal <= 999))) return s;
  return updateTask(s, id, (task) => ({ ...task, habit: { goal } }));
}

/** The habit task `id` and where its block is in `doc.items`; null for an unknown id or a task that is no habit. */
function habitAt(s: State, id: string): { task: Task; at: number } | null {
  const task = findTask(s, id);
  return task?.habit ? { task: readBack(task), at: indexOf(s, id) } : null;
}

function withoutBlock(s: State, at: number): State['doc']['items'] {
  return s.doc.items.filter((_, i) => i !== at);
}

/**
 * A habit that reached its goal leaves tasks.md, notes and all, and `done.md` gets its 🏆 line. Gives the task
 * as it was stored and its item index, for Undo and Keep as task (`restoreTask`); null for a non-habit.
 */
export function formHabit(s: State, id: string, today: ISODate): { state: State; task: Task; at: number } | null {
  const found = habitAt(s, id);
  if (!found) return null;
  const state = { ...withItems(s, withoutBlock(s, found.at)), done: { lines: [...s.done.lines, formedLine(found.task.title, today)] } };
  return { state, ...found };
}

/** Drops a habit: it leaves tasks.md and `done.md` gets its ❌ line. `s` for a non-habit. */
export function dropHabit(s: State, id: string, today: ISODate): State {
  const found = habitAt(s, id);
  if (!found) return s;
  return { ...withItems(s, withoutBlock(s, found.at)), done: { lines: [...s.done.lines, droppedLine(found.task.title, today)] } };
}

/** Puts `task` back as an open task at item index `at` (clamped to the end). */
export function restoreTask(s: State, task: Task, at: number): State {
  const items = s.doc.items.slice();
  items.splice(Math.min(at, items.length), 0, { kind: 'task', task: readBack(task) });
  return withItems(s, items);
}

/** The ids of the open habits that have reached their goal, in file order. */
export function formedHabits(s: State, today: ISODate, config: HabitConfig): string[] {
  return habitsInProgress(s.doc).filter((t) => habitProgress(t, s.done, today, config).formedOn !== null).map((t) => t.id);
}

export interface FormedHabit {
  title: string;
  goal: number;
  first: ISODate;
  last: ISODate;
  days: number;
  attempts: number;
}

export interface DroppedHabit {
  title: string;
  best: number;
  attempts: number;
  on: ISODate;
}

/** The rule of the last completion of the habit titled `title` before line `end`, daily when none or unusable. */
function ruleBefore(title: string, done: DoneDoc, end: number): RepeatRule {
  let from = 0;
  for (let i = 0; i < end; i++) if (done.lines[i]!.end?.title === title) from = i + 1;
  let last: { on: ISODate; repeat: RepeatRule | null } | null = null;
  for (let i = from; i < end; i++) {
    const e = done.lines[i]!.entry;
    if (e?.habit && e.title === title && e.doneOn !== null && (!last || e.doneOn >= last.on)) last = { on: e.doneOn, repeat: e.repeat };
  }
  return last?.repeat && isUsableHabitRule(last.repeat) ? last.repeat : { type: 'daily' };
}

/**
 * The habits of the 🏆 and ❌ lines of `done.md`, newest first. Each is walked up to its end line with no goal
 * to stop it, by the rule of its last completion and the configured miss rules, to find its final count,
 * first day and attempts.
 */
export function habitHistory(done: DoneDoc, config: HabitConfig): { formed: FormedHabit[]; dropped: DroppedHabit[] } {
  const rows: { line: number; on: ISODate; formed?: FormedHabit; dropped?: DroppedHabit }[] = [];
  done.lines.forEach((l, i) => {
    const end = l.end;
    if (!end) return;
    const rules = { ...habitRules({ goal: null }, config), goal: Number.MAX_SAFE_INTEGER };
    const p = walkHabit(habitCompletions(end.title, done, i), ruleBefore(end.title, done, i), end.on, rules);
    if (end.kind === 'formed') {
      const first = p.since ?? end.on;
      rows.push({ line: i, on: end.on, formed: { title: end.title, goal: p.count, first, last: end.on, days: daysBetween(first, end.on) + 1, attempts: p.attempt } });
    } else {
      rows.push({ line: i, on: end.on, dropped: { title: end.title, best: Math.max(p.best, p.count), attempts: p.attempt, on: end.on } });
    }
  });
  rows.sort((a, b) => b.on.localeCompare(a.on) || b.line - a.line);
  return {
    formed: rows.flatMap((r) => (r.formed ? [r.formed] : [])),
    dropped: rows.flatMap((r) => (r.dropped ? [r.dropped] : [])),
  };
}
