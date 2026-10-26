import { expect, test } from 'vitest';
import { SyncTokenExpiredError } from '@omark/time-core';
import type { CalendarEvent, CalendarInfo } from '@omark/time-core';
import { calendarContract } from '../src/contract.ts';
import type { ContractHarness } from '../src/contract.ts';
import { FakeCalendar } from '../src/fake.ts';

const CALENDARS: CalendarInfo[] = [
  { id: 'primary', name: 'AL', primary: true, timeZone: 'Europe/Warsaw', owned: true },
  { id: 'work@example.com', name: 'Work', primary: false, timeZone: 'Europe/Warsaw', owned: true },
  { id: 'team@example.com', name: 'Team', primary: false, timeZone: 'Europe/Warsaw', owned: false },
];

function harnessFor(fake: FakeCalendar): ContractHarness {
  return {
    source: fake,
    add: (e) => fake.add(e),
    edit: (c, id, changes) => fake.edit(c, id, changes),
    cancel: (c, id) => fake.cancel(c, id),
    expireTokens: () => fake.expireTokens(),
    readOnly: (on) => {
      fake.readOnly = on;
    },
  };
}

calendarContract('FakeCalendar', () => harnessFor(new FakeCalendar(CALENDARS)));

const EVENT: CalendarEvent = {
  calendarId: 'primary',
  id: 'a',
  status: 'confirmed',
  title: 'A',
  start: { dateTime: '2026-10-22T09:00:00+02:00' },
  end: { dateTime: '2026-10-22T10:00:00+02:00' },
  response: null,
  colorId: null,
  marker: null,
  recurringEventId: null,
  htmlLink: null,
};

test('patches lists each setColour call', async () => {
  const fake = new FakeCalendar(CALENDARS, [EVENT]);
  await fake.setColour('primary', 'a', { colorId: '10', marker: 'green' });
  await fake.setColour('primary', 'a', { colorId: null, marker: null });
  expect(fake.patches).toEqual([
    { calendarId: 'primary', eventId: 'a', patch: { colorId: '10', marker: 'green' } },
    { calendarId: 'primary', eventId: 'a', patch: { colorId: null, marker: null } },
  ]);
});

test('fromJSON keeps events, tokens and readOnly', async () => {
  const fake = new FakeCalendar(CALENDARS, [EVENT]);
  const { syncToken } = await fake.readChanges('primary', null);
  fake.edit('primary', 'a', { title: 'B' });
  fake.readOnly = true;
  const copy = FakeCalendar.fromJSON(JSON.parse(JSON.stringify(fake)));
  expect(copy.readOnly).toBe(true);
  const { events } = await copy.readChanges('primary', syncToken);
  expect(events.map((e) => e.title)).toEqual(['B']);
  copy.expireTokens();
  await expect(copy.readChanges('primary', syncToken)).rejects.toThrow();
});

test('readChanges returns copies, not the internal events', async () => {
  const fake = new FakeCalendar(CALENDARS, [EVENT]);
  const { events } = await fake.readChanges('primary', null);
  events[0]!.title = 'changed outside';
  expect((await fake.readChanges('primary', null)).events[0]!.title).toBe('A');
});

test('a cancelled event comes back with no title or times', async () => {
  const fake = new FakeCalendar(CALENDARS, [EVENT]);
  const { syncToken } = await fake.readChanges('primary', null);
  fake.cancel('primary', 'a');
  const { events } = await fake.readChanges('primary', syncToken);
  expect(events[0]).toMatchObject({ id: 'a', status: 'cancelled', title: '', start: null, end: null });
});

test('an unknown event or a bad token is an error', async () => {
  const fake = new FakeCalendar(CALENDARS, [EVENT]);
  await expect(fake.setColour('primary', 'nope', { colorId: null, marker: null })).rejects.toThrow(/nope/);
  await expect(fake.readChanges('primary', 'garbage')).rejects.toBeInstanceOf(SyncTokenExpiredError);
  await expect(fake.readChanges('missing', null)).rejects.toThrow(/missing/);
});
