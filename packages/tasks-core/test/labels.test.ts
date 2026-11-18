import { expect, test } from 'vitest';
import type { HabitProgress, RepeatRule, Task } from '../src/index.ts';
import { dayMonth, dueText, habitLabel, isOverdue, metaLabel, timesStatus, weekdayShort } from '../src/index.ts';

const fri = { today: '2026-10-16', weekStart: 0 };
const mk = (date: string | null, repeat: RepeatRule | null = null): Task => ({ id: 'a', title: 'a', notes: [], date, repeat, raw: null, rawKey: null });

test('weekdayShort and dayMonth', () => {
  expect(weekdayShort('2026-10-15')).toBe('Thu');
  expect(weekdayShort('2026-10-18')).toBe('Sun');
  expect(dayMonth('2026-11-12', fri)).toBe('12 Nov');
  expect(dayMonth('2027-11-12', fri)).toBe("12 Nov '27");
});

test('metaLabel', () => {
  expect(metaLabel(mk('2026-10-15'), fri, 'short')).toEqual({ text: 'Thu', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-10'), fri, 'short')).toEqual({ text: 'Sat', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-09'), fri, 'short')).toEqual({ text: '9 Oct', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-03'), fri, 'short')).toEqual({ text: '3 Oct', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-16'), fri, 'short')).toEqual({ text: null, overdue: false, repeat: false });
  expect(metaLabel(mk('2026-10-16', { type: 'weekly', days: [4] }), fri, 'short')).toEqual({ text: null, overdue: false, repeat: true });
  expect(metaLabel(mk('2026-10-22'), fri, 'short').text).toBe('Thu');
  expect(metaLabel(mk('2026-10-18'), fri, 'short').text).toBe('Sun');
  expect(metaLabel(mk('2026-11-12'), fri, 'short').text).toBe('12 Nov');
  expect(metaLabel(mk('2027-11-12'), fri, 'short').text).toBe("12 Nov '27");
  expect(metaLabel(mk(null), fri, 'short')).toEqual({ text: null, overdue: false, repeat: false });
  expect(metaLabel(mk('2026-11-12'), fri, 'iso').text).toBe('2026-11-12');
  expect(metaLabel(mk('2026-10-03'), fri, 'iso')).toEqual({ text: '2026-10-03', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-16'), fri, 'iso').text).toBeNull();
});

test('dueText', () => {
  expect(dueText(mk('2026-10-16'), fri)).toBe('Today · Fri 16 Oct');
  expect(dueText(mk('2026-10-14'), fri)).toBe('Wed 14 Oct · overdue');
  expect(dueText(mk(null), fri)).toBe('Someday · no date');
  expect(dueText(mk('2026-10-22'), fri)).toBe('Thu 22 Oct');
  expect(dueText(mk('2027-11-12'), fri)).toBe("Fri 12 Nov '27");
});

test('a habit is never overdue: its old date reads as today (habits spec 3, 6)', () => {
  const habit = (date: string): Task => ({ ...mk(date, { type: 'daily' }), habit: { goal: null } });
  expect(dueText(habit('2026-10-14'), fri)).toBe('Today · Fri 16 Oct');
  expect(dueText(habit('2026-10-20'), fri)).toBe('Tue 20 Oct');
  expect(metaLabel(habit('2026-10-14'), fri, 'short')).toEqual({ text: null, overdue: false, repeat: true });
  expect(metaLabel(habit('2026-10-14'), fri, 'iso')).toEqual({ text: null, overdue: false, repeat: true });
});

test('habitLabel', () => {
  const rules = { goal: 66, missesInARow: 1, missesPerAttempt: 6 };
  const prog = (over: Partial<HabitProgress>, end = '2026-10-16'): HabitProgress =>
    ({ rules, count: 4, best: 0, doneThisPeriod: false, restarted: false, lastChance: false, period: { start: end, end }, ...over }) as HabitProgress;
  const daily: RepeatRule = { type: 'daily' };
  const goal30 = (n: number) => prog({ count: n, rules: { ...rules, goal: 30 } });
  // On track in Today: just the count.
  expect(habitLabel(mk('2026-10-16', daily), goal30(4), fri, 'short')).toEqual({ count: '4/30', when: null, tag: null });
  expect(habitLabel(mk('2026-10-16', daily), prog({ lastChance: true }), fri, 'short').tag).toBe('last chance');
  expect(habitLabel(mk('2026-10-16', daily), prog({ restarted: true, best: 9, count: 0 }), fri, 'short')).toEqual({ count: '0/66', when: null, tag: 'restarted · best 9' });
  // A restart with no earlier best says nothing.
  expect(habitLabel(mk('2026-10-16', daily), prog({ restarted: true, best: 0 }), fri, 'short').tag).toBeNull();
  // Done today: the next date shows.
  expect(habitLabel(mk('2026-10-20', daily), prog({ count: 31, doneThisPeriod: true }), fri, 'short')).toEqual({ count: '31/66', when: 'Tue', tag: null });
  expect(habitLabel(mk('2026-11-12', daily), prog({ doneThisPeriod: true }), fri, 'short').when).toBe('12 Nov');
  // A weekly habit open all week.
  expect(habitLabel(mk('2026-10-18', { type: 'weekly', days: [6] }), prog({ count: 3, rules: { ...rules, goal: 15 } }, '2026-10-18'), fri, 'short'))
    .toEqual({ count: '3/15', when: 'by Sun', tag: null });
  // A missed period's old date never reads as overdue.
  expect(habitLabel(mk('2026-10-12', daily), prog({}), fri, 'short').when).toBeNull();
});

test('metaLabel of a times task: never overdue, the period progress when due (#163)', () => {
  const rule = { type: 'times', n: 3, per: 'week' } as const;
  const gym = (date: string): Task => ({ ...mk(date), repeat: rule });
  const st = timesStatus(rule, ['2026-10-12'], fri.today);
  expect(metaLabel(gym('2026-10-14'), fri, 'short', st)).toEqual({ text: '1/3 this week', overdue: false, repeat: true });
  expect(metaLabel(gym('2026-10-16'), fri, 'iso', st)).toEqual({ text: '1/3 this week', overdue: false, repeat: true });
  // Without the status an old date is still not overdue.
  expect(metaLabel(gym('2026-10-14'), fri, 'short')).toEqual({ text: null, overdue: false, repeat: true });
  // A later date reads as usual.
  expect(metaLabel(gym('2026-10-19'), fri, 'short', st)).toEqual({ text: 'Mon', overdue: false, repeat: true });
  expect(dueText(gym('2026-10-14'), fri)).toBe('Today · Fri 16 Oct');
  const month = { type: 'times', n: 2, per: 'month' } as const;
  expect(metaLabel({ ...mk('2026-10-16'), repeat: month }, fri, 'short', timesStatus(month, [], fri.today)).text).toBe('0/2 this month');
});

test('habitLabel of a times habit: the period progress while not met, then the next date (#163)', () => {
  const rule = { type: 'times', n: 3, per: 'week' } as const;
  const rules = { goal: 30, missesInARow: 1, missesPerAttempt: 3 };
  const at = (done: string[], date: string): [Task, HabitProgress] => {
    const times = timesStatus(rule, done, fri.today);
    return [{ ...mk(date, rule), habit: { goal: 30 } }, { rules, count: done.length, best: 0, doneThisPeriod: times.met, restarted: false, lastChance: times.lastChance, period: times.period, times } as HabitProgress];
  };
  expect(habitLabel(...at(['2026-10-12'], '2026-10-16'), fri, 'short')).toEqual({ count: '1/30', when: '1/3 this week', tag: null });
  expect(habitLabel(...at(['2026-10-12', '2026-10-16'], '2026-10-17'), fri, 'short').when).toBe('2/3 this week');
  expect(habitLabel(...at(['2026-10-12', '2026-10-13', '2026-10-14'], '2026-10-19'), fri, 'short').when).toBe('Mon');
});

test('isOverdue: an old date, but never for a habit or a times task (#163)', () => {
  expect(isOverdue(mk('2026-10-15'), fri)).toBe(true);
  expect(isOverdue(mk('2026-10-16'), fri)).toBe(false);
  expect(isOverdue(mk(null), fri)).toBe(false);
  expect(isOverdue({ ...mk('2026-10-15', { type: 'daily' }), habit: { goal: null } }, fri)).toBe(false);
  expect(isOverdue(mk('2026-10-15', { type: 'times', n: 3, per: 'week' }), fri)).toBe(false);
});
