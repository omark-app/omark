import { dayMonth, describeRepeat, weekdayShort } from '@taskapp/core';
import type { ISODate, RepeatRule, WeekCtx } from '@taskapp/core';

/** Toast wording (spec 9.1), one function per toast. */

export const added = (bucketName: string): string => `Added to ${bucketName}`;

/** `label` is the task's meta label after the move (null when it has none, e.g. in Today). */
export const moved = (bucketName: string, label: string | null): string =>
  label ? `Moved to ${bucketName} · ${label}` : `Moved to ${bucketName}`;

export const doneRepeat = (next: ISODate, ctx: WeekCtx): string =>
  `Done · next ${weekdayShort(next)} ${dayMonth(next, ctx)}`;

export const done = (title: string): string => `Done · ${title}`;

export const deleted = (title: string): string => `Deleted · ${title}`;

export const reordered = (sameDate: boolean): string =>
  sameDate ? 'Reordered' : 'Tasks sort by date first, so it stays among its own date';

export const saved = (): string => 'Saved';

export const repeats = (rule: RepeatRule): string => `Repeats ${describeRepeat(rule)}`;

export const repeatRemoved = (): string => 'Repeat removed';

export const undone = (): string => 'Undone';

export const nothingToUndo = (): string => 'Nothing to undo';
