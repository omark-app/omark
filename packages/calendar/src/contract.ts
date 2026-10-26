import { describe, expect, it } from 'vitest';
import { EditAccessRequiredError, SyncTokenExpiredError } from '@omark/time-core';
import type { CalendarEvent, CalendarSource } from '@omark/time-core';

export interface ContractHarness {
  source: CalendarSource;
  /** Changes made "in Google Calendar" by the user, outside the source. */
  add(event: CalendarEvent): void;
  edit(calendarId: string, id: string, changes: Partial<CalendarEvent>): void;
  cancel(calendarId: string, id: string): void;
  expireTokens(): void;
  readOnly(on: boolean): void;
}

function event(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    calendarId: 'primary',
    id,
    status: 'confirmed',
    title: `Event ${id}`,
    start: { dateTime: start },
    end: { dateTime: end },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...extra,
  };
}

function allDay(id: string, start: string, end: string): CalendarEvent {
  return event(id, '', '', { start: { date: start }, end: { date: end } });
}

const ids = (events: CalendarEvent[]) => events.map((e) => e.id).sort();

const DAY_FROM = '2026-10-22T00:00:00+02:00';
const DAY_TO = '2026-10-23T00:00:00+02:00';

/**
 * What every CalendarSource must do. The harness starts with the owned calendars `primary`
 * (Europe/Warsaw) and `work@example.com`, and a not-owned `team@example.com`.
 */
export function calendarContract(name: string, make: () => ContractHarness | Promise<ContractHarness>): void {
  describe(`${name} (CalendarSource contract)`, () => {
    it('lists the calendars the user owns', async () => {
      const { source } = await make();
      const list = await source.listCalendars();
      expect(list.map((c) => c.id).sort()).toEqual(['primary', 'work@example.com']);
      expect(list.find((c) => c.id === 'primary')).toMatchObject({ primary: true, timeZone: 'Europe/Warsaw', owned: true });
    });

    it('a full read returns the events and a token, but not cancelled ones', async () => {
      const h = await make();
      h.add(event('a', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00'));
      h.add(event('gone', '2026-10-22T11:00:00+02:00', '2026-10-22T12:00:00+02:00'));
      h.cancel('primary', 'gone');
      const { events, syncToken } = await h.source.readChanges('primary', null);
      expect(ids(events)).toEqual(['a']);
      expect(syncToken).toBeTruthy();
    });

    it('an incremental read returns only what changed', async () => {
      const h = await make();
      h.add(event('a', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00'));
      h.add(event('b', '2026-10-22T11:00:00+02:00', '2026-10-22T12:00:00+02:00'));
      const full = await h.source.readChanges('primary', null);

      const none = await h.source.readChanges('primary', full.syncToken);
      expect(none.events).toEqual([]);

      h.edit('primary', 'a', { title: 'Renamed' });
      const edited = await h.source.readChanges('primary', none.syncToken);
      expect(edited.events.map((e) => [e.id, e.title])).toEqual([['a', 'Renamed']]);

      h.cancel('primary', 'b');
      const cancelled = await h.source.readChanges('primary', edited.syncToken);
      expect(cancelled.events).toHaveLength(1);
      expect(cancelled.events[0]).toMatchObject({ id: 'b', status: 'cancelled', title: '', start: null, end: null });

      h.add(event('c', '2026-10-23T09:00:00+02:00', '2026-10-23T10:00:00+02:00'));
      const added = await h.source.readChanges('primary', cancelled.syncToken);
      expect(ids(added.events)).toEqual(['c']);
      expect(added.syncToken).toBeTruthy();
    });

    it('rejects an expired token, and a full read still works', async () => {
      const h = await make();
      h.add(event('a', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00'));
      const { syncToken } = await h.source.readChanges('primary', null);
      h.expireTokens();
      await expect(h.source.readChanges('primary', syncToken)).rejects.toBeInstanceOf(SyncTokenExpiredError);
      expect(ids((await h.source.readChanges('primary', null)).events)).toEqual(['a']);
    });

    it('readRange returns the instances overlapping the range', async () => {
      const h = await make();
      const series = { recurringEventId: 'daily' };
      h.add(event('daily_21', '2026-10-21T09:00:00+02:00', '2026-10-21T10:00:00+02:00', series));
      h.add(event('daily_22', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00', series));
      h.add(event('daily_23', '2026-10-23T09:00:00+02:00', '2026-10-23T10:00:00+02:00', series));
      h.add(event('overnight', '2026-10-21T22:00:00+02:00', '2026-10-22T01:00:00+02:00'));
      h.add(event('ends-at-start', '2026-10-21T23:00:00+02:00', '2026-10-22T00:00:00+02:00'));
      h.add(event('starts-at-end', '2026-10-23T00:00:00+02:00', '2026-10-23T01:00:00+02:00'));
      h.add(event('gone', '2026-10-22T12:00:00+02:00', '2026-10-22T13:00:00+02:00'));
      h.cancel('primary', 'gone');
      h.add(allDay('day-22', '2026-10-22', '2026-10-23'));
      h.add(allDay('day-23', '2026-10-23', '2026-10-24'));
      h.add(allDay('day-21', '2026-10-21', '2026-10-22'));
      const events = await h.source.readRange('primary', DAY_FROM, DAY_TO);
      expect(ids(events)).toEqual(['daily_22', 'day-22', 'overnight']);
    });

    it('names the green and red colour ids', async () => {
      const { source } = await make();
      expect(await source.colourIds()).toEqual({ green: '10', red: '11' });
    });

    it('a colour patch shows up in the next incremental read', async () => {
      const h = await make();
      h.add(event('a', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00', { response: 'accepted' }));
      const { syncToken } = await h.source.readChanges('primary', null);
      await h.source.setColour('primary', 'a', { colorId: '10', marker: 'green' });
      const { events } = await h.source.readChanges('primary', syncToken);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: 'a',
        colorId: '10',
        marker: 'green',
        title: 'Event a',
        start: { dateTime: '2026-10-22T09:00:00+02:00' },
        end: { dateTime: '2026-10-22T10:00:00+02:00' },
        response: 'accepted',
      });
    });

    it('a null patch clears the colour and the marker', async () => {
      const h = await make();
      h.add(event('a', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00', { colorId: '11', marker: 'red' }));
      await h.source.setColour('primary', 'a', { colorId: null, marker: null });
      const { events } = await h.source.readChanges('primary', null);
      expect(events[0]).toMatchObject({ id: 'a', colorId: null, marker: null });
    });

    it('a read-only sign-in cannot set a colour', async () => {
      const h = await make();
      h.add(event('a', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00'));
      h.readOnly(true);
      await expect(h.source.setColour('primary', 'a', { colorId: '10', marker: 'green' })).rejects.toBeInstanceOf(
        EditAccessRequiredError,
      );
      const { events } = await h.source.readChanges('primary', null);
      expect(events[0]).toMatchObject({ id: 'a', colorId: null, marker: null });
    });

    it('incremental reads stay within their calendar', async () => {
      const h = await make();
      const t = ['2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00'] as const;
      h.add(event('p1', ...t));
      h.add(event('p2', ...t));
      h.add(event('w1', ...t, { calendarId: 'work@example.com' }));
      h.add(event('w2', ...t, { calendarId: 'work@example.com' }));
      const p = await h.source.readChanges('primary', null);
      const w = await h.source.readChanges('work@example.com', null);
      h.edit('primary', 'p1', { title: 'P' });
      h.edit('work@example.com', 'w1', { title: 'W' });
      await h.source.setColour('work@example.com', 'w2', { colorId: '10', marker: 'green' });
      expect(ids((await h.source.readChanges('primary', p.syncToken)).events)).toEqual(['p1']);
      expect(ids((await h.source.readChanges('work@example.com', w.syncToken)).events)).toEqual(['w1', 'w2']);
    });

    it('keeps the events of each calendar apart', async () => {
      const h = await make();
      h.add(event('p', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00'));
      h.add(event('w', '2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00', { calendarId: 'work@example.com' }));
      expect(ids((await h.source.readChanges('primary', null)).events)).toEqual(['p']);
      expect(ids(await h.source.readRange('primary', DAY_FROM, DAY_TO))).toEqual(['p']);
      expect(ids((await h.source.readChanges('work@example.com', null)).events)).toEqual(['w']);
    });
  });
}
