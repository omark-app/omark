import { addDays, endOfNextWeek, endOfWeek, hasWeekLeft } from './dates.ts';
import { dayMonth, weekdayShort } from './labels.ts';
import type { BucketKey, ISODate, Task, TasksDoc, WeekCtx } from './model.ts';

export const BUCKETS: readonly { key: BucketKey; name: string }[] = [
  { key: 'today', name: 'Today' },
  { key: 'tomorrow', name: 'Tomorrow' },
  { key: 'week', name: 'This week' },
  { key: 'next', name: 'Next week' },
  { key: 'later', name: 'Later' },
  { key: 'someday', name: 'Someday' },
];

/**
 * Important, not urgent (#38): open tasks with ⏫ and no date. Not a date bucket: it is shown apart from
 * them (where ALWAYS used to be), never folds, and is not a move or add choice.
 */
export const IMPORTANT_GROUP = { key: 'important', name: 'Important, not urgent' } as const;

/** The name a bucket, or the Important, not urgent group, is shown by. */
export function bucketName(key: BucketKey): string {
  return key === IMPORTANT_GROUP.key ? IMPORTANT_GROUP.name : BUCKETS.find((b) => b.key === key)!.name;
}

export function bucketOf(t: Task, ctx: WeekCtx): BucketKey {
  const d = t.date;
  if (d === null) return t.important ? 'important' : 'someday';
  if (d <= ctx.today) return 'today';
  if (d === addDays(ctx.today, 1)) return 'tomorrow';
  if (d <= endOfWeek(ctx)) return 'week';
  if (d <= endOfNextWeek(ctx)) return 'next';
  return 'later';
}

/** A bucket a task can be moved to by a date shortcut. Later has no single date; the group is no date. */
export type MovableBucket = Exclude<BucketKey, 'later' | 'important'>;

const isMovable = (key: BucketKey): key is MovableBucket => key !== 'later' && key !== 'important';

/**
 * The move and add choices, in order. This week is left out when no day after tomorrow is left in it,
 * where it would be Today or Tomorrow.
 */
export function movableBuckets(ctx: WeekCtx): { key: MovableBucket; name: string }[] {
  return BUCKETS.filter(
    (b): b is { key: MovableBucket; name: string } => isMovable(b.key) && (b.key !== 'week' || hasWeekLeft(ctx)),
  );
}

/** The date a task gets when moved to a bucket (spec 4.2). Later has no single date. */
export function dateForBucket(key: MovableBucket, ctx: WeekCtx): ISODate | null {
  switch (key) {
    case 'today': return ctx.today;
    case 'tomorrow': return addDays(ctx.today, 1);
    case 'week': return endOfWeek(ctx);
    case 'next': return endOfNextWeek(ctx);
    case 'someday': return null;
  }
}

/** Where a new task goes: a bucket or a given date (a typed weekday, issue #19). */
export type DateChoice = MovableBucket | { date: ISODate };

/** The date a task gets from a `DateChoice`; null for Someday. */
export function dateForChoice(choice: DateChoice, ctx: WeekCtx): ISODate | null {
  return typeof choice === 'object' ? choice.date : dateForBucket(choice, ctx);
}

/** A choice shown as a chip or a move option. */
export type ChoiceKey = MovableBucket;

/** The date choices offered when adding or moving a task. */
export function dateChoices(ctx: WeekCtx): { key: ChoiceKey; name: string }[] {
  return movableBuckets(ctx);
}

/**
 * The choice that holds `t` now: its bucket; null for Later and for an overdue task, so Today still reads
 * as a move for it.
 */
export function currentChoice(t: Task, ctx: WeekCtx): ChoiceKey | null {
  if (t.date !== null && t.date < ctx.today) return null;
  const b = bucketOf(t, ctx);
  return isMovable(b) ? b : null;
}

/** Open tasks in file order. */
export function allTasks(doc: TasksDoc): Task[] {
  const out: Task[] = [];
  for (const item of doc.items) if (item.kind === 'task') out.push(item.task);
  return out;
}

/**
 * Important first (issue #19), then earliest date, then file order (the sort is stable). In Today that
 * puts overdue tasks above today's (#26). The Important, not urgent group is thus in file order (#38).
 */
export function tasksInBucket(doc: TasksDoc, key: BucketKey, ctx: WeekCtx): Task[] {
  return allTasks(doc)
    .filter((t) => bucketOf(t, ctx) === key)
    .sort((a, b) => Number(b.important === true) - Number(a.important === true) || (a.date ?? '').localeCompare(b.date ?? ''));
}

export function bucketRange(key: BucketKey, ctx: WeekCtx): string {
  if (key === 'week') {
    if (!hasWeekLeft(ctx)) return '';
    const first = addDays(ctx.today, 2);
    const last = endOfWeek(ctx);
    return first === last ? weekdayShort(last) : `${weekdayShort(first)}–${weekdayShort(last)}`;
  }
  if (key === 'tomorrow') return weekdayShort(addDays(ctx.today, 1));
  if (key === 'next') {
    return `${dayMonth(addDays(endOfWeek(ctx), 1), ctx)} – ${dayMonth(endOfNextWeek(ctx), ctx)}`;
  }
  return '';
}
