import type { RepeatRule } from './model.ts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Unit = Extract<RepeatRule, { type: 'every' }>['unit'];

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * The largest N a rule may have, for every unit (999 days, weeks or months; 999 months is 83 years). A
 * larger N is not a rule: it stays in the title as text, like any other 🔁 text the app can't read.
 */
export const MAX_INTERVAL = 999;

function parseCount(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_INTERVAL ? n : null;
}

/** `{ n }` for an interval above 1, else nothing: N = 1 is the plain rule. */
const interval = (n: number): { n?: number } => (n > 1 ? { n } : {});

/** Parses file wording (e.g. `every week on Monday, Thursday`). Returns null when it is not a valid rule. */
export function parseRepeat(text: string): RepeatRule | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');

  if (s === 'every day') return { type: 'daily' };
  if (s === 'every weekday') return { type: 'weekdays' };
  if (s === 'every year') return { type: 'yearly' };

  // `every week on …` or `every N weeks on …`.
  const weekly = /^every (?:week|(\d+) weeks?) on (.+)$/.exec(s);
  if (weekly) {
    const n = weekly[1] === undefined ? 1 : parseCount(weekly[1]);
    if (n === null) return null;
    const days = weekly[2]!.split(/\s*,\s*/).map((name) =>
      DAY_NAMES.findIndex((d) => d.toLowerCase() === name),
    );
    if (days.some((i) => i < 0)) return null;
    return { type: 'weekly', days: [...new Set(days)].sort((a, b) => a - b), ...interval(n) };
  }

  // `every month on the 15th` or `every N months on the 15th`.
  const monthly = /^every (?:month|(\d+) months?) on the (\d+)(st|nd|rd|th)$/.exec(s);
  if (monthly) {
    const n = monthly[1] === undefined ? 1 : parseCount(monthly[1]);
    const day = Number(monthly[2]);
    if (n === null || day < 1 || day > 31 || ordinal(day) !== `${day}${monthly[3]}`) return null;
    return { type: 'monthly', day, ...interval(n) };
  }

  const after = /^every (\d+) days? when done$/.exec(s);
  if (after) {
    const n = parseCount(after[1]!);
    return n === null ? null : { type: 'after', n };
  }

  const every = /^every (\d+) (day|week|month)s?$/.exec(s);
  if (every) {
    const n = parseCount(every[1]!);
    if (n === null) return null;
    return { type: 'every', n, unit: `${every[2]}s` as Unit };
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
      return `${period('week', rule.n)} on ${rule.days.map((i) => DAY_NAMES[i]).join(', ')}`;
    case 'monthly':
      return `${period('month', rule.n)} on the ${ordinal(rule.day)}`;
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
    case 'weekly': {
      const days = rule.days.map((i) => DAY_NAMES[i]!.slice(0, 3)).join(', ');
      return (rule.n ?? 1) > 1 ? `every ${rule.n} weeks on ${days}` : `every ${days}`;
    }
    case 'monthly':
      return `${period('month', rule.n)} on the ${ordinal(rule.day)}`;
    case 'yearly':
      return 'every year';
    case 'every':
      return `every ${rule.n} ${unitName(rule.unit, rule.n)}`;
    case 'after':
      return `${rule.n} ${rule.n === 1 ? 'day' : 'days'} after done`;
  }
}

/** `every week` / `every month` for N = 1 (or no N), else `every N weeks` / `every N months`. */
function period(base: 'week' | 'month', n: number | undefined): string {
  return n !== undefined && n > 1 ? `every ${n} ${base}s` : `every ${base}`;
}

function unitName(unit: Unit, n: number): string {
  const base = unit.slice(0, -1);
  return n === 1 ? base : unit;
}
