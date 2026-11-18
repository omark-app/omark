import { habitCompletions } from './habits.ts';
import type { DoneDoc, ISODate, Task } from './model.ts';
import { timesStatus, type TimesStatus } from './recurrence.ts';

/**
 * The ✅ dates that count for a `times` task (#163): a habit's counted completions; for a task, the
 * completions with its exact title and a `times` rule. Sorted; two on one day are both kept.
 */
export function timesCompletions(task: Pick<Task, 'title' | 'habit'>, done: DoneDoc): ISODate[] {
  if (task.habit) return habitCompletions(task.title, done);
  const out: ISODate[] = [];
  for (const l of done.lines) {
    const e = l.entry;
    if (e && e.title === task.title && e.repeat?.type === 'times' && e.doneOn !== null) out.push(e.doneOn);
  }
  return out.sort();
}

/** Where a task with a `times` rule stands today; null for any other task. */
export function timesStatusOf(task: Task, done: DoneDoc, today: ISODate): TimesStatus | null {
  return task.repeat?.type === 'times' ? timesStatus(task.repeat, timesCompletions(task, done), today) : null;
}
