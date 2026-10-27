import { describe, expect, it } from 'vitest';
import {
  addDays, dayOfWeek, DEFAULT_CONFIG, formedEstimate, habitCompletions, habitProgress, habitRules, parseDone, periodOf,
  walkHabit, type HabitConfig, type HabitRules, type RepeatRule, type Task,
} from '../src/index.ts';

const daily: RepeatRule = { type: 'daily' };
const RULES: HabitRules = { goal: 66, missesInARow: 1, missesPerAttempt: 6 };
const oct = (...days: number[]) => days.map((d) => `2026-10-${String(d).padStart(2, '0')}`);
const progress = (dates: string[], today: string, rule: RepeatRule = daily, rules: HabitRules = RULES) =>
  walkHabit(dates, rule, today, rules);
const marks = (p: ReturnType<typeof walkHabit>) => p.marks.map((m) => m.mark);

const CONFIG: HabitConfig = { maxInProgress: 3, goal: 66, missesInARow: 1, missesPerAttempt: { percent: 10 } };
const habit = (title: string, goal: number | null = null, repeat: RepeatRule = daily): Task => ({
  id: 't1', title, notes: [], date: null, repeat, habit: { goal }, raw: null, rawKey: null,
});
const done = (...lines: string[]) => parseDone(lines.join('\n') + '\n');
const tick = (title: string, d: string) => `- [x] ${title} 🌱 🔁 every day ✅ ${d}`;

describe('the walk, spec 5.3 (daily, goal 66, 1 in a row, 6 per attempt)', () => {
  it('1, 2, 3 Oct / 3 Oct → 3', () => {
    expect(progress(oct(1, 2, 3), '2026-10-03').count).toBe(3);
  });

  it('1, 2, 4 Oct / 4 Oct → 3, misses 1, in a row 0', () => {
    const p = progress(oct(1, 2, 4), '2026-10-04');
    expect(p).toMatchObject({ count: 3, missesThisAttempt: 1, missesInARow: 0 });
  });

  it('1, 2 Oct / 4 Oct → 2, last chance', () => {
    const p = progress(oct(1, 2), '2026-10-04');
    expect(p).toMatchObject({ count: 2, missesInARow: 1, lastChance: true, doneThisPeriod: false });
  });

  it('1, 2 Oct / 5 Oct → restarted: 0, best 2, attempt 2', () => {
    const p = progress(oct(1, 2), '2026-10-05');
    expect(p).toMatchObject({ count: 0, best: 2, bestAttempt: 1, attempt: 2, restarted: true, since: null, lastChance: false });
  });

  it('1, 2, 5 Oct / 5 Oct → 1, attempt 2, since 5 Oct', () => {
    const p = progress(oct(1, 2, 5), '2026-10-05');
    expect(p).toMatchObject({ count: 1, attempt: 2, since: '2026-10-05', restarted: false, best: 2 });
  });

  it('1 Oct twice / 1 Oct → 1, done this period', () => {
    const p = progress(oct(1, 1), '2026-10-01');
    expect(p).toMatchObject({ count: 1, doneThisPeriod: true, since: '2026-10-01' });
  });

  it('ignores completions after today', () => {
    expect(progress(oct(1, 2, 3), '2026-10-02').count).toBe(2);
  });
});

describe('periods', () => {
  const mwf: RepeatRule = { type: 'weekly', days: [0, 2, 4] };

  it('weekly Mon/Wed/Fri: done Mon and Thu → 2', () => {
    expect([dayOfWeek('2026-10-05'), dayOfWeek('2026-10-08'), dayOfWeek('2026-10-09')]).toEqual([0, 3, 4]);
    expect(progress(['2026-10-05', '2026-10-08'], '2026-10-08', mwf).count).toBe(2);
  });

  it('weekly Mon/Wed/Fri: done Mon only, today Fri → 1, missed Wednesday', () => {
    const p = progress(['2026-10-05'], '2026-10-09', mwf);
    expect(p).toMatchObject({ count: 1, missesThisAttempt: 1 });
    expect(p.period).toEqual({ start: '2026-10-09', end: '2026-10-11' });
  });

  it('every week on Sunday runs Sunday to Saturday; a weekdays Friday runs to Sunday', () => {
    expect(periodOf({ type: 'weekly', days: [6] }, '2026-10-01', '2026-10-07')).toEqual({ start: '2026-10-04', end: '2026-10-10' });
    expect(periodOf({ type: 'weekdays' }, '2026-10-01', '2026-10-10')).toEqual({ start: '2026-10-09', end: '2026-10-11' });
  });

  it('monthly on the 15th: done 15 Sep and 20 Oct, today 10 Nov → 2', () => {
    const p = progress(['2026-09-15', '2026-10-20'], '2026-11-10', { type: 'monthly', day: 15 });
    expect(p).toMatchObject({ count: 2, doneThisPeriod: true });
    expect(p.period).toEqual({ start: '2026-10-15', end: '2026-11-14' });
  });

  it('every 3 days strides from the first completion', () => {
    const every3: RepeatRule = { type: 'every', n: 3, unit: 'days' };
    expect(progress(oct(1, 4, 7), '2026-10-07', every3).count).toBe(3);
    const p = progress(oct(1, 7), '2026-10-07', every3);
    expect(p).toMatchObject({ count: 2, missesThisAttempt: 1 });
    expect(marks(p)).toEqual(['done', 'missed', 'done']);
  });

  it('stride periods run both ways from the anchor', () => {
    expect(periodOf({ type: 'every', n: 3, unit: 'days' }, '2026-10-10', '2026-10-08')).toEqual({ start: '2026-10-07', end: '2026-10-09' });
    expect(periodOf({ type: 'every', n: 2, unit: 'weeks' }, '2026-10-01', '2026-10-20')).toEqual({ start: '2026-10-15', end: '2026-10-28' });
    expect(periodOf({ type: 'every', n: 1, unit: 'months' }, '2026-01-31', '2026-03-05')).toEqual({ start: '2026-02-28', end: '2026-03-30' });
    expect(periodOf({ type: 'yearly' }, '2026-10-01', '2026-09-30')).toEqual({ start: '2025-10-01', end: '2026-09-30' });
  });

  it('interval weekly and monthly use the anchor week or month', () => {
    // Every 2 weeks on Monday and Friday, anchored on Thu 1 Oct: Mon 28 Sep, Fri 2 Oct, Mon 12 Oct, Fri 16 Oct …
    const fortnight: RepeatRule = { type: 'weekly', days: [0, 4], n: 2 };
    expect(periodOf(fortnight, '2026-10-01', '2026-10-01')).toEqual({ start: '2026-09-28', end: '2026-10-01' });
    expect(periodOf(fortnight, '2026-10-01', '2026-10-08')).toEqual({ start: '2026-10-02', end: '2026-10-11' });
    expect(periodOf(fortnight, '2026-10-01', '2026-09-25')).toEqual({ start: '2026-09-18', end: '2026-09-27' });
    // Days out of order (a rule built by hand) give the same periods.
    const unsorted: RepeatRule = { type: 'weekly', days: [4, 0], n: 2 };
    for (const d of ['2026-10-01', '2026-10-08', '2026-09-25', '2026-10-13']) {
      expect(periodOf(unsorted, '2026-10-01', d)).toEqual(periodOf(fortnight, '2026-10-01', d));
    }
    const quarterly: RepeatRule = { type: 'monthly', day: 10, n: 3 };
    expect(periodOf(quarterly, '2026-10-20', '2026-12-01')).toEqual({ start: '2026-10-10', end: '2027-01-09' });
    expect(periodOf(quarterly, '2026-10-20', '2026-10-05')).toEqual({ start: '2026-07-10', end: '2026-10-09' });
  });
});

describe('restarts and best', () => {
  it('restarts at the third miss with 2 misses per attempt', () => {
    const p = progress(oct(1, 3, 5), '2026-10-07', daily, { goal: 66, missesInARow: 1, missesPerAttempt: 2 });
    expect(marks(p)).toEqual(['done', 'missed', 'done', 'missed', 'done', 'restart', 'today']);
    expect(p).toMatchObject({ count: 0, best: 3, attempt: 2, restarted: true });
  });

  it('missesInARow 0: the first miss restarts', () => {
    const rules = { goal: 66, missesInARow: 0, missesPerAttempt: 6 };
    expect(progress(oct(1), '2026-10-02', daily, rules).lastChance).toBe(true);
    expect(progress(oct(1), '2026-10-03', daily, rules)).toMatchObject({ count: 0, attempt: 2, restarted: true });
  });

  it('keeps the best count and its attempt across two restarts', () => {
    const p = progress(oct(1, 2, 5, 6, 7, 10), '2026-10-10');
    expect(p).toMatchObject({ count: 1, best: 3, bestAttempt: 2, attempt: 3, since: '2026-10-10' });
    expect(marks(p)).toEqual(['done', 'done', 'missed', 'restart', 'done', 'done', 'done', 'missed', 'restart', 'done']);
    const q = progress(oct(1, 2, 3, 6, 9), '2026-10-09');
    expect(q).toMatchObject({ count: 1, best: 3, bestAttempt: 1, attempt: 3 });
  });

  it('waits after a restart: periods until the next completion are idle', () => {
    const p = progress(oct(1, 7), '2026-10-08');
    expect(marks(p)).toEqual(['done', 'missed', 'restart', 'idle', 'idle', 'idle', 'done', 'today']);
    expect(p).toMatchObject({ count: 1, attempt: 2, missesThisAttempt: 0, since: '2026-10-07', lastChance: false });
  });
});

describe('formed', () => {
  it('goal 3, done 1, 2, 3 Oct → formed on 3 Oct', () => {
    const p = progress(oct(1, 2, 3), '2026-10-03', daily, { goal: 3, missesInARow: 1, missesPerAttempt: 6 });
    expect(p).toMatchObject({ count: 3, formedOn: '2026-10-03', lastChance: false });
    expect(formedEstimate(p, daily, '2026-10-03')).toBeNull();
  });

  it('the walk stops at the goal', () => {
    const p = progress(oct(1, 2, 3, 4), '2026-10-06', daily, { goal: 3, missesInARow: 1, missesPerAttempt: 6 });
    expect(p).toMatchObject({ count: 3, formedOn: '2026-10-03', missesThisAttempt: 0 });
    expect(marks(p)).toEqual(['done', 'done', 'done']);
  });
});

describe('habitCompletions and habitProgress', () => {
  it('counts only completions after the last 🏆 or ❌ line with the same title', () => {
    const d = done(
      tick('Meditate', '2026-09-01'),
      '- [x] Meditate 🌱 🏆 2026-09-02',
      tick('Meditate', '2026-09-20'),
      '- [-] Meditate 🌱 ❌ 2026-09-21',
      tick('Meditate', '2026-10-02'),
      tick('Meditate', '2026-10-01'),
      '- [-] Read 🌱 ❌ 2026-10-01',
      tick('Read', '2026-10-02'),
      '- [x] Meditate 🔁 every day ✅ 2026-10-03',
    );
    expect(habitCompletions('Meditate', d)).toEqual(oct(1, 2));
    expect(habitCompletions('Meditate', d, 3)).toEqual(['2026-09-20']);
    expect(habitProgress(habit('Meditate'), d, '2026-10-02', CONFIG)).toMatchObject({ count: 2, since: '2026-10-01' });
  });

  it('a habit goal beats the config; a percentage is of the goal, rounded down', () => {
    expect(habitRules({ goal: null }, CONFIG)).toEqual({ goal: 66, missesInARow: 1, missesPerAttempt: 6 });
    expect(habitRules({ goal: 30 }, CONFIG)).toEqual({ goal: 30, missesInARow: 1, missesPerAttempt: 3 });
    expect(habitRules({ goal: 30 }, { ...CONFIG, missesPerAttempt: 4 })).toEqual({ goal: 30, missesInARow: 1, missesPerAttempt: 4 });
    expect(habitProgress(habit('Meditate', 30), done(), '2026-10-02', DEFAULT_CONFIG.habits).rules.goal).toBe(30);
  });

  it('a new habit: count 0, attempt 1, no last chance, the period holds today', () => {
    const p = habitProgress(habit('Gym', null, { type: 'weekly', days: [0] }), done(), '2026-10-07', CONFIG);
    expect(p).toMatchObject({
      count: 0, best: 0, bestAttempt: null, attempt: 1, since: null, restarted: false, lastChance: false, doneThisPeriod: false,
      period: { start: '2026-10-05', end: '2026-10-11' },
    });
    expect(marks(p)).toEqual(['today']);
  });
});

describe('marks and the estimate', () => {
  it('1, 2 Oct / 5 Oct → done, done, missed, restart, today', () => {
    const p = progress(oct(1, 2), '2026-10-05');
    expect(marks(p)).toEqual(['done', 'done', 'missed', 'restart', 'today']);
    expect(p.marks[0]!.period).toEqual({ start: '2026-10-01', end: '2026-10-01' });
  });

  it('keeps the last 28 periods', () => {
    const dates = Array.from({ length: 40 }, (_, i) => addDays('2026-10-01', i));
    const p = progress(dates, dates[39]!);
    expect(p.marks).toHaveLength(28);
    expect(p.marks[0]!.period.start).toBe(dates[12]);
    expect(p.marks[27]).toEqual({ period: { start: dates[39], end: dates[39] }, mark: 'done' });
  });

  it('daily, 12 of 66, done today → today + 54 days; not done today → today + 53', () => {
    const dates = Array.from({ length: 12 }, (_, i) => addDays('2026-10-01', i));
    const today = dates[11]!;
    const p = progress(dates, today);
    expect(p.count).toBe(12);
    expect(formedEstimate(p, daily, today)).toBe(addDays(today, 54));
    const q = progress(dates, addDays(today, 1));
    expect(formedEstimate(q, daily, addDays(today, 1))).toBe(addDays(today, 54));
  });

  it('a weekly estimate is clamped to today', () => {
    const p = progress(['2026-10-05'], '2026-10-07', { type: 'weekly', days: [0] }, { goal: 2, missesInARow: 1, missesPerAttempt: 6 });
    expect(p.doneThisPeriod).toBe(true);
    expect(formedEstimate(p, { type: 'weekly', days: [0] }, '2026-10-07')).toBe('2026-10-12');
    const q = progress(['2026-09-28'], '2026-10-07', { type: 'weekly', days: [0] }, { goal: 2, missesInARow: 1, missesPerAttempt: 6 });
    expect(formedEstimate(q, { type: 'weekly', days: [0] }, '2026-10-07')).toBe('2026-10-07');
  });
});
