import type { ISODate, WeekCtx } from './model.ts';

const DAY_MS = 86_400_000;

function parse(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
}

function format(t: Date): ISODate {
  const y = String(t.getUTCFullYear()).padStart(4, '0');
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const day = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar date of a Date as `YYYY-MM-DD`. */
export function toISODate(d: Date): ISODate {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Adds calendar days to a date. Works on UTC midnights, so DST never shifts it. */
export function addDays(d: ISODate, n: number): ISODate {
  return format(new Date(parse(d).getTime() + n * DAY_MS));
}

/** Days from `a` to `b` (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function dayOfWeek(d: ISODate): number {
  return (parse(d).getUTCDay() + 6) % 7;
}

/** `month1` is 1-based (February = 2). */
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function weekCtx(now: Date, weekStart = 0): WeekCtx {
  return { today: toISODate(now), weekStart };
}

/** Last day of the week containing `today`: the day before the next `weekStart` day. */
export function endOfWeek(ctx: WeekCtx): ISODate {
  const lastDow = (ctx.weekStart + 6) % 7;
  const daysLeft = (lastDow - dayOfWeek(ctx.today) + 7) % 7;
  return addDays(ctx.today, daysLeft);
}

/** The 7 days after this week's end. */
export function endOfNextWeek(ctx: WeekCtx): ISODate {
  return addDays(endOfWeek(ctx), 7);
}

/** True when there are days left after today in this week. */
export function hasWeekLeft(ctx: WeekCtx): boolean {
  return endOfWeek(ctx) !== ctx.today;
}
