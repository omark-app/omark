import { dayOfWeek, daysBetween, endOfNextWeek } from './dates.ts';
import type { ISODate, Task, WeekCtx } from './model.ts';

export type DateLabelStyle = 'short' | 'iso';

export interface MetaLabel {
  text: string | null;
  overdue: boolean;
  repeat: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `Thu`. */
export function weekdayShort(d: ISODate): string {
  return WEEKDAYS[dayOfWeek(d)]!;
}

/** `12 Nov`, or `12 Nov '27` when the year differs from today's. */
export function dayMonth(d: ISODate, ctx: WeekCtx): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const base = `${day} ${MONTHS[m - 1]!}`;
  const todayYear = Number(ctx.today.slice(0, 4));
  return y === todayYear ? base : `${base} '${String(y % 100).padStart(2, '0')}`;
}

/** The one-line meta label of a task row (spec 5.1). */
export function metaLabel(t: Task, ctx: WeekCtx, style: DateLabelStyle): MetaLabel {
  const repeat = t.repeat !== null;
  const d = t.date;
  if (d === null) return { text: null, overdue: false, repeat };
  const ago = daysBetween(d, ctx.today);
  if (ago === 0) return { text: null, overdue: false, repeat };
  if (style === 'iso') return { text: d, overdue: ago > 0, repeat };
  if (ago > 0) return { text: ago < 7 ? weekdayShort(d) : dayMonth(d, ctx), overdue: true, repeat };
  const text = d > endOfNextWeek(ctx) ? dayMonth(d, ctx) : weekdayShort(d);
  return { text, overdue: false, repeat };
}

/** Long form for the detail view: `Today · Fri 16 Oct`, `Wed 14 Oct · overdue`, `Someday · no date`. */
export function dueText(t: Task, ctx: WeekCtx): string {
  const d = t.date;
  if (d === null) return 'Someday · no date';
  const full = `${weekdayShort(d)} ${dayMonth(d, ctx)}`;
  const diff = daysBetween(ctx.today, d);
  if (diff === 0) return `Today · ${full}`;
  if (diff < 0) return `${full} · overdue`;
  return full;
}
