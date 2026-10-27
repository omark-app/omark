import { beforeEach, expect, test } from 'vitest';
import { FakeCalendar } from '@omark/calendar';
import type { CalendarEvent, CalendarInfo } from '@omark/calendar';
import { defaultTimeConfigText } from '@omark/time-core';
import { colourAfterSync, confirmClear, planClear, runQueue } from './colouring.ts';
import { CONFIG, MemoryFiles, PROJECTS, PROJECTS_HEADER } from './files.ts';
import { MemoryState } from './state.ts';
import { sync } from './sync.ts';
import type { SyncDeps } from './sync.ts';

const CALENDARS: CalendarInfo[] = [{ id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true }];
const NOW = Date.parse('2026-10-27T12:00:00Z');

function event(id: string, date: string, title = 'ACME; Coding', extra: Partial<CalendarEvent> = {}): CalendarEvent {
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
let deps: SyncDeps;

const colouring = (on: boolean) =>
  files.texts.set(CONFIG, defaultTimeConfigText('2026-10-27').replace('colour_events: false', `colour_events: ${on}`));
const patched = () => calendar.patches.map((p) => `${p.eventId}:${p.patch.marker}`);
const round = async (opts: { rebuild?: boolean; stopAfter?: number } = {}) => {
  let n = 0;
  return colourAfterSync(await sync(deps, opts), {
    source: calendar,
    state,
    shouldStop: () => opts.stopAfter !== undefined && n++ >= opts.stopAfter,
  });
};

beforeEach(() => {
  calendar = new FakeCalendar(CALENDARS);
  files = new MemoryFiles();
  state = new MemoryState();
  deps = { source: calendar, files, state, now: () => NOW };
  files.texts.set(PROJECTS, `${PROJECTS_HEADER}ACME,Acme,,,,\n`);
  calendar.add(event('old', '2026-10-01'));
  calendar.add(event('new', '2026-10-20'));
  calendar.add(event('typo', '2026-10-10', 'ACMEE; Coding'));
  calendar.add(event('lunch', '2026-10-15', 'Lunch'));
});

test('with colouring off nothing is ever written to the calendar', async () => {
  expect(await round()).toBe('off');
  calendar.edit('primary', 'old', { title: 'ACMEE; x' });
  await round();
  files.texts.set(PROJECTS, `${PROJECTS_HEADER}ACME,Acme,,,,\nACMEE,Typo,,,,\n`);
  await round();
  await round({ rebuild: true });
  expect(calendar.patches).toEqual([]);
});

test('turning it on colours the whole window, newest first', async () => {
  colouring(true);
  expect(await round()).toBe('done');
  expect(patched()).toEqual(['new:green', 'typo:red', 'old:green']);
  // The patches come back in the next read; they need nothing more.
  await round();
  expect(patched()).toHaveLength(3);
});

test('the queue is saved before the first patch and resumes after a stop', async () => {
  colouring(true);
  const setColour = calendar.setColour.bind(calendar);
  const queued: number[] = [];
  calendar.setColour = async (...args) => {
    queued.push((await state.load()).colourQueue.length);
    return setColour(...args);
  };
  expect(await round({ stopAfter: 1 })).toBe('stopped');
  expect(patched()).toEqual(['new:green']);
  expect((await state.load()).colourQueue.map((j) => j.eventId)).toEqual(['typo', 'old']);
  // A reload: a fresh run carries on with what is left.
  expect(await runQueue('colourQueue', { source: calendar, state })).toBe('done');
  expect(patched()).toEqual(['new:green', 'typo:red', 'old:green']);
  expect(queued).toEqual([3, 2, 1]);
});

test('a sync before its turn replans an event', async () => {
  colouring(true);
  await round({ stopAfter: 1 });
  calendar.edit('primary', 'typo', { title: 'Dentist' });
  calendar.edit('primary', 'old', { title: 'ACMEE; now red' });
  await round();
  expect(patched()).toEqual(['new:green', 'old:red']);
});

test('read-only access stops colouring and keeps the queue', async () => {
  colouring(true);
  calendar.readOnly = true;
  expect(await round()).toBe('needs-edit');
  expect((await state.load()).colourQueue).toHaveLength(3);
  calendar.readOnly = false;
  expect(await runQueue('colourQueue', { source: calendar, state })).toBe('done');
  expect(patched()).toHaveLength(3);
});

test('turning it off drops the queue; clearing takes off only the tracker\'s colours', async () => {
  colouring(true);
  await round({ stopAfter: 2 });
  calendar.add(event('mine', '2026-10-05', 'Gym', { colorId: '5' }));
  calendar.add(event('changed', '2026-10-06', 'ACME; x', { colorId: '3', marker: 'green' }));
  colouring(false);
  const result = await sync(deps);
  expect(await colourAfterSync(result, { source: calendar, state })).toBe('off');
  expect((await state.load()).colourQueue).toEqual([]);

  const before = calendar.patches.length;
  const jobs = await planClear(result, { source: calendar });
  expect(jobs).toHaveLength(3);
  expect(await confirmClear(jobs, { source: calendar, state })).toBe('done');
  const clears = calendar.patches.slice(before).map((p) => [p.eventId, p.patch.colorId, p.patch.marker]);
  expect(clears).toEqual([
    ['new', null, null],
    ['typo', null, null],
    ['changed', '3', null],
  ]);
});

test('a clear that was offered but not confirmed never runs', async () => {
  colouring(true);
  await round();
  colouring(false);
  const result = await sync(deps);
  const before = calendar.patches.length;
  expect(await planClear(result, { source: calendar })).toHaveLength(3);
  // The user taps Sync now, or reloads, without answering.
  await round();
  await round();
  expect(calendar.patches.length).toBe(before);
});

test('a calendar taken out of config.yaml gets no more patches', async () => {
  files.texts.set(CONFIG, defaultTimeConfigText('2026-10-27').replace('[primary]', '[primary, work@example.com]').replace('colour_events: false', 'colour_events: true'));
  calendar = new FakeCalendar([...CALENDARS, { id: 'work@example.com', name: 'Work', primary: false, timeZone: 'Europe/Warsaw', owned: true }]);
  deps = { ...deps, source: calendar };
  calendar.add(event('p', '2026-10-01'));
  calendar.add(event('w', '2026-10-02', 'ACME; x', { calendarId: 'work@example.com' }));
  // Stops before any patch, leaving both queued.
  await round({ stopAfter: 0 });
  files.texts.set(CONFIG, defaultTimeConfigText('2026-10-27').replace('colour_events: false', 'colour_events: true'));
  await round();
  expect(calendar.patches.map((p) => p.eventId)).toEqual(['p']);
});

test('a run removes only the job it sent, even if the queue changed meanwhile', async () => {
  colouring(true);
  await round({ stopAfter: 0 });
  const setColour = calendar.setColour.bind(calendar);
  calendar.setColour = async (...args) => {
    // Something else drops the last job while the first is in flight.
    const s = await state.load();
    await state.save({ ...s, colourQueue: s.colourQueue.slice(0, -1) });
    calendar.setColour = setColour;
    return setColour(...args);
  };
  await runQueue('colourQueue', { source: calendar, state, shouldStop: () => calendar.patches.length >= 1 });
  expect((await state.load()).colourQueue.map((j) => j.eventId)).toEqual(['typo']);
});
