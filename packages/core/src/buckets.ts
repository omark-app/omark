import { addDays, endOfNextWeek, endOfWeek, hasWeekLeft } from './dates.ts';
import { dayMonth, weekdayShort } from './labels.ts';
import type { BucketKey, ISODate, Task, TasksDoc, WeekCtx } from './model.ts';

export const BUCKETS: readonly { key: BucketKey; name: string }[] = [
  { key: 'today', name: 'Today' },
  { key: 'week', name: 'This week' },
  { key: 'next', name: 'Next week' },
  { key: 'later', name: 'Later' },
  { key: 'someday', name: 'Someday' },
];

export function bucketOf(t: Task, ctx: WeekCtx): BucketKey {
  const d = t.date;
  if (d === null) return 'someday';
  if (d <= ctx.today) return 'today';
  if (d <= endOfWeek(ctx)) return 'week';
  if (d <= endOfNextWeek(ctx)) return 'next';
  return 'later';
}

/** A bucket a task can be moved to by a date shortcut (Later has no single date). */
export type MovableBucket = Exclude<BucketKey, 'later'>;

/** The move and add choices, in order. This week is left out on its last day, where it would be Today. */
export function movableBuckets(ctx: WeekCtx): { key: MovableBucket; name: string }[] {
  return BUCKETS.filter(
    (b): b is { key: MovableBucket; name: string } => b.key !== 'later' && (b.key !== 'week' || hasWeekLeft(ctx)),
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

/** Open tasks in file order. */
export function allTasks(doc: TasksDoc): Task[] {
  const out: Task[] = [];
  for (const item of doc.items) if (item.kind === 'task') out.push(item.task);
  return out;
}

/** Earliest date first, then file order (the sort is stable). */
export function tasksInBucket(doc: TasksDoc, key: BucketKey, ctx: WeekCtx): Task[] {
  return allTasks(doc)
    .filter((t) => bucketOf(t, ctx) === key)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

export function bucketRange(key: BucketKey, ctx: WeekCtx): string {
  if (key === 'week') {
    if (!hasWeekLeft(ctx)) return '';
    return `${weekdayShort(addDays(ctx.today, 1))}–${weekdayShort(endOfWeek(ctx))}`;
  }
  if (key === 'next') {
    return `${dayMonth(addDays(endOfWeek(ctx), 1), ctx)} – ${dayMonth(endOfNextWeek(ctx), ctx)}`;
  }
  return '';
}
