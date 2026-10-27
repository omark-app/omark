import { dayOfWeek, daysBetween, endOfNextWeek } from './dates.ts';
import type { HabitProgress } from './habits.ts';
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

/**
 * The one-line meta label of a task row (spec 5.1). A habit is never overdue (habits spec 3): a missed
 * period's old date reads as today.
 */
export function metaLabel(t: Task, ctx: WeekCtx, style: DateLabelStyle): MetaLabel {
  const repeat = t.repeat !== null;
  const d = t.date;
  if (d === null) return { text: null, overdue: false, repeat };
  const ago = daysBetween(d, ctx.today);
  if (ago === 0 || (ago > 0 && t.habit)) return { text: null, overdue: false, repeat };
  if (style === 'iso') return { text: d, overdue: ago > 0, repeat };
  if (ago > 0) return { text: ago < 7 ? weekdayShort(d) : dayMonth(d, ctx), overdue: true, repeat };
  const text = d > endOfNextWeek(ctx) ? dayMonth(d, ctx) : weekdayShort(d);
  return { text, overdue: false, repeat };
}

/**
 * Long form for the detail view: `Today · Fri 16 Oct`, `Wed 14 Oct · overdue`, `Someday · no date`. A habit's
 * old date reads as today, never overdue (habits spec 3).
 */
export function dueText(t: Task, ctx: WeekCtx): string {
  const d = t.date !== null && t.habit && t.date < ctx.today ? ctx.today : t.date;
  if (d === null) return 'Someday · no date';
  const full = `${weekdayShort(d)} ${dayMonth(d, ctx)}`;
  const diff = daysBetween(ctx.today, d);
  if (diff === 0) return `Today · ${full}`;
  if (diff < 0) return `${full} · overdue`;
  return full;
}

export interface HabitLabel {
  count: string;
  when: string | null;
  tag: 'last chance' | `restarted · best ${number}` | null;
}

/**
 * The meta label of a habit row (habits spec 9.2): the count, a date when it is not for today (`by Sun`
 * while a longer period is still open, else the date of a later bucket) and a tag. Never overdue: a missed
 * period's old date says nothing.
 */
export function habitLabel(t: Task, p: HabitProgress, ctx: WeekCtx, style: DateLabelStyle): HabitLabel {
  let when: string | null = null;
  if (!p.doneThisPeriod && p.period.end > ctx.today) {
    when = `by ${p.period.end > endOfNextWeek(ctx) ? dayMonth(p.period.end, ctx) : weekdayShort(p.period.end)}`;
  } else if (t.date !== null && t.date > ctx.today) {
    when = metaLabel(t, ctx, style).text;
  }
  const tag = p.lastChance ? 'last chance' : p.restarted && p.best > 0 ? (`restarted · best ${p.best}` as const) : null;
  return { count: `${p.count}/${p.rules.goal}`, when, tag };
}
