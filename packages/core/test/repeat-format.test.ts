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
