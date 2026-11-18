import type { DoneDoc, HabitMark, ISODate, RepeatRule, Task } from './model.ts';
import type { HabitConfig } from './config.ts';
import { addDays, dayOfWeek, daysBetween } from './dates.ts';
import { addMonths, matchesRule, monthsBetween, timesPeriod, timesStatus, type TimesStatus } from './recurrence.ts';
import { isUsableHabitRule } from './tasks-file.ts';

/** A habit's limits, with the goal and the misses per attempt worked out (habits spec 2). */
export interface HabitRules {
  goal: number;
  missesInARow: number;
  missesPerAttempt: number;
}

/** The habit's own goal or the configured one; a percentage of misses is of that goal, rounded down. */
export function habitRules(habit: HabitMark, config: HabitConfig): HabitRules {
  const goal = habit.goal ?? config.goal;
  const m = config.missesPerAttempt;
  return { goal, missesInARow: config.missesInARow, missesPerAttempt: typeof m === 'number' ? m : Math.floor((goal * m.percent) / 100) };
}

/** From one rule date to the day before the next (spec 5.1). */
export interface Period {
  start: ISODate;
  end: ISODate;
}

/** The rule dates of a stride rule in the cycles around `d` (the one holding it, one before, one after), sorted. */
function strideDates(rule: RepeatRule, anchor: ISODate, d: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const around = (k: number, at: (j: number) => void) => {
    for (let j = k - 1; j <= k + 1; j++) at(j);
  };
  if (rule.type === 'every' && rule.unit !== 'months') {
    const s = rule.n * (rule.unit === 'weeks' ? 7 : 1);
    around(Math.floor(daysBetween(anchor, d) / s), (j) => out.push(addDays(anchor, j * s)));
  } else if (rule.type === 'weekly') {
    const n = rule.n ?? 1;
    const monday = addDays(anchor, -dayOfWeek(anchor));
    const week = Math.floor(daysBetween(monday, d) / 7);
    // Sorted here too: a rule built by hand may list its days out of order.
    const days = [...rule.days].sort((a, b) => a - b);
    around(Math.floor(week / n), (j) => days.forEach((day) => out.push(addDays(monday, j * n * 7 + day))));
  } else {
    // Calendar months: `every n months`, `yearly`, or the rule day every n-th month.
    const n = rule.type === 'every' ? rule.n : rule.type === 'yearly' ? 12 : rule.type === 'monthly' ? (rule.n ?? 1) : 1;
    const day = rule.type === 'monthly' ? rule.day : Number(anchor.slice(8, 10));
    around(Math.floor(monthsBetween(anchor, d) / n), (j) => out.push(addMonths(anchor, j * n, day)));
  }
  return out;
}

const isStride = (rule: RepeatRule) =>
  rule.type === 'every' || rule.type === 'yearly' || ((rule.type === 'weekly' || rule.type === 'monthly') && rule.n !== undefined);

/**
 * The period holding `d`. Pattern rules (daily, weekdays, plain weekly and monthly) start it at the latest
 * date on or before `d` that fits the rule. Stride rules count their dates from `anchor` both ways: `anchor`
 * plus k strides, `anchor` moved k·n months, or the listed weekdays or rule day in the weeks or months k·n
 * from the anchor's. A `when done` rule has no periods and is read as daily.
 */
export function periodOf(rule: RepeatRule, anchor: ISODate, d: ISODate): Period {
  if (rule.type === 'after') return { start: d, end: d };
  if (rule.type === 'times') return timesPeriod(rule.per, d);
  if (isStride(rule)) {
    const dates = strideDates(rule, anchor, d);
    const start = dates.filter((c) => c <= d).at(-1)!;
    return { start, end: addDays(dates.find((c) => c > start)!, -1) };
  }
  let start = d;
  while (!matchesRule(rule, start)) start = addDays(start, -1);
  let next = addDays(start, 1);
  while (!matchesRule(rule, next)) next = addDays(next, 1);
  return { start, end: addDays(next, -1) };
}

/** `idle`: an empty period while waiting for the first completion after a restart. */
export type PeriodMark = 'done' | 'missed' | 'restart' | 'idle' | 'today';

export interface HabitProgress {
  rules: HabitRules;
  count: number;
  /** The best count of an earlier attempt, and which attempt (null while best is 0). */
  best: number;
  bestAttempt: number | null;
  attempt: number;
  missesInARow: number;
  missesThisAttempt: number;
  /** The first completion of this attempt; null with no completions or while waiting after a restart. */
  since: ISODate | null;
  /** The period holding today. */
  period: Period;
  doneThisPeriod: boolean;
  /** A restart happened and there has been no completion since. */
  restarted: boolean;
  /** Today's period is open and missing it would restart the count. */
  lastChance: boolean;
  /** The first completion of the period that reached the goal. */
  formedOn: ISODate | null;
  /** The last 28 periods walked, oldest first. */
  marks: { period: Period; mark: PeriodMark }[];
  /** For a `times` rule (#163): where today's period stands. */
  times?: TimesStatus;
}

const MARKS_KEPT = 28;

/**
 * Walks the periods from the one holding the first completion up to today (spec 5.2). Strides are counted
 * from the first completion (today with none). Completions after today are left out.
 */
export function walkHabit(completions: ISODate[], rule: RepeatRule, today: ISODate, rules: HabitRules): HabitProgress {
  if (rule.type === 'times') return walkTimes(completions, rule, today, rules);
  const dates = completions.filter((d) => d <= today).sort();
  const anchor = dates[0] ?? today;
  const period = periodOf(rule, anchor, today);
  const p: HabitProgress = {
    rules, count: 0, best: 0, bestAttempt: null, attempt: 1, missesInARow: 0, missesThisAttempt: 0, since: null, period,
    doneThisPeriod: dates.some((d) => d >= period.start && d <= period.end), restarted: false, lastChance: false,
    formedOn: null, marks: [],
  };
  if (dates.length === 0) {
    p.marks.push({ period, mark: 'today' });
    return p;
  }
  let at = 0;
  for (let cur = periodOf(rule, anchor, anchor); ; cur = periodOf(rule, anchor, addDays(cur.end, 1))) {
    const first = at < dates.length && dates[at]! <= cur.end ? dates[at]! : null;
    while (at < dates.length && dates[at]! <= cur.end) at++;
    const isToday = cur.end >= today;
    let mark: PeriodMark;
    if (first !== null) {
      p.restarted = false;
      p.since ??= first;
      p.count++;
      p.missesInARow = 0;
      mark = 'done';
    } else if (isToday) {
      mark = 'today';
    } else if (p.restarted) {
      mark = 'idle';
    } else {
      p.missesInARow++;
      p.missesThisAttempt++;
      mark = 'missed';
      if (p.missesInARow > rules.missesInARow || p.missesThisAttempt > rules.missesPerAttempt) {
        if (p.count > p.best) [p.best, p.bestAttempt] = [p.count, p.attempt];
        Object.assign(p, { count: 0, missesInARow: 0, missesThisAttempt: 0, since: null, restarted: true });
        p.attempt++;
        mark = 'restart';
      }
    }
    p.marks.push({ period: cur, mark });
    if (first !== null && p.count >= rules.goal) {
      p.formedOn = first;
      break;
    }
    if (isToday) break;
  }
  p.marks = p.marks.slice(-MARKS_KEPT);
  p.lastChance = p.formedOn === null && !p.doneThisPeriod && p.since !== null
    && (p.missesInARow + 1 > rules.missesInARow || p.missesThisAttempt + 1 > rules.missesPerAttempt);
  return p;
}

/**
 * The walk for a `times` rule (#163). Each calendar period adds its different days with a completion, at
 * most N, so the count can reach the goal mid-period. A period that ends short of N is one miss, its
 * completions still counted. The period an attempt starts in only needs the days left in it from its first
 * completion (at most N), so starting on a Saturday is no miss. A period is done once that is met; its last
 * chance is when skipping today would fall short (as many days left as times). A habit with no attempt
 * under way (new, or waiting after a restart) has no last chance.
 */
function walkTimes(completions: ISODate[], rule: Extract<RepeatRule, { type: 'times' }>, today: ISODate, rules: HabitRules): HabitProgress {
  const days = [...new Set(completions.filter((d) => d <= today))].sort();
  const now = timesStatus(rule, days, today);
  const p: HabitProgress = {
    rules, count: 0, best: 0, bestAttempt: null, attempt: 1, missesInARow: 0, missesThisAttempt: 0, since: null,
    period: now.period, doneThisPeriod: now.met, restarted: false, lastChance: false, formedOn: null, marks: [], times: now,
  };
  let at = 0;
  for (let cur = timesPeriod(rule.per, days[0] ?? today); ; cur = timesPeriod(rule.per, addDays(cur.end, 1))) {
    const inPeriod: ISODate[] = [];
    while (at < days.length && days[at]! <= cur.end) inPeriod.push(days[at++]!);
    const counted = inPeriod.slice(0, rule.n);
    const isToday = cur.end >= today;
    const sinceBefore = p.since;
    for (const d of counted) {
      p.restarted = false;
      p.since ??= d;
      p.count++;
      if (p.count >= rules.goal) {
        p.formedOn = d;
        break;
      }
    }
    // An attempt that started in this period needs only the days it had left.
    const startedHere = sinceBefore === null && p.since !== null;
    const need = startedHere ? Math.min(rule.n, daysBetween(p.since!, cur.end) + 1) : rule.n;
    if (isToday) {
      const doneToday = inPeriod.includes(today);
      const left = Math.max(0, need - counted.length);
      p.doneThisPeriod = left === 0;
      p.lastChance = p.since !== null && !doneToday && left > 0 && daysBetween(today, cur.end) + 1 === left;
    }
    let mark: PeriodMark;
    if (counted.length >= need) {
      p.missesInARow = 0;
      mark = 'done';
    } else if (isToday && p.formedOn === null) {
      mark = 'today';
    } else if (p.formedOn !== null) {
      mark = 'done';
    } else if (counted.length === 0 && p.restarted) {
      mark = 'idle';
    } else {
      p.missesInARow++;
      p.missesThisAttempt++;
      mark = 'missed';
      if (p.missesInARow > rules.missesInARow || p.missesThisAttempt > rules.missesPerAttempt) {
        if (p.count > p.best) [p.best, p.bestAttempt] = [p.count, p.attempt];
        Object.assign(p, { count: 0, missesInARow: 0, missesThisAttempt: 0, since: null, restarted: true });
        p.attempt++;
        mark = 'restart';
      }
    }
    p.marks.push({ period: cur, mark });
    if (p.formedOn !== null || isToday) break;
  }
  p.marks = p.marks.slice(-MARKS_KEPT);
  if (p.formedOn !== null) p.lastChance = false;
  return p;
}

/**
 * The ✅ dates of the 🌱 completions titled exactly `title` among `done.lines[0..beforeLine)`, after the last
 * 🏆 or ❌ line with that title (spec 4.2), sorted. Two completions on one day are both kept.
 */
export function habitCompletions(title: string, done: DoneDoc, beforeLine = done.lines.length): ISODate[] {
  let from = 0;
  for (let i = 0; i < beforeLine; i++) if (done.lines[i]!.end?.title === title) from = i + 1;
  const out: ISODate[] = [];
  for (let i = from; i < beforeLine; i++) {
    const e = done.lines[i]!.entry;
    if (e?.habit && e.title === title && e.doneOn !== null) out.push(e.doneOn);
  }
  return out.sort();
}

/** The progress of a habit task from `done.md`. */
export function habitProgress(task: Task, done: DoneDoc, today: ISODate, config: HabitConfig): HabitProgress {
  const rule: RepeatRule = task.repeat && isUsableHabitRule(task.repeat) ? task.repeat : { type: 'daily' };
  return walkHabit(habitCompletions(task.title, done), rule, today, habitRules(task.habit ?? { goal: null }, config));
}

/**
 * The start of the period that would reach the goal with no misses, not before today; null once formed.
 * The periods after today's are counted from its start, so a month stride from a clamped day (a 31st
 * moved to the 30th) can land a day or two off; it is an estimate.
 */
export function formedEstimate(p: HabitProgress, rule: RepeatRule, today: ISODate): ISODate | null {
  if (p.formedOn !== null) return null;
  if (rule.type === 'times') return timesEstimate(p, rule, today);
  const anchor = p.period.start;
  let cur = p.doneThisPeriod ? periodOf(rule, anchor, addDays(p.period.end, 1)) : p.period;
  for (let left = p.rules.goal - p.count; left > 1; left--) cur = periodOf(rule, anchor, addDays(cur.end, 1));
  return cur.start < today ? today : cur.start;
}

/**
 * For a `times` rule: the day the goal would be reached doing it every day from today (tomorrow when done
 * today) until each period's N is met, then from the next period's first day.
 */
function timesEstimate(p: HabitProgress, rule: Extract<RepeatRule, { type: 'times' }>, today: ISODate): ISODate {
  const now = p.times ?? timesStatus(rule, [], today);
  let left = p.rules.goal - p.count;
  let period = now.period;
  let inPeriod = now.left;
  let d = now.doneToday ? addDays(today, 1) : today;
  for (;;) {
    if (d > period.end) {
      period = timesPeriod(rule.per, d);
      inPeriod = rule.n;
    }
    if (inPeriod === 0) {
      d = addDays(period.end, 1);
      continue;
    }
    if (--left <= 0) return d;
    inPeriod--;
    d = addDays(d, 1);
  }
}
