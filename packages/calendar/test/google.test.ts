import { describe, expect, test } from 'vitest';
import { AuthRequiredError, OfflineError } from '@omark/storage';
import { EditAccessRequiredError, SyncTokenExpiredError } from '@omark/time-core';
import type { CalendarEvent, CalendarInfo } from '@omark/time-core';
import { calendarContract } from '../src/contract.ts';
import { GoogleCalendarError, GoogleCalendarSource } from '../src/google.ts';
import type { GoogleCalendarOptions } from '../src/google.ts';
import { GoogleFake, googleError } from './google-fake.ts';

const CALENDARS: CalendarInfo[] = [
  { id: 'primary', name: 'AL', primary: true, timeZone: 'Europe/Warsaw', owned: true },
  { id: 'work@example.com', name: 'Work', primary: false, timeZone: 'Europe/Warsaw', owned: true },
  { id: 'team@example.com', name: 'Team', primary: false, timeZone: 'Europe/Warsaw', owned: false },
];

/** A fake clock: sleeping moves it on at once. */
function clock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function setup(calendars: CalendarInfo[] = CALENDARS, opts: Partial<GoogleCalendarOptions> = {}) {
  const google = new GoogleFake(calendars);
  const time = clock();
  const tokens: (string | undefined)[] = [];
  let n = 0;
  const source = new GoogleCalendarSource({
    getToken: async (o) => {
      tokens.push(o?.fresh ? 'fresh' : undefined);
      return `token-${++n}`;
    },
    fetch: google.fetch,
    sleep: time.sleep,
    now: time.now,
    ...opts,
  });
  return { google, source, time, tokens };
}

calendarContract('GoogleCalendarSource', () => {
  const { google, source } = setup();
  return {
    source,
    add: (e) => google.calendar.add(e),
    edit: (c, id, changes) => google.calendar.edit(c, id, changes),
    cancel: (c, id) => google.calendar.cancel(c, id),
    expireTokens: () => google.calendar.expireTokens(),
    readOnly: (on) => {
      google.readOnly = on;
    },
  };
});

function event(id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    calendarId: 'primary',
    id,
    status: 'confirmed',
    title: `Event ${id}`,
    start: { dateTime: '2026-10-22T09:00:00+02:00' },
    end: { dateTime: '2026-10-22T10:00:00+02:00' },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...extra,
  };
}

const eventCalls = (google: GoogleFake) => google.calls.filter((c) => c.url.pathname.endsWith('/events'));

describe('reads', () => {
  test('follows every page and keeps the token from the last one', async () => {
    const { google, source } = setup();
    for (const id of ['a', 'b', 'c', 'd', 'e']) google.calendar.add(event(id));
    google.pageSize = 2;
    const { events, syncToken } = await source.readChanges('primary', null);
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(eventCalls(google)).toHaveLength(3);
    expect(syncToken).toBe((await google.calendar.readChanges('primary', null)).syncToken);
    google.calendar.edit('primary', 'c', { title: 'C' });
    expect((await source.readChanges('primary', syncToken)).events.map((e) => e.id)).toEqual(['c']);
  });

  test('pages the calendar list too', async () => {
    const { google, source } = setup();
    google.pageSize = 1;
    expect((await source.listCalendars()).map((c) => c.id).sort()).toEqual(['primary', 'work@example.com']);
    expect(google.calls.filter((c) => c.url.pathname.endsWith('/calendarList'))).toHaveLength(3);
  });

  test('a calendar is named by its override, else its summary', async () => {
    const { source } = setup();
    const list = await source.listCalendars();
    expect(list.map((c) => c.name).sort()).toEqual(['AL', 'Work']);
  });

  test('encodes calendar ids with # and @ in the path', async () => {
    const id = 'en.polish#holiday@group.v.calendar.google.com';
    const { google, source } = setup([...CALENDARS, { id, name: 'Holidays', primary: false, timeZone: 'Europe/Warsaw', owned: true }]);
    google.calendar.add(event('h', { calendarId: id }));
    const { events } = await source.readChanges(id, null);
    expect(events.map((e) => [e.calendarId, e.id])).toEqual([[id, 'h']]);
    expect(eventCalls(google)[0]!.rawPath).toBe('/calendar/v3/calendars/en.polish%23holiday%40group.v.calendar.google.com/events');
    await source.setColour(id, 'h', { colorId: '10', marker: 'green' });
    expect(google.calls.at(-1)!.rawPath).toBe('/calendar/v3/calendars/en.polish%23holiday%40group.v.calendar.google.com/events/h');
  });

  test('maps the reply, the marker, the series and the link', async () => {
    const { google, source } = setup();
    google.calendar.add(
      event('a', { response: 'needsAction', marker: 'red', colorId: '11', recurringEventId: 'series', htmlLink: 'https://calendar.google.com/x' }),
    );
    const { events } = await source.readChanges('primary', null);
    expect(events[0]).toEqual(
      event('a', { response: 'needsAction', marker: 'red', colorId: '11', recurringEventId: 'series', htmlLink: 'https://calendar.google.com/x' }),
    );
  });

  test('a marker that is not green or red reads as none', async () => {
    const { google } = setup();
    google.calendar.add(event('a'));
    const base = google.fetch;
    google.fetch = async (input, init) => {
      const res = await base(input, init);
      const body = await res.json();
      for (const item of body.items ?? []) item.extendedProperties = { private: { omarkTime: 'blue' } };
      return new Response(JSON.stringify(body), { status: res.status });
    };
    const source2 = new GoogleCalendarSource({ getToken: async () => 't', fetch: google.fetch });
    expect((await source2.readChanges('primary', null)).events[0]!.marker).toBeNull();
  });

  test('a full read leaves out cancelled items even if Google sends them', async () => {
    const { google } = setup();
    google.calendar.add(event('a'));
    const base = google.fetch;
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const res = await base(input, init);
      const body = await res.json();
      if (Array.isArray(body.items)) body.items.push({ id: 'gone', status: 'cancelled' });
      return new Response(JSON.stringify(body), { status: res.status });
    };
    const source = new GoogleCalendarSource({ getToken: async () => 't', fetch });
    expect((await source.readChanges('primary', null)).events.map((e) => e.id)).toEqual(['a']);
  });

  test('never sends timeMin, timeMax or showDeleted with a sync token', async () => {
    const { google, source } = setup();
    google.calendar.add(event('a'));
    const { syncToken } = await source.readChanges('primary', null);
    await source.readChanges('primary', syncToken);
    await source.readRange('primary', '2026-10-22T00:00:00+02:00', '2026-10-23T00:00:00+02:00');
    for (const call of eventCalls(google)) {
      const q = call.url.searchParams;
      expect(q.get('singleEvents')).toBe('true');
      expect(q.has('showDeleted')).toBe(false);
      if (q.has('syncToken')) expect(q.has('timeMin') || q.has('timeMax')).toBe(false);
    }
    expect(eventCalls(google).map((c) => c.url.searchParams.has('syncToken'))).toEqual([false, true, false]);
  });

  test('any 410 to a sync token means a full read, whatever the reason', async () => {
    const { google, source } = setup();
    const { syncToken } = await source.readChanges('primary', null);
    google.answers = [googleError(410)];
    await expect(source.readChanges('primary', syncToken)).rejects.toBeInstanceOf(SyncTokenExpiredError);
    google.answers = [googleError(410)];
    await expect(source.readChanges('primary', null)).rejects.toThrow(GoogleCalendarError);
  });

  test('a read with no sync token on its last page is an error', async () => {
    const { google, source } = setup();
    google.answers = [new Response(JSON.stringify({ items: [] }), { status: 200 })];
    await expect(source.readChanges('primary', null)).rejects.toThrow(/no sync token/);
  });

  test('readRange sends full RFC 3339 times, even for minute-precision input', async () => {
    const { google, source } = setup();
    google.calendar.add(event('a'));
    const events = await source.readRange('primary', '2026-10-22T00:00+02:00', '2026-10-23T00:00+02:00');
    expect(events.map((e) => e.id)).toEqual(['a']);
    const q = eventCalls(google)[0]!.url.searchParams;
    expect([q.get('timeMin'), q.get('timeMax')]).toEqual(['2026-10-21T22:00:00.000Z', '2026-10-22T22:00:00.000Z']);
  });

  test('keeps a tentative status', async () => {
    const { google, source } = setup();
    google.calendar.add(event('a', { status: 'tentative' }));
    expect((await source.readChanges('primary', null)).events[0]!.status).toBe('tentative');
  });
});

describe('errors and retries', () => {
  test('backs off 1 s then 2 s on two 429s', async () => {
    const { google, source, time } = setup();
    google.rateLimits = [{ status: 429 }, { status: 429 }];
    expect(await source.listCalendars()).toHaveLength(2);
    expect(time.sleeps).toEqual([1000, 2000]);
  });

  test('waits as long as Retry-After says', async () => {
    const { google, source, time } = setup();
    google.rateLimits = [{ status: 429, retryAfter: '7' }];
    await source.listCalendars();
    expect(time.sleeps).toEqual([7000]);
  });

  test('retries 403 rate limits and 503s', async () => {
    const { google, source, time } = setup();
    google.rateLimits = [{ status: 403, reason: 'rateLimitExceeded' }, { status: 403, reason: 'userRateLimitExceeded' }, { status: 503 }];
    await source.colourIds();
    expect(time.sleeps).toEqual([1000, 2000, 4000]);
  });

  test('a Retry-After over a minute waits a minute', async () => {
    const { google, source, time } = setup();
    google.rateLimits = [{ status: 429, retryAfter: '3600' }];
    await source.listCalendars();
    expect(time.sleeps).toEqual([60_000]);
  });

  test('a Retry-After date waits until then', async () => {
    const { google, source, time } = setup();
    google.rateLimits = [{ status: 429, retryAfter: new Date(30_000).toUTCString() }];
    await source.listCalendars();
    expect(time.sleeps).toEqual([30_000]);
  });

  test('a 403 for another reason is not retried', async () => {
    const { google, source, time } = setup();
    google.answers = [googleError(403, 'forbiddenForNonOrganizer')];
    await expect(source.listCalendars()).rejects.toThrow(/403/);
    expect(time.sleeps).toEqual([]);
  });

  test('a missing read scope means signing in again, not edit access', async () => {
    const { google, source } = setup();
    google.answers = [googleError(403, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')];
    await expect(source.readChanges('primary', null)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  test('gives up on 5xx after maxRetries', async () => {
    const { google, source, time } = setup(CALENDARS, { maxRetries: 1 });
    google.rateLimits = [{ status: 503 }, { status: 503 }];
    await expect(source.listCalendars()).rejects.toThrow(/503/);
    expect(time.sleeps).toEqual([1000]);
  });

  test('gives up after maxRetries', async () => {
    const { google, source, time } = setup(CALENDARS, { maxRetries: 2 });
    google.rateLimits = [{ status: 429 }, { status: 429 }, { status: 429 }];
    await expect(source.listCalendars()).rejects.toThrow(/429/);
    expect(time.sleeps).toEqual([1000, 2000]);
  });

  test('a 401 gets a fresh token and one retry', async () => {
    const { google, source, tokens } = setup();
    google.unauthorized = 1;
    expect(await source.listCalendars()).toHaveLength(2);
    expect(tokens).toEqual([undefined, 'fresh']);
    expect(google.calls.map((c) => c.token)).toEqual(['token-1', 'token-2']);
  });

  test('after a 401, later retries use the fresh token as usual', async () => {
    const { google, source, tokens } = setup();
    google.unauthorized = 1;
    google.answers = [googleError(429), googleError(429)];
    await source.listCalendars();
    expect(tokens).toEqual([undefined, 'fresh', undefined, undefined]);
  });

  test('a second 401 means signing in again', async () => {
    const { google, source } = setup();
    google.unauthorized = 2;
    await expect(source.listCalendars()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(google.calls).toHaveLength(2);
  });

  test('no network is OfflineError', async () => {
    const { google, source } = setup();
    google.offline = 1;
    await expect(source.listCalendars()).rejects.toBeInstanceOf(OfflineError);
  });

  test('a request that never answers times out as OfflineError', async () => {
    const source = new GoogleCalendarSource({
      getToken: async () => 't',
      fetch: (_input, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      timeoutMs: 10,
    });
    await expect(source.listCalendars()).rejects.toBeInstanceOf(OfflineError);
  });

  test('a token that never comes times out as OfflineError', async () => {
    const source = new GoogleCalendarSource({ getToken: () => new Promise(() => {}), timeoutMs: 10 });
    await expect(source.listCalendars()).rejects.toBeInstanceOf(OfflineError);
  });

  test('a fetch that ignores the abort still times out', async () => {
    const source = new GoogleCalendarSource({ getToken: async () => 't', fetch: () => new Promise(() => {}), timeoutMs: 10 });
    await expect(source.listCalendars()).rejects.toBeInstanceOf(OfflineError);
  });

  test('any other answer is an error with the status', async () => {
    const { source } = setup();
    await expect(source.readChanges('nope@example.com', null)).rejects.toThrow(/404/);
  });
});

describe('colours', () => {
  test('a patch sends only the colour and the marker, with sendUpdates=none', async () => {
    const { google, source } = setup();
    google.calendar.add(event('abc'));
    await source.setColour('primary', 'abc', { colorId: '10', marker: 'green' });
    const call = google.calls.at(-1)!;
    expect(call.method).toBe('PATCH');
    expect(call.rawPath).toBe('/calendar/v3/calendars/primary/events/abc');
    expect([...call.url.searchParams]).toEqual([['sendUpdates', 'none']]);
    expect(JSON.stringify(call.body)).toBe('{"colorId":"10","extendedProperties":{"private":{"omarkTime":"green"}}}');
  });

  test('clearing sends null for both', async () => {
    const { google, source } = setup();
    google.calendar.add(event('abc', { colorId: '10', marker: 'green' }));
    await source.setColour('primary', 'abc', { colorId: null, marker: null });
    expect(JSON.stringify(google.calls.at(-1)!.body)).toBe('{"colorId":null,"extendedProperties":{"private":{"omarkTime":null}}}');
  });

  test('read-only access is EditAccessRequiredError, with no retry', async () => {
    const { google, source, time } = setup();
    google.calendar.add(event('abc'));
    google.readOnly = true;
    await expect(source.setColour('primary', 'abc', { colorId: '10', marker: 'green' })).rejects.toBeInstanceOf(EditAccessRequiredError);
    expect(google.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(time.sleeps).toEqual([]);
  });

  test('patches are at least 200 ms apart, even when called together', async () => {
    const { google, time } = setup();
    for (const id of ['a', 'b', 'c']) google.calendar.add(event(id));
    const at: number[] = [];
    const base = google.fetch;
    google.fetch = async (input, init) => {
      if (init?.method === 'PATCH') at.push(time.now());
      return base(input, init);
    };
    const s = new GoogleCalendarSource({ getToken: async () => 't', fetch: google.fetch, sleep: time.sleep, now: time.now });
    await Promise.all(['a', 'b', 'c'].map((id) => s.setColour('primary', id, { colorId: '10', marker: 'green' })));
    expect(at).toEqual([0, 200, 400]);
  });

  test('no wait when the last patch was long ago', async () => {
    const { google, source, time } = setup();
    for (const id of ['a', 'b']) google.calendar.add(event(id));
    await source.setColour('primary', 'a', { colorId: '10', marker: 'green' });
    time.advance(500);
    await source.setColour('primary', 'b', { colorId: '10', marker: 'green' });
    expect(time.sleeps).toEqual([]);
  });

  test('a failed patch does not hold up the next one', async () => {
    const { google, source } = setup();
    google.calendar.add(event('b'));
    google.answers = [googleError(400)];
    await expect(source.setColour('primary', 'b', { colorId: '10', marker: 'green' })).rejects.toThrow(/400/);
    await source.setColour('primary', 'b', { colorId: '10', marker: 'green' });
    expect((await google.calendar.readChanges('primary', null)).events[0]!.colorId).toBe('10');
  });

  test('a patch on a deleted or vanished event is done: nothing left to colour', async () => {
    const { google, source } = setup();
    google.calendar.add(event('a'));
    google.calendar.cancel('primary', 'a');
    await expect(source.setColour('primary', 'a', { colorId: '10', marker: 'green' })).resolves.toBeUndefined();
    await expect(source.setColour('primary', 'never', { colorId: '10', marker: 'green' })).resolves.toBeUndefined();
    expect(google.calls.filter((c) => c.method === 'PATCH').map((c) => c.rawPath.split('/').at(-1))).toEqual(['a', 'never']);
  });

  test('a missing edit scope reported only in details is EditAccessRequiredError', async () => {
    const { google, source } = setup();
    google.calendar.add(event('a'));
    google.answers = [googleError(403, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')];
    await expect(source.setColour('primary', 'a', { colorId: '10', marker: 'green' })).rejects.toBeInstanceOf(EditAccessRequiredError);
  });

  test('colourIds picks green and red by background', async () => {
    const { google, source } = setup();
    google.palette = { '3': '#dc2127', '4': '#51B749', '10': '#ffffff' };
    expect(await source.colourIds()).toEqual({ green: '4', red: '3' });
  });

  test('colourIds falls back to 10 and 11', async () => {
    const { google, source } = setup();
    google.palette = { '1': '#a4bdfc' };
    expect(await source.colourIds()).toEqual({ green: '10', red: '11' });
  });

  test('colourIds asks again after a failure', async () => {
    const { google, source } = setup();
    google.answers = [googleError(400)];
    await expect(source.colourIds()).rejects.toThrow(/400/);
    expect(await source.colourIds()).toEqual({ green: '10', red: '11' });
  });

  test('colourIds asks Google once', async () => {
    const { google, source } = setup();
    await source.colourIds();
    await source.colourIds();
    expect(google.calls.filter((c) => c.url.pathname.endsWith('/colors'))).toHaveLength(1);
  });
});
