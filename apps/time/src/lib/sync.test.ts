import { beforeEach, expect, test } from 'vitest';
import { FakeCalendar } from '@omark/calendar';
import type { CalendarEvent, CalendarInfo } from '@omark/calendar';
import { defaultTimeConfigText, parseEventsFile } from '@omark/time-core';
import { CONFIG, PROJECTS, PROJECTS_HEADER, MemoryFiles } from './files.ts';
import { MemoryState } from './state.ts';
import { readSummary, sync } from './sync.ts';
import type { SyncDeps } from './sync.ts';

const CALENDARS: CalendarInfo[] = [
  { id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true },
  { id: 'work@example.com', name: 'Work', primary: false, timeZone: 'Europe/Warsaw', owned: true },
];
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-27T12:00:00Z');

function event(id: string, date: string, title = 'ACME; Coding; x', extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    calendarId: 'primary',
    id,
    status: 'confirmed',
    title,
    start: { dateTime: `${date}T09:00:00+01:00` },
    end: { dateTime: `${date}T10:00:00+01:00` },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...extra,
  };
}

let calendar: FakeCalendar;
let files: MemoryFiles;
let state: MemoryState;
let now: number;
let ranges: [string, string, string][];
let deps: SyncDeps;

beforeEach(() => {
  calendar = new FakeCalendar(CALENDARS);
  files = new MemoryFiles();
  state = new MemoryState();
  now = NOW;
  ranges = [];
  const readRange = calendar.readRange.bind(calendar);
  calendar.readRange = (id, from, to) => {
    ranges.push([id, from, to]);
    return readRange(id, from, to);
  };
  deps = { source: calendar, files, state, now: () => now };
  files.texts.set(PROJECTS, `${PROJECTS_HEADER}ACME,Acme,,,,\n`);
});

const rows = (year = '2026') => parseEventsFile(files.texts.get(`events-${year}.csv`) ?? '').rows;
const rowIds = (year = '2026') => rows(year).map((r) => r.eventId);

test('the first sync creates the files and writes a row per event', async () => {
  files.texts.delete(PROJECTS);
  calendar.add(event('a', '2026-10-20'));
  calendar.add(event('b', '2026-10-21', 'Lunch'));
  const result = await sync(deps);
  expect(files.texts.get(PROJECTS)).toBe(PROJECTS_HEADER);
  expect(files.texts.get(CONFIG)).toBe(defaultTimeConfigText('2026-10-27'));
  expect(rowIds()).toEqual(['a']);
  expect(rows()[0]).toMatchObject({ project: 'ACME', known: false });
  expect(result).toMatchObject({ changedYears: ['2026'], rows: 1, fixCount: 1 });
  expect((await state.load()).tokens.primary).toBeTruthy();
});

test('known codes come from projects.csv', async () => {
  calendar.add(event('a', '2026-10-20'));
  await sync(deps);
  expect(rows()[0]).toMatchObject({ project: 'ACME', known: true });
});

test('a second sync with no change writes nothing', async () => {
  calendar.add(event('a', '2026-10-20'));
  await sync(deps);
  const writes = files.writes.length;
  const result = await sync(deps);
  expect(files.writes.length).toBe(writes);
  expect(result.changedYears).toEqual([]);
  expect(result.events).toEqual([]);
});

test('an edited past event changes its row; a cancelled one loses it', async () => {
  calendar.add(event('a', '2026-10-01'));
  calendar.add(event('b', '2026-10-02'));
  await sync(deps);
  calendar.edit('primary', 'a', { title: 'ACME; Meetings' });
  calendar.cancel('primary', 'b');
  const result = await sync(deps);
  expect(rows().map((r) => [r.eventId, r.category])).toEqual([['a', 'Meetings']]);
  expect(result.events.map((e) => e.id).sort()).toEqual(['a', 'b']);
});

test('an expired token reads the calendar again in full, and drops the rows of events deleted meanwhile', async () => {
  calendar.add(event('a', '2026-10-01'));
  calendar.add(event('gone', '2026-10-02'));
  await sync(deps);
  calendar.expireTokens();
  // A full read leaves deleted events out, so only dropping the calendar's rows first removes this one.
  calendar.cancel('primary', 'gone');
  await sync(deps);
  expect(rowIds()).toEqual(['a']);
});

test('only the calendar whose token expired is read again', async () => {
  files.texts.set(CONFIG, defaultTimeConfigText('2026-10-27').replace('[primary]', '[primary, work@example.com]'));
  calendar.add(event('a', '2026-10-01'));
  calendar.add(event('w', '2026-10-03', 'ACME; Work', { calendarId: 'work@example.com' }));
  await sync(deps);
  const s = await state.load();
  await state.save({ ...s, tokens: { ...s.tokens, primary: 'not-a-token' } });
  const reads: [string, string | null][] = [];
  const readChanges = calendar.readChanges.bind(calendar);
  calendar.readChanges = (id, token) => {
    reads.push([id, token]);
    return readChanges(id, token);
  };
  await sync(deps);
  expect(reads).toEqual([
    ['primary', 'not-a-token'],
    ['primary', null],
    ['work@example.com', s.tokens['work@example.com']],
  ]);
  expect(rowIds().sort()).toEqual(['a', 'w']);
});

test('days that enter the window are read with readRange', async () => {
  calendar.add(event('far', '2027-01-30')); // 95 days ahead: outside the window
  await sync(deps);
  expect(rowIds('2027')).toEqual([]);
  expect(ranges).toEqual([]);
  now += 10 * DAY;
  await sync(deps);
  expect(rowIds('2027')).toEqual(['far']);
  expect(ranges).toEqual([['primary', '2027-01-25T00:00+01:00', '2027-02-04T00:00+01:00']]);
});

test('a new project turns rows known and gives bare-code events their rows', async () => {
  calendar.add(event('a', '2026-10-20', 'OOO; away'));
  calendar.add(event('b', '2026-10-21', 'OOO'));
  await sync(deps);
  expect(rows().map((r) => [r.eventId, r.known])).toEqual([['a', false]]);
  files.texts.set(PROJECTS, `${PROJECTS_HEADER}ACME,Acme,,,,\nOOO,Away,,,,\n`);
  const result = await sync(deps);
  expect(rows().map((r) => [r.eventId, r.known])).toEqual([['a', true], ['b', true]]);
  expect(ranges.map(([id]) => id)).toEqual(['primary']);
  expect(result.events.map((e) => e.id).sort()).toEqual(['a', 'b']);
});

test('a calendar taken out of config.yaml loses its rows and its token', async () => {
  const both = defaultTimeConfigText('2026-10-27').replace('[primary]', '[primary, work@example.com]');
  files.texts.set(CONFIG, both);
  calendar.add(event('a', '2026-10-01'));
  calendar.add(event('w', '2026-10-03', 'ACME; Work', { calendarId: 'work@example.com' }));
  await sync(deps);
  files.texts.set(CONFIG, defaultTimeConfigText('2026-10-27'));
  await sync(deps);
  expect(rowIds()).toEqual(['a']);
  expect(Object.keys((await state.load()).tokens)).toEqual(['primary']);
});

test('rebuild reads everything again and gives the same files as a first sync', async () => {
  calendar.add(event('a', '2026-10-01'));
  calendar.add(event('b', '2025-12-30'));
  files.texts.set(CONFIG, defaultTimeConfigText('2026-10-27').replace('track_from: 2026-01-01', 'track_from: 2025-12-01'));
  await sync(deps);
  const first = new Map(files.texts);
  files.texts.set('events-2026.csv', `${files.texts.get('events-2026.csv')}2026-10-05,x,y,1,BAD,,,false,false,primary,junk\n`);
  await state.save({ ...(await state.load()), tokens: { primary: 'stale' } });
  await sync(deps, { rebuild: true });
  expect(files.texts).toEqual(first);
});

test('nothing before track_from or after the window gives rows', async () => {
  calendar.add(event('old', '2025-12-31'));
  calendar.add(event('late', '2027-02-01'));
  calendar.add(event('ok', '2026-01-01'));
  await sync(deps);
  // The window reaches into 2027, so that year's file exists, with no rows; 2025 is before track_from.
  expect([...files.texts.keys()].filter((n) => n.startsWith('events-')).sort()).toEqual(['events-2026.csv', 'events-2027.csv']);
  expect(rowIds()).toEqual(['ok']);
  expect(rowIds('2027')).toEqual([]);
});

test('the time zone comes from the primary calendar and is kept', async () => {
  await sync(deps);
  expect((await state.load()).timeZone).toBe('Europe/Warsaw');
});

test('a sync returns its rows and projects, and keeps the calendar link of events with an unknown code', async () => {
  calendar.add(event('typo', '2026-10-20', 'ACMEE; x', { htmlLink: 'https://www.google.com/calendar/event?eid=dHlwbw' }));
  calendar.add(event('ok', '2026-10-21', 'ACME; x', { htmlLink: 'https://www.google.com/calendar/event?eid=b2s' }));
  const result = await sync(deps);
  expect(result.allRows.map((r) => r.eventId).sort()).toEqual(['ok', 'typo']);
  expect(result.projects.projects.map((p) => p.code)).toEqual(['ACME']);
  expect(Object.values((await state.load()).links)).toEqual(['https://www.google.com/calendar/event?eid=dHlwbw']);
  // Fixed in Google Calendar: the link goes with the red row.
  calendar.edit('primary', 'typo', { title: 'ACME; x' });
  await sync(deps);
  expect((await state.load()).links).toEqual({});
});

test('readSummary gives the rows from the copy this device has', async () => {
  calendar.add(event('a', '2026-10-20'));
  await sync(deps);
  const summary = await readSummary(files, state, () => NOW);
  expect(summary.allRows.map((r) => r.eventId)).toEqual(['a']);
  expect(summary.projects.projects.map((p) => p.code)).toEqual(['ACME']);
});
