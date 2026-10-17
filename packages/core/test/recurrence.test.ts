import { expect, test } from 'vitest';
import { fitDate, matchesRule, nextDate, type RepeatRule } from '../src/index.ts';

test('nextDate follows spec section 6', () => {
  expect(nextDate({ type: 'daily' }, '2026-10-13', '2026-10-16')).toBe('2026-10-17');
  expect(nextDate({ type: 'weekly', days: [0, 3] }, '2026-10-12', '2026-10-14')).toBe('2026-10-15');
  expect(nextDate({ type: 'weekdays' }, '2026-10-16', '2026-10-16')).toBe('2026-10-19');
  expect(nextDate({ type: 'monthly', day: 31 }, '2026-10-31', '2026-10-31')).toBe('2026-11-30');
  expect(nextDate({ type: 'monthly', day: 31 }, '2026-11-30', '2026-11-30')).toBe('2026-12-31');
  expect(nextDate({ type: 'yearly' }, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
  expect(nextDate({ type: 'every', n: 2, unit: 'weeks' }, '2026-10-02', '2026-10-16')).toBe('2026-10-30');
  expect(nextDate({ type: 'after', n: 3 }, '2026-10-01', '2026-10-16')).toBe('2026-10-19');
  expect(nextDate({ type: 'daily' }, '2026-10-20', '2026-10-16')).toBe('2026-10-21');
});

test('nextDate extra branches', () => {
  expect(nextDate({ type: 'every', n: 3, unit: 'days' }, '2026-10-10', '2026-10-16')).toBe('2026-10-19');
  expect(nextDate({ type: 'weekdays' }, '2026-10-17', '2026-10-17')).toBe('2026-10-19');
  expect(nextDate({ type: 'yearly' }, '2027-03-01', '2027-03-01')).toBe('2028-03-01');
  expect(nextDate({ type: 'yearly' }, '2029-02-28', '2029-02-28')).toBe('2030-02-28');
  expect(nextDate({ type: 'daily' }, null, '2026-10-16')).toBe('2026-10-17');
  expect(nextDate({ type: 'weekly', days: [0] }, null, '2026-10-16')).toBe('2026-10-19');
  expect(nextDate({ type: 'monthly', day: 5 }, null, '2026-10-16')).toBe('2026-11-05');
  expect(nextDate({ type: 'monthly', day: 20 }, null, '2026-10-16')).toBe('2026-10-20');
  expect(nextDate({ type: 'monthly', day: 15 }, '2025-01-15', '2026-10-16')).toBe('2026-11-15');
  expect(nextDate({ type: 'after', n: 3 }, null, '2026-10-16')).toBe('2026-10-19');
});

test('fitDate keeps or moves the date', () => {
  expect(fitDate({ type: 'weekly', days: [0] }, '2026-10-16', '2026-10-16')).toBe('2026-10-19');
  expect(fitDate({ type: 'weekly', days: [4] }, '2026-10-16', '2026-10-16')).toBe('2026-10-16');
  expect(fitDate({ type: 'weekly', days: [0] }, null, '2026-10-16')).toBe('2026-10-19');
  expect(fitDate({ type: 'after', n: 3 }, null, '2026-10-16')).toBe('2026-10-16');
  expect(fitDate({ type: 'monthly', day: 31 }, '2026-11-05', '2026-10-16')).toBe('2026-11-30');
  expect(fitDate({ type: 'weekly', days: [4] }, null, '2026-10-16')).toBe('2026-10-16');
  expect(fitDate({ type: 'every', n: 2, unit: 'weeks' }, '2026-10-17', '2026-10-16')).toBe('2026-10-17');
  expect(fitDate({ type: 'weekdays' }, '2026-10-17', '2026-10-16')).toBe('2026-10-19');
});

test('matchesRule', () => {
  expect(matchesRule({ type: 'daily' }, '2026-10-17')).toBe(true);
  expect(matchesRule({ type: 'weekdays' }, '2026-10-17')).toBe(false);
  expect(matchesRule({ type: 'monthly', day: 31 }, '2026-11-30')).toBe(true);
  expect(matchesRule({ type: 'monthly', day: 31 }, '2026-11-29')).toBe(false);
  expect(matchesRule({ type: 'yearly' }, '2026-11-29')).toBe(true);
});

test('monthly from an off-pattern due date takes that month\'s occurrence (I2)', () => {
  // Moved early (date picker, move chips, drag) and completed the same day.
  expect(nextDate({ type: 'monthly', day: 15 }, '2026-10-05', '2026-10-05')).toBe('2026-10-15');
  expect(nextDate({ type: 'monthly', day: 31 }, '2026-10-17', '2026-10-17')).toBe('2026-10-31');
  // On-pattern, completed early: still at least one step past the due date.
  expect(nextDate({ type: 'monthly', day: 15 }, '2026-10-15', '2026-10-12')).toBe('2026-11-15');
  // Off-pattern, completed after this month's occurrence passed.
  expect(nextDate({ type: 'monthly', day: 15 }, '2026-10-05', '2026-10-16')).toBe('2026-11-15');
  // Off-pattern after this month's occurrence: the next month's.
  expect(nextDate({ type: 'monthly', day: 15 }, '2026-10-20', '2026-10-20')).toBe('2026-11-15');
  // Weekly already behaves this way.
  expect(nextDate({ type: 'weekly', days: [0] }, '2026-10-14', '2026-10-14')).toBe('2026-10-19');
  // Yearly is unchanged: at least one year on.
  expect(nextDate({ type: 'yearly' }, '2026-10-05', '2026-10-05')).toBe('2027-10-05');
});

const fri2: RepeatRule = { type: 'weekly', days: [4], n: 2 };
const monThu2: RepeatRule = { type: 'weekly', days: [0, 3], n: 2 };

test("every N weeks on days counts Monday-to-Sunday weeks from the due date's week", () => {
  // The brief's example: due Fri 23 Oct, done that day.
  expect(nextDate(fri2, '2026-10-23', '2026-10-23')).toBe('2026-11-06');
  // Completed early: still after the due date.
  expect(nextDate(fri2, '2026-10-20', '2026-10-16')).toBe('2026-10-23');
  expect(nextDate(fri2, '2026-10-23', '2026-10-20')).toBe('2026-11-06');
  // Completed late, on an off-cycle Friday and on the next on-cycle Friday.
  expect(nextDate(fri2, '2026-10-23', '2026-10-30')).toBe('2026-11-06');
  expect(nextDate(fri2, '2026-10-23', '2026-11-06')).toBe('2026-11-20');
  // Several days: the rest of the due week first, then the week N on.
  expect(nextDate(monThu2, '2026-10-19', '2026-10-19')).toBe('2026-10-22');
  expect(nextDate(monThu2, '2026-10-22', '2026-10-22')).toBe('2026-11-02');
  // Off-pattern due (moved to a Wednesday): that week's Friday still counts, as weekly does.
  expect(nextDate(fri2, '2026-10-21', '2026-10-21')).toBe('2026-10-23');
  // Long overdue: 41 weeks from the week of 2 Jan to the week of 16 Oct is off-cycle.
  expect(nextDate(fri2, '2026-01-02', '2026-10-16')).toBe('2026-10-23');
  // A huge N is one jump, not a day-by-day walk.
  expect(nextDate({ type: 'weekly', days: [4], n: 100_000 }, '2026-10-23', '2026-10-23')).toBe(
    nextDate({ type: 'every', n: 100_000, unit: 'weeks' }, '2026-10-23', '2026-10-23'),
  );
});

test('every N weeks on days: weeks run Monday to Sunday at the multiple-of-N boundary', () => {
  const monSun2: RepeatRule = { type: 'weekly', days: [0, 6], n: 2 };
  // Sun 25 Oct ends week 0; Mon 26 Oct starts week 1 (off), so the next is Mon 2 Nov.
  expect(nextDate(monSun2, '2026-10-25', '2026-10-25')).toBe('2026-11-02');
  expect(nextDate(monSun2, '2026-10-19', '2026-10-19')).toBe('2026-10-25');
  // N = 3: weeks of 19 Oct, 9 Nov, 30 Nov.
  expect(nextDate({ type: 'weekly', days: [0], n: 3 }, '2026-10-19', '2026-10-19')).toBe('2026-11-09');
  expect(nextDate({ type: 'weekly', days: [0], n: 3 }, '2026-10-19', '2026-11-10')).toBe('2026-11-30');
});

test("every N weeks on days with no due date anchors on the completion date's week", () => {
  expect(nextDate(fri2, null, '2026-10-21')).toBe('2026-10-23');
  expect(nextDate(fri2, null, '2026-10-23')).toBe('2026-11-06');
  expect(nextDate(fri2, null, '2026-10-24')).toBe('2026-11-06');
});

test('every N months on the day uses months N apart from the due month (I2 kept)', () => {
  const q18 = { type: 'monthly', day: 18, n: 3 } as const;
  expect(nextDate(q18, '2026-10-18', '2026-10-18')).toBe('2027-01-18');
  // Completed early: at least one cycle past the due date.
  expect(nextDate(q18, '2026-10-18', '2026-10-10')).toBe('2027-01-18');
  // I2: an off-pattern due month's own occurrence counts while it is still ahead.
  expect(nextDate(q18, '2026-10-05', '2026-10-05')).toBe('2026-10-18');
  // ...but not once it has passed: the next cycle month, not the next calendar month.
  expect(nextDate(q18, '2026-10-05', '2026-10-20')).toBe('2027-01-18');
  expect(nextDate(q18, '2026-10-20', '2026-10-20')).toBe('2027-01-18');
  // Long overdue: Jan, Apr, Jul, Oct 2026 are the cycle months.
  expect(nextDate(q18, '2026-01-18', '2026-10-16')).toBe('2026-10-18');
  expect(nextDate(q18, '2026-01-18', '2026-11-16')).toBe('2027-01-18');
  // No due date: the completion month is month 0.
  expect(nextDate({ type: 'monthly', day: 20, n: 3 }, null, '2026-10-16')).toBe('2026-10-20');
  expect(nextDate({ type: 'monthly', day: 5, n: 3 }, null, '2026-10-16')).toBe('2027-01-05');
});

test('every N months on the 31st clamps to short months without drifting', () => {
  const m31 = { type: 'monthly', day: 31, n: 2 } as const;
  expect(nextDate(m31, '2026-12-31', '2026-12-31')).toBe('2027-02-28');
  expect(nextDate(m31, '2027-02-28', '2027-02-28')).toBe('2027-04-30');
  expect(nextDate(m31, '2027-04-30', '2027-04-30')).toBe('2027-06-30');
  expect(nextDate(m31, '2027-06-30', '2027-06-30')).toBe('2027-08-31');
  expect(nextDate({ type: 'monthly', day: 31, n: 3 }, '2027-11-30', '2027-11-30')).toBe('2028-02-29');
});

test('every N months steps N calendar months from the due date, clamped', () => {
  const m3 = { type: 'every', n: 3, unit: 'months' } as const;
  expect(nextDate(m3, '2026-10-17', '2026-10-17')).toBe('2027-01-17');
  expect(nextDate(m3, '2026-11-30', '2026-11-30')).toBe('2027-02-28');
  expect(nextDate(m3, '2026-08-31', '2026-08-31')).toBe('2026-11-30');
  // Anchored on the due day: two steps from 31 Aug reach 28 Feb, with no drift to the 30th.
  expect(nextDate(m3, '2026-08-31', '2026-12-01')).toBe('2027-02-28');
  expect(nextDate({ type: 'every', n: 1, unit: 'months' }, '2027-01-31', '2027-03-01')).toBe('2027-03-31');
  // Early and late completion.
  expect(nextDate(m3, '2026-10-20', '2026-10-16')).toBe('2027-01-20');
  expect(nextDate(m3, '2026-01-10', '2026-10-16')).toBe('2027-01-10');
  // No due date: N months from the completion date.
  expect(nextDate(m3, null, '2026-10-16')).toBe('2027-01-16');
  expect(nextDate({ type: 'every', n: 1, unit: 'months' }, null, '2026-01-31')).toBe('2026-02-28');
});

test('fitDate for N-interval rules', () => {
  // Weeks are counted from the given date's week, or today's week with no date.
  expect(fitDate(fri2, '2026-10-19', '2026-10-16')).toBe('2026-10-23');
  expect(fitDate(fri2, '2026-10-23', '2026-10-16')).toBe('2026-10-23');
  expect(fitDate(fri2, '2026-10-24', '2026-10-16')).toBe('2026-11-06');
  expect(fitDate(fri2, null, '2026-10-16')).toBe('2026-10-16');
  expect(fitDate(fri2, null, '2026-10-17')).toBe('2026-10-30');
  expect(fitDate(monThu2, '2026-10-20', '2026-10-16')).toBe('2026-10-22');
  // Months are counted from the given date's month.
  const q18 = { type: 'monthly', day: 18, n: 3 } as const;
  expect(fitDate(q18, '2026-10-05', '2026-10-05')).toBe('2026-10-18');
  expect(fitDate(q18, '2026-10-18', '2026-10-05')).toBe('2026-10-18');
  expect(fitDate(q18, '2026-10-20', '2026-10-05')).toBe('2027-01-18');
  expect(fitDate(q18, null, '2026-10-16')).toBe('2026-10-18');
  expect(fitDate({ type: 'monthly', day: 18, n: 36 }, '2026-10-20', '2026-10-20')).toBe('2029-10-18');
  // A stride has no pattern to miss.
  expect(fitDate({ type: 'every', n: 3, unit: 'months' }, '2026-10-21', '2026-10-16')).toBe('2026-10-21');
  expect(fitDate({ type: 'every', n: 3, unit: 'months' }, null, '2026-10-16')).toBe('2026-10-16');
});
