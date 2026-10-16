import { expect, test } from 'vitest';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  endOfNextWeek,
  endOfWeek,
  hasWeekLeft,
  toISODate,
  weekCtx,
} from '../src/index.ts';

test('week ends and next-week ends', () => {
  const fri = { today: '2026-10-16', weekStart: 0 }, sun = { today: '2026-10-18', weekStart: 0 };
  expect(endOfWeek(fri)).toBe('2026-10-18'); expect(endOfNextWeek(fri)).toBe('2026-10-25');
  expect(endOfWeek(sun)).toBe('2026-10-18'); expect(hasWeekLeft(sun)).toBe(false); expect(hasWeekLeft(fri)).toBe(true);
  expect(endOfWeek({ today: '2026-10-16', weekStart: 6 })).toBe('2026-10-17'); // Sunday-start week ends Saturday
});

test('addDays across DST', () => {
  expect(addDays('2026-10-24', 2)).toBe('2026-10-26');   // across the EU DST change (25 Oct 2026)
  expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
});

test('calendar helpers', () => {
  expect(daysBetween('2026-10-03', '2026-10-16')).toBe(13);
  expect(dayOfWeek('2026-10-19')).toBe(0);
  expect(daysInMonth(2028, 2)).toBe(29);
  expect(toISODate(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16');
});

test('weekCtx builds context from a local date', () => {
  expect(weekCtx(new Date(2026, 9, 16, 9, 0))).toEqual({ today: '2026-10-16', weekStart: 0 });
  expect(weekCtx(new Date(2026, 9, 16, 9, 0), 6)).toEqual({ today: '2026-10-16', weekStart: 6 });
});
