import { expect, test } from 'vitest';
import { formatHours, hoursBetween, roundHours, rowSeconds } from '../src/hours.ts';

test('formats hours with up to 4 decimals and no trailing zeros', () => {
  expect(formatHours(1.5)).toBe('1.5');
  expect(formatHours(1 / 3)).toBe('0.3333');
  expect(formatHours(8)).toBe('8');
  expect(formatHours(0)).toBe('0');
  expect(formatHours(2.00004)).toBe('2');
  expect(formatHours(0.99996)).toBe('1');
});

test('never prints negative zero or exponents', () => {
  expect(formatHours(-0)).toBe('0');
  expect(formatHours(-0.00001)).toBe('0');
  expect(formatHours(0.00001)).toBe('0');
  expect(formatHours(1e21)).not.toMatch(/e/i);
  expect(formatHours(0.0001)).toBe('0.0001');
});

test('rounds to 4 decimals and measures between instants', () => {
  expect(roundHours(0.12345)).toBe(0.1235);
  expect(hoursBetween(0, 20 * 60_000)).toBe(0.3333);
  expect(hoursBetween(0, 90 * 60_000)).toBe(1.5);
});

test('rowSeconds recovers whole seconds from 4-decimal hours', () => {
  expect(rowSeconds({ hours: 0.3333 })).toBe(1200);
  expect(rowSeconds({ hours: 0.1667 })).toBe(600);
  expect(rowSeconds({ hours: 4 })).toBe(14400);
  expect(rowSeconds({ hours: 8 })).toBe(28800);
  // 1 h 0 min 1 s and 7 min 31 s, as eventToRows writes them
  expect(rowSeconds({ hours: hoursBetween(0, 3601_000) })).toBe(3601);
  expect(rowSeconds({ hours: hoursBetween(0, 451_000) })).toBe(451);
});
