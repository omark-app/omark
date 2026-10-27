import { dayMonth, daysBetween, describeRepeat, weekdayShort } from '@omark/tasks-core';
import type { ISODate, RepeatRule, WeekCtx } from '@omark/tasks-core';

/** Toast wording (spec 9.1), one function per toast. */

export const added = (bucketName: string): string => `Added to ${bucketName}`;

/** `label` is the task's meta label after the move (null when it has none, e.g. in Today). */
export const moved = (bucketName: string, label: string | null): string =>
  label ? `Moved to ${bucketName} · ${label}` : `Moved to ${bucketName}`;

export const doneRepeat = (next: ISODate, ctx: WeekCtx): string =>
  `Done · next ${weekdayShort(next)} ${dayMonth(next, ctx)}`;

export const done = (title: string): string => `Done · ${title}`;

/** A task with 🔁 text but no rule the app can read: logged in done.md, left in the list (#79). */
export const doneKept = (): string => "Done · its 🔁 rule can't be read, so the task stays";

export const deleted = (title: string): string => `Deleted · ${title}`;

export const reordered = (sameDate: boolean, sameFlag = true): string =>
  !sameFlag ? 'Important tasks sort first, so it stays among its own kind'
    : sameDate ? 'Reordered' : 'Tasks sort by date first, so it stays among its own date';

export const saved = (): string => 'Saved';

export const repeats = (rule: RepeatRule): string => `Repeats ${describeRepeat(rule)}`;

export const repeatRemoved = (): string => 'Repeat removed';

export const markedImportant = (): string => 'Marked important';

export const notImportant = (): string => 'No longer important';

export const undone = (): string => 'Undone';

export const nothingToUndo = (): string => 'Nothing to undo';

// ---- habits (#44, habits spec 6–8 and 10.1) ----

/** `Tue` within the next six days, else `12 Nov`. */
const nextDay = (next: ISODate, ctx: WeekCtx): string =>
  daysBetween(ctx.today, next) <= 6 ? weekdayShort(next) : dayMonth(next, ctx);

const habits = (n: number): string => (n === 1 ? '1 habit' : `${n} habits`);

export const habitTick = (title: string, count: number, goal: number, next: ISODate, ctx: WeekCtx): string =>
  `${title} · ${count}/${goal} · next ${nextDay(next, ctx)}`;

export const alreadyDone = (span: 'today' | 'this week' | 'this period', next: ISODate, ctx: WeekCtx): string =>
  `Already done ${span} · next ${nextDay(next, ctx)}`;

export const habitFormed = (title: string, goal: number, days: number): string =>
  `Habit formed: ${title} · ${goal} in ${days} ${days === 1 ? 'day' : 'days'} · moved to History`;

export const habitLimit = (max: number): string =>
  `${habits(max)} in progress already. Finish or drop one first, or raise the limit in Settings.`;

export const addedNotHabit = (max: number, title: string): string =>
  `${habits(max)} in progress already. ${title} added as a repeating task; make it a habit when one is formed or dropped.`;

export const nowHabit = (): string => 'Now a habit';

export const notHabit = (): string => 'No longer a habit';

export const droppedHabit = (title: string): string => `Dropped habit · ${title}`;

export const keptAsTask = (): string => 'Kept as a repeating task';

export const renameHabit = (title: string): string => `Renaming restarts ${title} at 0. Rename?`;

export const habitGoal = (goal: number): string => `Goal ${goal}`;
