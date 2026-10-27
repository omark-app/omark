/**
 * Manual check of GoogleCalendarSource against the real API, on the calendar named "Omark Test" only.
 * It never reads events from, or writes to, any other calendar, and prints no event titles.
 *
 *   GOOGLE_TOKEN_FILE=<token.json> [GOOGLE_CLIENT_FILE=<client.json>] pnpm --filter @omark/calendar check:google [--wait-for-edit] [--add-all-day]
 *
 * `--wait-for-edit` pauses for an edit made by hand. `--add-all-day` adds an all-day event "Omark check" to the
 * test calendar for tomorrow when it has none, so the readRange step has one to look at.
 *
 * The token file holds `access_token`, or `refresh_token` when the client file (Google's OAuth client JSON)
 * is given too. Neither is printed. Edit access (`calendar.events.owned`) is needed for the colour steps.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { addDays, formatLocal, startOfDay } from '@omark/time-core';
import type { CalendarEvent } from '@omark/time-core';
import { GoogleCalendarSource } from '../src/google.ts';

const TEST_CALENDAR = 'Omark Test';

async function accessToken(): Promise<string> {
  const tokenFile = process.env.GOOGLE_TOKEN_FILE;
  if (!tokenFile) throw new Error('Set GOOGLE_TOKEN_FILE');
  const token = JSON.parse(readFileSync(tokenFile, 'utf8')) as { access_token?: string; refresh_token?: string };
  const clientFile = process.env.GOOGLE_CLIENT_FILE;
  if (!clientFile) {
    if (!token.access_token) throw new Error('The token file has no access_token');
    return token.access_token;
  }
  const { web } = JSON.parse(readFileSync(clientFile, 'utf8')) as { web: { client_id: string; client_secret: string } };
  if (!token.refresh_token) throw new Error('The token file has no refresh_token');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: web.client_id,
      client_secret: web.client_secret,
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!body.access_token) throw new Error(`The token refresh failed: ${body.error ?? res.status}`);
  return body.access_token;
}

const live = (events: CalendarEvent[]) => events.filter((e) => e.status !== 'cancelled');
const isAllDay = (e: CalendarEvent) => e.start !== null && 'date' in e.start;

/** Counts only: what kind of events a read returned. */
function describe(events: CalendarEvent[]): string {
  const cancelled = events.filter((e) => e.status === 'cancelled').length;
  const series = events.filter((e) => e.recurringEventId !== null).length;
  return `${events.length} events (${cancelled} cancelled, ${series} instances of a series)`;
}

const eventUrl = (calendarId: string, eventId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

/** Raw reads and writes outside GoogleCalendarSource, to check what it can't see; on the test calendar only. */
async function raw(token: string, url: string, method = 'GET', body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(url + (method === 'GET' ? '' : '?sendUpdates=none'), {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} failed: ${res.status}`);
  return (await res.json()) as Record<string, any>;
}

/** For --add-all-day. */
async function addAllDay(token: string, calendarId: string): Promise<void> {
  const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const next = new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  await raw(token, url, 'POST', { summary: 'Omark check', start: { date: day }, end: { date: next } });
  console.log(`Added an all-day event on ${day}`);
}

async function main() {
  const token = await accessToken();
  const source = new GoogleCalendarSource({ getToken: async () => token });
  const calendars = await source.listCalendars();
  const test = calendars.filter((c) => c.name === TEST_CALENDAR);
  if (test.length !== 1) throw new Error(`Expected one owned calendar named "${TEST_CALENDAR}", found ${test.length}`);
  const id = test[0]!.id;
  if (id === 'primary') throw new Error(`"${TEST_CALENDAR}" must not be the primary calendar`);
  console.log(`Owned calendars: ${calendars.length}; "${TEST_CALENDAR}" time zone ${test[0]!.timeZone}`);
  console.log('Colour ids:', await source.colourIds());

  if (process.argv.includes('--add-all-day') && !live((await source.readChanges(id, null)).events).some(isAllDay)) {
    await addAllDay(token, id);
  }
  const full = await source.readChanges(id, null);
  console.log(`Full read: ${describe(full.events)}`);
  let token1 = full.syncToken;
  const none = await source.readChanges(id, token1);
  console.log(`Incremental read with no change: ${describe(none.events)}`);
  token1 = none.syncToken;

  if (process.argv.includes('--wait-for-edit')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(`Edit one event in "${TEST_CALENDAR}" in Google Calendar, then press Enter. `);
    rl.close();
    const edited = await source.readChanges(id, token1);
    console.log(`Incremental read after your edit: ${describe(edited.events)}`);
    token1 = edited.syncToken;
  }

  const target = live(full.events).find((e) => e.colorId === null && e.marker === null);
  if (!target) {
    console.log('No uncoloured event to try colours on; add one to the test calendar and run again.');
  } else {
    const { green } = await source.colourIds();
    // Another app's private property must survive our patches.
    await raw(token, eventUrl(id, target.id), 'PATCH', { extendedProperties: { private: { omarkCheck: 'other app' } } });
    const { syncToken: beforeColour } = await source.readChanges(id, token1);
    token1 = beforeColour;
    await source.setColour(id, target.id, { colorId: green, marker: 'green' });
    const set = await source.readChanges(id, token1);
    const after = set.events.find((e) => e.id === target.id);
    console.log(`Coloured one ${target.recurringEventId ? 'instance of a series' : 'single event'}`);
    console.log(`After setting green: ${describe(set.events)}; colorId ${after?.colorId}, marker ${after?.marker}`);
    console.log(`  title, start, end and reply unchanged: ${sameExceptColour(target, after)}`);
    await source.setColour(id, target.id, { colorId: null, marker: null });
    const cleared = await source.readChanges(id, set.syncToken);
    const back = cleared.events.find((e) => e.id === target.id);
    console.log(`After clearing: ${describe(cleared.events)}; colorId ${back?.colorId}, marker ${back?.marker}`);
    const left = await raw(token, eventUrl(id, target.id));
    const priv = (left.extendedProperties?.private ?? {}) as Record<string, string>;
    console.log(`  raw: colorId present ${'colorId' in left}, omarkTime present ${'omarkTime' in priv}, other app's key kept ${priv.omarkCheck === 'other app'}`);
    await raw(token, eventUrl(id, target.id), 'PATCH', { extendedProperties: { private: { omarkCheck: null } } });
  }

  const allDay = live(full.events).find(isAllDay);
  if (!allDay) {
    console.log('No all-day event: the readRange check is skipped (run with --add-all-day).');
  } else {
    // Google places all-day events in the calendar's zone, so the ranges are built in it too.
    const tz = test[0]!.timeZone;
    const at = (date: string, hours = 0) => formatLocal(startOfDay(date, tz) + hours * 3_600_000, tz);
    const start = (allDay.start as { date: string }).date;
    const end = (allDay.end as { date: string }).date;
    const dayAfterEnd = await source.readRange(id, at(end), at(addDays(end, 1)));
    const during = await source.readRange(id, at(start, 12), at(start, 13));
    console.log(`readRange: the all-day event is in a range during it: ${during.some((e) => e.id === allDay.id)}`);
    console.log(`readRange: and not in the day after it ends: ${!dayAfterEnd.some((e) => e.id === allDay.id)}`);
  }
}

function sameExceptColour(a: CalendarEvent, b: CalendarEvent | undefined): boolean {
  if (!b) return false;
  const pick = (e: CalendarEvent) => JSON.stringify([e.title, e.start, e.end, e.response, e.status]);
  return pick(a) === pick(b);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
