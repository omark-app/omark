import { expect, test } from 'vitest';
import { defaultTimeConfig, defaultTimeConfigText, parseTimeConfig, setTimeConfig } from '../src/config.ts';

const TODAY = '2026-10-26';
const DEFAULTS = { calendars: ['primary'], trackFrom: '2026-01-01', allDayHours: 8, weekStart: 'monday', colourEvents: false };

test('defaults', () => {
  expect(defaultTimeConfig(TODAY)).toEqual(DEFAULTS);
  expect(defaultTimeConfig('2027-03-04').trackFrom).toBe('2027-01-01');
});

test('empty text and the default file both read as the defaults', () => {
  expect(parseTimeConfig('', TODAY)).toEqual({ config: DEFAULTS, problems: [] });
  expect(parseTimeConfig(defaultTimeConfigText(TODAY), TODAY)).toEqual({ config: DEFAULTS, problems: [] });
});

test('absent and null values use the default without a problem', () => {
  expect(parseTimeConfig('week_start:\ncolour_events: true\n', TODAY)).toEqual({
    config: { ...DEFAULTS, colourEvents: true },
    problems: [],
  });
});

test.each([
  ['all_day_hours: 30', 'all_day_hours must be a number from 0.25 to 24'],
  ['all_day_hours: 0', 'all_day_hours must be a number from 0.25 to 24'],
  ['all_day_hours: lots', 'all_day_hours must be a number from 0.25 to 24'],
  ['week_start: someday', 'week_start must be a day of the week, like monday'],
  ['track_from: 2026-13-01', 'track_from must be a date (YYYY-MM-DD)'],
  ['track_from: soon', 'track_from must be a date (YYYY-MM-DD)'],
  ['calendars: []', 'calendars must be a list of calendar ids'],
  ['calendars: [1, 2]', 'calendars must be a list of calendar ids'],
  ['colour_events: maybe', 'colour_events must be true or false'],
])('invalid value falls back with a problem on its line: %s', (line, message) => {
  const { config, problems } = parseTimeConfig(`# comment\n${line}\n`, TODAY);
  expect(config).toEqual(DEFAULTS);
  expect(problems).toEqual([{ line: 2, message }]);
});

test('one bad value does not spoil the others', () => {
  const { config, problems } = parseTimeConfig('week_start: sunday\nall_day_hours: 99\ncolour_events: true\n', TODAY);
  expect(config).toEqual({ ...DEFAULTS, weekStart: 'sunday', colourEvents: true });
  expect(problems).toHaveLength(1);
});

test('broken YAML gives the defaults and one problem with its line', () => {
  const { config, problems } = parseTimeConfig('week_start: monday\ncalendars: [a, b\n', TODAY);
  expect(config).toEqual(DEFAULTS);
  expect(problems).toHaveLength(1);
  expect(problems[0]!.line).toBe(2);
});

test('a top level that is not a map is one problem', () => {
  expect(parseTimeConfig('- a\n- b\n', TODAY)).toEqual({
    config: DEFAULTS,
    problems: [{ line: 1, message: 'config.yaml must be a map of settings' }],
  });
});

test('lenient readings', () => {
  expect(parseTimeConfig('calendars: work@example.com\n', TODAY).config.calendars).toEqual(['work@example.com']);
  expect(parseTimeConfig('week_start: Sunday\n', TODAY).config.weekStart).toBe('sunday');
  expect(parseTimeConfig('all_day_hours: 7.5\ntrack_from: 2025-02-03\n', TODAY).config).toMatchObject({
    allDayHours: 7.5,
    trackFrom: '2025-02-03',
  });
});

test('setTimeConfig changes only the asked line and keeps comments and unknown keys', () => {
  const text = `${defaultTimeConfigText(TODAY)}theme: dark\n`;
  const out = setTimeConfig(text, { colourEvents: true }, TODAY);
  const before = text.split('\n');
  const after = out.split('\n');
  expect(after).toHaveLength(before.length);
  const changed = before.map((l, i) => [l, after[i]]).filter(([a, b]) => a !== b);
  expect(changed).toHaveLength(1);
  expect(changed[0]![1]).toMatch(/^colour_events: true/);
  expect(out).toContain('theme: dark');
  expect(out).toContain('# Google calendar ids to read');
  expect(parseTimeConfig(out, TODAY).config.colourEvents).toBe(true);
});

test('setTimeConfig on empty text writes the default file with the change', () => {
  const out = setTimeConfig('  \n', { weekStart: 'sunday', trackFrom: '2025-05-01' }, TODAY);
  expect(out).toContain('track_from: 2025-05-01');
  expect(out).toContain('week_start: sunday');
  expect(out).toContain('calendars: [primary]');
  expect(parseTimeConfig(out, TODAY)).toEqual({
    config: { ...DEFAULTS, weekStart: 'sunday', trackFrom: '2025-05-01' },
    problems: [],
  });
});

test('setTimeConfig writes calendars as a flow list and track_from unquoted', () => {
  const out = setTimeConfig(defaultTimeConfigText(TODAY), { calendars: ['primary', 'a@b.c'], trackFrom: '2026-02-02' }, TODAY);
  expect(out).toMatch(/^calendars: \[primary, a@b\.c\]/m);
  expect(out).toMatch(/^track_from: 2026-02-02/m);
});

test('setTimeConfig throws on broken YAML', () => {
  expect(() => setTimeConfig('calendars: [a, b\n', { colourEvents: true }, TODAY)).toThrow(Error);
});

test('setTimeConfig fills an empty value and adds an absent key', () => {
  const out = setTimeConfig('week_start:   # later\ntheme: dark', { weekStart: 'friday', colourEvents: true }, TODAY);
  expect(out).toBe('week_start: friday   # later\ntheme: dark\ncolour_events: true\n');
});
