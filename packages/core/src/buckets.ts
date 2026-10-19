import { addDays, endOfNextWeek, endOfWeek, hasWeekLeft } from './dates.ts';
import { dayMonth, weekdayShort } from './labels.ts';
import type { BucketKey, ISODate, Task, TasksDoc, WeekCtx } from './model.ts';

export const BUCKETS: readonly { key: BucketKey; name: string }[] = [
  { key: 'overdue', name: 'Overdue' },
  { key: 'today', name: 'Today' },
  { key: 'week', name: 'This week' },
  { key: 'next', name: 'Next week' },
  { key: 'later', name: 'Later' },
  { key: 'someday', name: 'Someday' },
];

export function bucketOf(t: Task, ctx: WeekCtx): BucketKey {
  const d = t.date;
  if (d === null) return 'someday';
  if (d < ctx.today) return 'overdue';
  if (d === ctx.today) return 'today';
  if (d <= endOfWeek(ctx)) return 'week';
  if (d <= endOfNextWeek(ctx)) return 'next';
  return 'later';
}

/**
 * A bucket a task can be moved to by a date shortcut. Later has no single date, and nothing is moved into
 * Overdue: tasks only land there as days pass.
 */
export type MovableBucket = Exclude<BucketKey, 'overdue' | 'later'>;

const isMovable = (key: BucketKey): key is MovableBucket => key !== 'overdue' && key !== 'later';

/** The move and add choices, in order. This week is left out on its last day, where it would be Today. */
export function movableBuckets(ctx: WeekCtx): { key: MovableBucket; name: string }[] {
  return BUCKETS.filter(
    (b): b is { key: MovableBucket; name: string } => isMovable(b.key) && (b.key !== 'week' || hasWeekLeft(ctx)),
  );
}

/** The date a task gets when moved to a bucket (spec 4.2). Later has no single date. */
export function dateForBucket(key: MovableBucket, ctx: WeekCtx): ISODate | null {
  switch (key) {
    case 'today': return ctx.today;
    case 'week': return endOfWeek(ctx);
    case 'next': return endOfNextWeek(ctx);
    case 'someday': return null;
  }
}

/** Where a new task goes: a bucket, Tomorrow, or a given date (a typed weekday, issue #19). */
export type DateChoice = MovableBucket | 'tomorrow' | { date: ISODate };

/** The date a task gets from a `DateChoice`; null for Someday. */
export function dateForChoice(choice: DateChoice, ctx: WeekCtx): ISODate | null {
  if (typeof choice === 'object') return choice.date;
  return choice === 'tomorrow' ? addDays(ctx.today, 1) : dateForBucket(choice, ctx);
}

/** A choice shown as a chip or a move option: a bucket, or Tomorrow. */
export type ChoiceKey = MovableBucket | 'tomorrow';

/** The date choices offered when adding or moving a task: `movableBuckets` with Tomorrow after Today. */
export function dateChoices(ctx: WeekCtx): { key: ChoiceKey; name: string }[] {
  return movableBuckets(ctx).flatMap((b) => (b.key === 'today' ? [b, { key: 'tomorrow' as const, name: 'Tomorrow' }] : [b]));
}

/** The choice that holds `t` now: Tomorrow when it is due tomorrow, else its bucket; null for Overdue and Later. */
export function currentChoice(t: Task, ctx: WeekCtx): ChoiceKey | null {
  if (t.date === addDays(ctx.today, 1)) return 'tomorrow';
  const b = bucketOf(t, ctx);
  return isMovable(b) ? b : null;
}

/** Open tasks in file order. */
export function allTasks(doc: TasksDoc): Task[] {
  const out: Task[] = [];
  for (const item of doc.items) if (item.kind === 'task') out.push(item.task);
  return out;
}

/** Important first (issue #19), then earliest date, then file order (the sort is stable). */
export function tasksInBucket(doc: TasksDoc, key: BucketKey, ctx: WeekCtx): Task[] {
  return allTasks(doc)
    .filter((t) => bucketOf(t, ctx) === key)
    .sort((a, b) => Number(b.important === true) - Number(a.important === true) || (a.date ?? '').localeCompare(b.date ?? ''));
}

export function bucketRange(key: BucketKey, ctx: WeekCtx): string {
  if (key === 'week') {
    if (!hasWeekLeft(ctx)) return '';
    const first = addDays(ctx.today, 1);
    const last = endOfWeek(ctx);
    return first === last ? weekdayShort(last) : `${weekdayShort(first)}–${weekdayShort(last)}`;
  }
  if (key === 'next') {
    return `${dayMonth(addDays(endOfWeek(ctx), 1), ctx)} – ${dayMonth(endOfNextWeek(ctx), ctx)}`;
  }
  return '';
}
