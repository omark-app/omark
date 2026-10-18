import { bucketOf } from './buckets.ts';
import { addDays, endOfNextWeek } from './dates.ts';
import type { BucketKey, ISODate, State, WeekCtx } from './model.ts';
import { findTask, moveToBucket, reorder } from './ops.ts';

export interface DropTarget {
  bucket: BucketKey;
  /** The task the item is dropped directly before, or null when dropped on the bucket itself. */
  beforeId: string | null;
}

export type DropOutcome =
  | { kind: 'none' }
  | { kind: 'reorder'; state: State; sameDate: boolean }
  | { kind: 'move'; state: State; bucket: BucketKey }
  | { kind: 'pickDate'; suggested: ISODate; beforeId: string | null };

/**
 * What a drop of task `id` on `target` does (spec 4.4). Same bucket: reorder before `beforeId`.
 * Overdue takes no tasks from elsewhere, so a drop there does nothing. Later has no single date, so it
 * asks for one. Any other bucket: set the date and place it.
 */
export function planDrop(s: State, id: string, target: DropTarget, ctx: WeekCtx): DropOutcome {
  const task = findTask(s, id);
  if (!task) return { kind: 'none' };

  if (bucketOf(task, ctx) === target.bucket) {
    const { beforeId } = target;
    if (beforeId === null || beforeId === id) return { kind: 'none' };
    const before = findTask(s, beforeId);
    if (!before) return { kind: 'none' };
    return { kind: 'reorder', state: reorder(s, id, beforeId), sameDate: task.date === before.date };
  }

  if (target.bucket === 'overdue') return { kind: 'none' };

  if (target.bucket === 'later') {
    return { kind: 'pickDate', suggested: addDays(endOfNextWeek(ctx), 1), beforeId: target.beforeId };
  }

  const bucket = target.bucket;
  return { kind: 'move', state: moveToBucket(s, id, bucket, ctx, target.beforeId), bucket };
}
