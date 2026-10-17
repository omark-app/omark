import type { ISODate, RepeatRule } from './model.ts';
import { addDays, dayOfWeek, daysBetween, daysInMonth } from './dates.ts';

const MAX_STEPS = 100_000;

const pad = (n: number, w: number) => String(n).padStart(w, '0');

function parts(d: ISODate): [number, number, number] {
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
}

function make(year: number, month1: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month1, 2)}-${pad(Math.min(day, daysInMonth(year, month1)), 2)}`;
}

/**
 * Does this date lie on the rule's pattern? `yearly`, `every` and `after` have no pattern to miss. A weekly
 * or monthly interval is ignored here (it needs an anchor; see `nextOnCycle`).
 */
export function matchesRule(rule: RepeatRule, d: ISODate): boolean {
  switch (rule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek(d) < 5;
    case 'weekly':
      return rule.days.includes(dayOfWeek(d));
    case 'monthly': {
      const [y, m, day] = parts(d);
      return day === Math.min(rule.day, daysInMonth(y, m));
    }
    default:
      return true;
  }
}

/** Calendar months from the month of `a` to the month of `b`. */
function monthsBetween(a: ISODate, b: ISODate): number {
  const [ay, am] = parts(a);
  const [by, bm] = parts(b);
  return (by - ay) * 12 + (bm - am);
}

/** `start` moved `k` calendar months on, keeping `day` (clamped to the month's length). */
function addMonths(start: ISODate, k: number, day: number): ISODate {
  const [y, m] = parts(start);
  const idx = y * 12 + (m - 1) + k;
  return make(Math.floor(idx / 12), (idx % 12) + 1, day);
}

/**
 * The first date strictly after `after` on an interval rule's cycle, counted from `anchor`: weekly uses
 * the listed days in Monday-to-Sunday weeks 0, n, 2n, … from the anchor's week; monthly uses the rule day
 * in months 0, n, 2n, … from the anchor's month (so the anchor's own week or month counts). N = 1 is the
 * plain weekly / monthly rule. Starts at the cycle just before `after`, so a long overdue task is one jump.
 */
function nextOnCycle(rule: Extract<RepeatRule, { type: 'weekly' | 'monthly' }>, anchor: ISODate, after: ISODate): ISODate {
  const n = rule.n ?? 1;
  if (rule.type === 'monthly') {
    const from = Math.max(0, Math.floor(monthsBetween(anchor, after) / n));
    for (let k = from; k < from + 3; k++) {
      const c = addMonths(anchor, k * n, rule.day);
      if (c > after) return c;
    }
  } else {
    const monday = addDays(anchor, -dayOfWeek(anchor));
    const from = Math.max(0, Math.floor(daysBetween(monday, after) / 7 / n));
    for (let k = from; k < from + 3; k++) {
      for (const day of rule.days) {
        const c = addDays(monday, k * n * 7 + day);
        if (c > after) return c;
      }
    }
  }
  throw new Error('nextOnCycle: no date found');
}

/**
 * First date of the pattern after `today`, stepping from the current due date (at least one step: the
 * result is also after the due date). Monthly considers the due month's own occurrence, so a task moved
 * off its day (e.g. to the 5th of a "15th" rule) and completed then moves to the 15th, as weekly does.
 * Interval weekly / monthly rules count their weeks or months from the due date's (else today's).
 */
export function nextDate(rule: RepeatRule, due: ISODate | null, today: ISODate): ISODate {
  if (rule.type === 'after') return addDays(today, rule.n);
  const start = due ?? today;
  if (rule.type === 'weekly' || rule.type === 'monthly') {
    return nextOnCycle(rule, start, due !== null && due > today ? due : today);
  }
  if (rule.type === 'yearly' || (rule.type === 'every' && rule.unit === 'months')) {
    const months = rule.type === 'yearly' ? 12 : rule.n;
    const k0 = Math.max(1, Math.floor(monthsBetween(start, today) / months));
    for (let k = k0; k < k0 + 3; k++) {
      const c = addMonths(start, k * months, parts(start)[2]);
      if (c > today) return c;
    }
    throw new Error('nextDate: no date found');
  }
  const stride = rule.type === 'every' ? rule.n * (rule.unit === 'weeks' ? 7 : 1) : 1;
  let d = start;
  for (let i = 0; i < MAX_STEPS; i++) {
    d = addDays(d, stride);
    if (d > today && matchesRule(rule, d)) return d;
  }
  throw new Error('nextDate: no date found');
}

/**
 * Keep `date` if it fits the rule, else the first fitting date on or after it (or today). Interval
 * weekly / monthly rules count their cycle from that date's week or month.
 */
export function fitDate(rule: RepeatRule, date: ISODate | null, today: ISODate): ISODate {
  const from = date ?? today;
  if (rule.type === 'weekly' || rule.type === 'monthly') return nextOnCycle(rule, from, addDays(from, -1));
  let d = from;
  for (let i = 0; i < 1000; i++) {
    if (matchesRule(rule, d)) return d;
    d = addDays(d, 1);
  }
  throw new Error('fitDate: no fitting date found');
}
