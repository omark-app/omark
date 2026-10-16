import { expect, test } from 'vitest';
import { fitDate, matchesRule, nextDate } from '../src/index.ts';

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
