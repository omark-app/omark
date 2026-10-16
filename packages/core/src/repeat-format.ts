import type { RepeatRule } from './model.ts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function parseCount(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** Parses file wording (e.g. `every week on Monday, Thursday`). Returns null when it is not a valid rule. */
export function parseRepeat(text: string): RepeatRule | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');

  if (s === 'every day') return { type: 'daily' };
  if (s === 'every weekday') return { type: 'weekdays' };
  if (s === 'every year') return { type: 'yearly' };

  const weekly = /^every week on (.+)$/.exec(s);
  if (weekly) {
    const days = weekly[1]!.split(/\s*,\s*/).map((name) =>
      DAY_NAMES.findIndex((d) => d.toLowerCase() === name),
    );
    if (days.some((i) => i < 0)) return null;
    return { type: 'weekly', days: [...new Set(days)].sort((a, b) => a - b) };
  }

  const monthly = /^every month on the (\d+)(st|nd|rd|th)$/.exec(s);
  if (monthly) {
    const day = Number(monthly[1]);
    if (day < 1 || day > 31 || ordinal(day) !== `${day}${monthly[2]}`) return null;
    return { type: 'monthly', day };
  }

  const after = /^every (\d+) days? when done$/.exec(s);
  if (after) {
    const n = parseCount(after[1]!);
    return n === null ? null : { type: 'after', n };
  }

  const every = /^every (\d+) (days?|weeks?)$/.exec(s);
  if (every) {
    const n = parseCount(every[1]!);
    if (n === null) return null;
    return { type: 'every', n, unit: every[2]!.startsWith('day') ? 'days' : 'weeks' };
  }

  return null;
}

/** File wording for a rule; the inverse of `parseRepeat`. */
export function formatRepeat(rule: RepeatRule): string {
  switch (rule.type) {
    case 'daily':
      return 'every day';
    case 'weekdays':
      return 'every weekday';
    case 'weekly':
      return `every week on ${rule.days.map((i) => DAY_NAMES[i]).join(', ')}`;
    case 'monthly':
      return `every month on the ${ordinal(rule.day)}`;
    case 'yearly':
      return 'every year';
    case 'every':
      return `every ${rule.n} ${unitName(rule.unit, rule.n)}`;
    case 'after':
      return `every ${rule.n} ${rule.n === 1 ? 'day' : 'days'} when done`;
  }
}

/** Short UI wording for a rule. */
export function describeRepeat(rule: RepeatRule): string {
  switch (rule.type) {
    case 'daily':
      return 'every day';
    case 'weekdays':
      return 'weekdays';
    case 'weekly':
      return `every ${rule.days.map((i) => DAY_NAMES[i]!.slice(0, 3)).join(', ')}`;
    case 'monthly':
      return `every month on the ${ordinal(rule.day)}`;
    case 'yearly':
      return 'every year';
    case 'every':
      return `every ${rule.n} ${unitName(rule.unit, rule.n)}`;
    case 'after':
      return `${rule.n} ${rule.n === 1 ? 'day' : 'days'} after done`;
  }
}

function unitName(unit: 'days' | 'weeks', n: number): string {
  const base = unit === 'days' ? 'day' : 'week';
  return n === 1 ? base : `${base}s`;
}
