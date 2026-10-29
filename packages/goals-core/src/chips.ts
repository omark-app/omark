// A goal's status chips (Goals spec 8): facts, no judging.
import type { OpenInput, RowInput } from './activity.ts';
import type { Goal, ISODate } from './model.ts';
import { titleTags } from './tags.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `Oct 2027` for any date in that month. */
export function monthLabel(d: ISODate): string {
  return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

export interface GoalStatus {
  kind: 'by' | 'wasDue' | 'achieved';
  label: string;
}

/** "by Oct 2027", "was due Oct 2026" (the date has passed), "✓ Aug 2026"; null for an open goal with no date. */
export function goalStatus(goal: Goal, today: ISODate): GoalStatus | null {
  if (goal.achieved) return { kind: 'achieved', label: goal.doneOn ? `✓ ${monthLabel(goal.doneOn)}` : '✓' };
  if (!goal.due) return null;
  return goal.due < today
    ? { kind: 'wasDue', label: `was due ${monthLabel(goal.due)}` }
    : { kind: 'by', label: `by ${monthLabel(goal.due)}` };
}

/** A row with its hours; time-core's `EventRow` fits. */
export interface HoursRow extends RowInput {
  hours: number;
}

export interface ProjectFacts {
  hoursThisMonth: number;
  /** Since the goal's `➕`; all hours when it has none. */
  hoursSinceSet: number;
  openTasks: number;
}

/**
 * For a goal with a project code: its known hours up to today, this month and since the goal was set, and
 * the open tasks tagged with the code. Null for a goal without a code.
 */
export function projectFacts(
  goal: Goal, input: { rows?: readonly HoursRow[]; open?: readonly OpenInput[]; today: ISODate },
): ProjectFacts | null {
  if (!goal.code) return null;
  const code = goal.code.toUpperCase();
  const { today } = input;
  const month = today.slice(0, 7);
  let thisMonth = 0;
  let sinceSet = 0;
  for (const r of input.rows ?? []) {
    if (!r.known || r.date > today || r.project.toUpperCase() !== code) continue;
    if (r.date.startsWith(month)) thisMonth += r.hours;
    if (goal.setOn === null || r.date >= goal.setOn) sinceSet += r.hours;
  }
  const openTasks = (input.open ?? []).filter((t) => titleTags(t.title).some((tag) => tag.toUpperCase() === code)).length;
  return { hoursThisMonth: round(thisMonth), hoursSinceSet: round(sinceSet), openTasks };
}

const round = (h: number): number => Math.round(h * 100) / 100;
