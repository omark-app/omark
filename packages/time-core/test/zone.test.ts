import { expect, test } from 'vitest';
import { addDays, daysBetween, formatLocal, localDate, parseInstant, startOfDay, weekday } from '../src/zone.ts';

test('formats an instant in the calendar zone, not the machine zone', () => {
  const ms = parseInstant('2026-10-22T07:00:00Z');
  expect(formatLocal(ms, 'Europe/Warsaw')).toBe('2026-10-22T09:00+02:00');
  expect(formatLocal(ms, 'America/New_York')).toBe('2026-10-22T03:00-04:00');
  expect(formatLocal(ms, 'UTC')).toBe('2026-10-22T07:00+00:00');
  expect(formatLocal(parseInstant('2026-10-22T07:00:30Z'), 'UTC')).toBe('2026-10-22T07:00:30+00:00');
});

test('local dates and midnights across the autumn DST change', () => {
  expect(formatLocal(startOfDay('2026-10-25', 'Europe/Warsaw'), 'Europe/Warsaw')).toBe('2026-10-25T00:00+02:00');
  expect(startOfDay('2026-10-26', 'Europe/Warsaw') - startOfDay('2026-10-25', 'Europe/Warsaw')).toBe(25 * 3600_000);
  expect(localDate(parseInstant('2026-10-21T23:30:00Z'), 'Europe/Warsaw')).toBe('2026-10-22');
});

test('a day whose midnight does not exist starts at the first local instant', () => {
  // America/Santiago skips 00:00 → 01:00 on 2026-09-06.
  expect(formatLocal(startOfDay('2026-09-06', 'America/Santiago'), 'America/Santiago')).toBe('2026-09-06T01:00-03:00');
});

test('date arithmetic', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  expect(daysBetween('2026-10-01', '2026-12-30')).toBe(90);
  expect(weekday('2026-10-26')).toBe(0);
});

test('the TZ env reaches the workers', () => {
  // Auckland in January is NZDT (+13); if this fails, the tests below prove nothing about the machine zone.
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-780);
});

test('parseInstant rejects strings without an offset', () => {
  expect(() => parseInstant('2026-10-22T09:00:00')).toThrow();
  expect(() => parseInstant('Oct 22 2026')).toThrow();
  expect(parseInstant('2026-10-22T09:00:00.5+02:00')).toBe(Date.UTC(2026, 9, 22, 7, 0, 0, 500));
  expect(parseInstant('2026-10-22T07:00:00z')).toBe(Date.UTC(2026, 9, 22, 7));
});

test('offsets: the repeated hour, half-hour and quarter-style zones', () => {
  expect(formatLocal(parseInstant('2026-10-25T00:30:00Z'), 'Europe/Warsaw')).toBe('2026-10-25T02:30+02:00');
  expect(formatLocal(parseInstant('2026-10-25T01:30:00Z'), 'Europe/Warsaw')).toBe('2026-10-25T02:30+01:00');
  expect(formatLocal(parseInstant('2026-10-22T07:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-22T12:30+05:30');
  expect(formatLocal(parseInstant('2026-10-22T07:00:00Z'), 'America/St_Johns')).toBe('2026-10-22T04:30-02:30');
});
