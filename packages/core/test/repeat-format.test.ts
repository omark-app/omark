import { expect, test } from 'vitest';
import { describeRepeat, formatRepeat, parseRepeat } from '../src/index.ts';

const rows: [string, Parameters<typeof formatRepeat>[0], string][] = [
  ['every day', { type: 'daily' }, 'every day'],
  ['every weekday', { type: 'weekdays' }, 'weekdays'],
  ['every week on Monday, Thursday', { type: 'weekly', days: [0, 3] }, 'every Mon, Thu'],
  ['every month on the 1st', { type: 'monthly', day: 1 }, 'every month on the 1st'],
  ['every month on the 2nd', { type: 'monthly', day: 2 }, 'every month on the 2nd'],
  ['every month on the 3rd', { type: 'monthly', day: 3 }, 'every month on the 3rd'],
  ['every month on the 15th', { type: 'monthly', day: 15 }, 'every month on the 15th'],
  ['every month on the 22nd', { type: 'monthly', day: 22 }, 'every month on the 22nd'],
  ['every month on the 31st', { type: 'monthly', day: 31 }, 'every month on the 31st'],
  ['every year', { type: 'yearly' }, 'every year'],
  ['every 3 days', { type: 'every', n: 3, unit: 'days' }, 'every 3 days'],
  ['every 2 weeks', { type: 'every', n: 2, unit: 'weeks' }, 'every 2 weeks'],
  ['every 3 days when done', { type: 'after', n: 3 }, '3 days after done'],
  ['every 1 day when done', { type: 'after', n: 1 }, '1 day after done'],
  ['every 2 weeks on Friday', { type: 'weekly', days: [4], n: 2 }, 'every 2 weeks on Fri'],
  ['every 2 weeks on Monday, Thursday', { type: 'weekly', days: [0, 3], n: 2 }, 'every 2 weeks on Mon, Thu'],
  ['every 3 months', { type: 'every', n: 3, unit: 'months' }, 'every 3 months'],
  ['every 1 month', { type: 'every', n: 1, unit: 'months' }, 'every 1 month'],
  ['every 3 months on the 18th', { type: 'monthly', day: 18, n: 3 }, 'every 3 months on the 18th'],
  ['every 2 months on the 31st', { type: 'monthly', day: 31, n: 2 }, 'every 2 months on the 31st'],
];

test.each(rows)('round-trips and describes %s', (text, rule, described) => {
  expect(parseRepeat(text)).toEqual(rule);
  expect(formatRepeat(rule)).toBe(text);
  expect(describeRepeat(rule)).toBe(described);
});

test('ordinal suffixes for every monthly day', () => {
  const expected: Record<number, string> = {
    11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 4: '4th', 10: '10th',
  };
  for (const [day, ord] of Object.entries(expected)) {
    const text = `every month on the ${ord}`;
    expect(parseRepeat(text)).toEqual({ type: 'monthly', day: Number(day) });
    expect(formatRepeat({ type: 'monthly', day: Number(day) })).toBe(text);
  }
});

test('parses case-insensitively, trims and sorts weekly days', () => {
  expect(parseRepeat('Every Week On thursday, monday')).toEqual({ type: 'weekly', days: [0, 3] });
  expect(parseRepeat('  every day  ')).toEqual({ type: 'daily' });
});

test('accepts singular and plural units symmetrically', () => {
  expect(parseRepeat('every 1 days')).toEqual({ type: 'every', n: 1, unit: 'days' });
  expect(parseRepeat('every 1 day')).toEqual({ type: 'every', n: 1, unit: 'days' });
  expect(parseRepeat('every 1 week')).toEqual({ type: 'every', n: 1, unit: 'weeks' });
  expect(parseRepeat('every 1 days when done')).toEqual({ type: 'after', n: 1 });
  expect(formatRepeat({ type: 'every', n: 1, unit: 'days' })).toBe('every 1 day');
  expect(formatRepeat({ type: 'every', n: 1, unit: 'weeks' })).toBe('every 1 week');
});

test('N = 1 keeps the existing canonical forms and rule shapes', () => {
  // Existing files must read and write exactly as before: no `n` on plain weekly/monthly rules.
  expect(parseRepeat('every week on Monday, Thursday')).toStrictEqual({ type: 'weekly', days: [0, 3] });
  expect(parseRepeat('every month on the 15th')).toStrictEqual({ type: 'monthly', day: 15 });
  expect(parseRepeat('every 2 weeks')).toStrictEqual({ type: 'every', n: 2, unit: 'weeks' });
  expect(parseRepeat('every 3 days')).toStrictEqual({ type: 'every', n: 3, unit: 'days' });
  // An explicit 1 reads as the plain rule and writes back in its canonical form.
  expect(parseRepeat('every 1 week on Friday')).toStrictEqual({ type: 'weekly', days: [4] });
  expect(parseRepeat('every 1 month on the 15th')).toStrictEqual({ type: 'monthly', day: 15 });
  expect(formatRepeat({ type: 'weekly', days: [4], n: 1 })).toBe('every week on Friday');
  expect(formatRepeat({ type: 'monthly', day: 15, n: 1 })).toBe('every month on the 15th');
  expect(describeRepeat({ type: 'weekly', days: [4], n: 1 })).toBe('every Fri');
  expect(describeRepeat({ type: 'monthly', day: 15, n: 1 })).toBe('every month on the 15th');
});

test('parses N-interval rules case-insensitively, with singular or plural units', () => {
  expect(parseRepeat('Every 2 Weeks On friday, monday')).toEqual({ type: 'weekly', days: [0, 4], n: 2 });
  expect(parseRepeat('every 2 week on Friday')).toEqual({ type: 'weekly', days: [4], n: 2 });
  expect(parseRepeat('every 3 month on the 18th')).toEqual({ type: 'monthly', day: 18, n: 3 });
  expect(parseRepeat('every 3 month')).toEqual({ type: 'every', n: 3, unit: 'months' });
  expect(parseRepeat('every 1 months')).toEqual({ type: 'every', n: 1, unit: 'months' });
});

test('rejects invalid N-interval text', () => {
  expect(parseRepeat('every 0 weeks on Friday')).toBeNull();
  expect(parseRepeat('every 2 weeks on Funday')).toBeNull();
  expect(parseRepeat('every 2 weeks on')).toBeNull();
  expect(parseRepeat('every 0 months')).toBeNull();
  expect(parseRepeat('every 0 months on the 5th')).toBeNull();
  expect(parseRepeat('every 2 months on the 32nd')).toBeNull();
  expect(parseRepeat('every 2 months on the 2th')).toBeNull();
  expect(parseRepeat('every 2 months when done')).toBeNull();
});

test('rejects invalid text', () => {
  expect(parseRepeat('every 2nd tue')).toBeNull();
  expect(parseRepeat('')).toBeNull();
  expect(parseRepeat('every month on the 32nd')).toBeNull();
  expect(parseRepeat('every month on the 0th')).toBeNull();
  expect(parseRepeat('every month on the 2th')).toBeNull();
  expect(parseRepeat('every 0 days')).toBeNull();
  expect(parseRepeat('every 0 days when done')).toBeNull();
  expect(parseRepeat('every week on Funday')).toBeNull();
  expect(parseRepeat('every week on')).toBeNull();
  expect(parseRepeat('every 2 weeks when done')).toBeNull(); // the after rule has no unit
});
