import type { ISODate, RepeatRule } from './model.ts';
import { addDays, dayOfWeek, daysInMonth } from './dates.ts';

const MAX_STEPS = 100_000;

const pad = (n: number, w: number) => String(n).padStart(w, '0');

function parts(d: ISODate): [number, number, number] {
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
}

function make(year: number, month1: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month1, 2)}-${pad(Math.min(day, daysInMonth(year, month1)), 2)}`;
}

/** Does this date lie on the rule's pattern? `yearly`, `every` and `after` have no pattern to miss. */
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

/** The k-th calendar step (k >= 0) from `start`, anchored on the rule's day so clamping never drifts. */
function anchored(rule: RepeatRule, start: ISODate, k: number): ISODate {
  const [y, m, d] = parts(start);
  if (rule.type === 'monthly') {
    const idx = y * 12 + (m - 1) + k;
    return make(Math.floor(idx / 12), (idx % 12) + 1, rule.day);
  }
  return make(y + k, m, d); // yearly
}

/**
 * First date of the pattern after `today`, stepping from the current due date (at least one step: the
 * result is also after the due date). Monthly considers the due month's own occurrence, so a task moved
 * off its day (e.g. to the 5th of a "15th" rule) and completed then moves to the 15th, as weekly does.
 */
export function nextDate(rule: RepeatRule, due: ISODate | null, today: ISODate): ISODate {
  if (rule.type === 'after') return addDays(today, rule.n);
  const start = due ?? today;
  if (rule.type === 'monthly') {
    for (let k = 0; k < MAX_STEPS; k++) {
      const c = anchored(rule, start, k);
      if (c > today && (due === null || c > due)) return c;
    }
    throw new Error('nextDate: no date found');
  }
  if (rule.type === 'yearly') {
    for (let k = due ? 1 : 0; k < MAX_STEPS; k++) {
      const c = anchored(rule, start, k);
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

/** Keep `date` if it fits the rule, else the first fitting date on or after it (or today). */
export function fitDate(rule: RepeatRule, date: ISODate | null, today: ISODate): ISODate {
  let d = date ?? today;
  for (let i = 0; i < 1000; i++) {
    if (matchesRule(rule, d)) return d;
    d = addDays(d, 1);
  }
  throw new Error('fitDate: no fitting date found');
}
