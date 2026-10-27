import { SyncTokenExpiredError } from '@omark/time-core';
import type { CalendarEvent, CalendarInfo } from '@omark/time-core';
import { FakeCalendar } from '../src/fake.ts';

const BASE = '/calendar/v3/';
const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/;

/** Google's event palette (`colors.get`), as the spike read it. */
export const GOOGLE_PALETTE: Record<string, string> = {
  '1': '#a4bdfc',
  '2': '#7ae7bf',
  '3': '#dbadff',
  '4': '#ff887c',
  '5': '#fbd75b',
  '6': '#ffb878',
  '7': '#46d6db',
  '8': '#e1e1e1',
  '9': '#5484ed',
  '10': '#51b749',
  '11': '#dc2127',
};

export interface Call {
  method: string;
  url: URL;
  /** The path as sent, still percent-encoded. */
  rawPath: string;
  body: unknown;
  token: string | null;
}

type RateLimit = { status: 429; retryAfter?: string } | { status: 403; reason: 'rateLimitExceeded' | 'userRateLimitExceeded' } | { status: 503 };

/**
 * Google Calendar's REST API, in memory, for the endpoints `GoogleCalendarSource` calls. The state is a
 * `FakeCalendar` (the contract pins it to Google's behaviour); this adds the wire format, paging, Google's
 * error answers and the switches the tests need.
 */
export class GoogleFake {
  readonly calendar: FakeCalendar;
  readonly calls: Call[] = [];
  /** Items per page, for both the calendar list and events. */
  pageSize = 250;
  /** The next N answers are 401. */
  unauthorized = 0;
  /** Answered, one each, before the request is served. */
  rateLimits: RateLimit[] = [];
  /** Answered as they are, one each, before the request is served (after the rate limits). */
  answers: Response[] = [];
  /** The next N requests fail as if the network were down. */
  offline = 0;
  /** The sign-in has only `calendar.events.owned.readonly`. */
  readOnly = false;
  palette: Record<string, string> = { ...GOOGLE_PALETTE };
  readonly primaryEmail = 'me@example.com';

  private pages = new Map<string, { items: unknown[]; last: Record<string, unknown> }>();
  private nextPage = 0;

  constructor(calendars: CalendarInfo[]) {
    this.calendar = new FakeCalendar(calendars);
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const auth = new Headers(init?.headers).get('Authorization');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    this.calls.push({ method, url, rawPath: url.pathname, body, token: auth?.replace(/^Bearer /, '') ?? null });

    if (this.offline > 0) {
      this.offline -= 1;
      throw new TypeError('Failed to fetch');
    }
    if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith(BASE)) return notFound();
    if (!auth?.startsWith('Bearer ') || this.unauthorized > 0) {
      this.unauthorized = Math.max(0, this.unauthorized - 1);
      return error(401, 'authError', 'Invalid Credentials', 'UNAUTHENTICATED');
    }
    const limit = this.rateLimits.shift();
    if (limit) return rateLimitAnswer(limit);
    const answer = this.answers.shift();
    if (answer) return answer;

    const path = url.pathname.slice(BASE.length).split('/').map(decodeURIComponent);
    try {
      if (method === 'GET' && path.join('/') === 'users/me/calendarList') return this.calendarList(url);
      if (method === 'GET' && path.join('/') === 'colors') return this.colors();
      if (path[0] === 'calendars' && path[2] === 'events') {
        const calendarId = this.calendarId(path[1]!);
        if (calendarId === null) return notFound();
        if (method === 'GET' && path.length === 3) return await this.events(calendarId, url);
        if (method === 'PATCH' && path.length === 4) return await this.patch(calendarId, path[3]!, body);
      }
      return notFound();
    } catch (e) {
      if (e instanceof SyncTokenExpiredError) {
        return error(410, 'fullSyncRequired', 'Sync token is no longer valid, a full sync is required.', 'GONE', 'calendar');
      }
      throw e;
    }
  };

  private calendarId(id: string): string | null {
    const ids = this.calendar.toJSON().calendars.map((c) => c.id);
    if (id === this.primaryEmail) return 'primary';
    return ids.includes(id) ? id : null;
  }

  private calendarList(url: URL): Response {
    const items = this.calendar.toJSON().calendars.map((c) => ({
      kind: 'calendar#calendarListEntry',
      id: c.id === 'primary' ? this.primaryEmail : c.id,
      summary: c.primary ? this.primaryEmail : c.name,
      ...(c.primary ? { summaryOverride: c.name } : {}),
      timeZone: c.timeZone,
      accessRole: c.owned ? 'owner' : 'reader',
      ...(c.primary ? { primary: true } : {}),
    }));
    return this.page(url, items, { kind: 'calendar#calendarList' });
  }

  private colors(): Response {
    const event = Object.fromEntries(Object.entries(this.palette).map(([id, background]) => [id, { background, foreground: '#1d1d1d' }]));
    return json(200, { kind: 'calendar#colors', calendar: {}, event });
  }

  private async events(calendarId: string, url: URL): Promise<Response> {
    const q = url.searchParams;
    if (q.has('pageToken')) return this.page(url, [], {});
    const token = q.get('syncToken');
    if (token !== null && ['timeMin', 'timeMax', 'showDeleted', 'orderBy', 'q', 'updatedMin'].some((p) => q.has(p))) {
      return error(400, 'invalid', 'Sync token cannot be used with other request restrictions.', 'INVALID_ARGUMENT');
    }
    if (q.get('singleEvents') !== 'true') return error(400, 'invalid', 'This test emulation only answers singleEvents=true.', 'INVALID_ARGUMENT');
    const tz = this.calendar.toJSON().calendars.find((c) => c.id === calendarId)!.timeZone;
    if (q.has('timeMin') || q.has('timeMax')) {
      // Google answers 400 Bad Request to a time without seconds or offset.
      if (![q.get('timeMin'), q.get('timeMax')].every((t) => t !== null && RFC3339.test(t))) {
        return error(400, 'badRequest', 'Bad Request', 'INVALID_ARGUMENT');
      }
      const events = await this.calendar.readRange(calendarId, q.get('timeMin')!, q.get('timeMax')!);
      return this.page(url, events.map((e) => this.toGoogle(e)), { kind: 'calendar#events', timeZone: tz });
    }
    const { events, syncToken } = await this.calendar.readChanges(calendarId, token);
    return this.page(url, events.map((e) => this.toGoogle(e)), { kind: 'calendar#events', timeZone: tz, nextSyncToken: syncToken });
  }

  private async patch(calendarId: string, eventId: string, body: unknown): Promise<Response> {
    if (this.readOnly) {
      return error(403, 'insufficientPermissions', 'Request had insufficient authentication scopes.', 'PERMISSION_DENIED');
    }
    const event = this.calendar.toJSON().events.find((e) => e.calendarId === calendarId && e.id === eventId);
    if (!event) return notFound();
    if (event.status === 'cancelled') return error(410, 'deleted', 'Resource has been deleted', 'GONE');
    const b = (body ?? {}) as { colorId?: string | null; extendedProperties?: { private?: { omarkTime?: string | null } } };
    const marker = b.extendedProperties?.private && 'omarkTime' in b.extendedProperties.private ? b.extendedProperties.private.omarkTime : event.marker;
    await this.calendar.setColour(calendarId, eventId, {
      colorId: 'colorId' in b ? (b.colorId ?? null) : event.colorId,
      marker: marker === 'green' || marker === 'red' ? marker : null,
    });
    const after = this.calendar.toJSON().events.find((e) => e.calendarId === calendarId && e.id === eventId)!;
    return json(200, this.toGoogle(after));
  }

  /** The first page, or the next one; `last` (the sync token) goes only on the last page. */
  private page(url: URL, items: unknown[], last: Record<string, unknown>): Response {
    const token = url.searchParams.get('pageToken');
    let rest = { items, last };
    if (token !== null) {
      const saved = this.pages.get(token);
      if (!saved) return error(400, 'invalid', 'Invalid page token.', 'INVALID_ARGUMENT');
      this.pages.delete(token);
      rest = saved;
    }
    const max = Math.min(this.pageSize, Number(url.searchParams.get('maxResults') ?? 250));
    const now = rest.items.slice(0, max);
    const later = rest.items.slice(max);
    if (later.length === 0) return json(200, { ...rest.last, items: now });
    const next = `page-${++this.nextPage}`;
    this.pages.set(next, { items: later, last: rest.last });
    const { nextSyncToken: _, ...meta } = rest.last;
    return json(200, { ...meta, items: now, nextPageToken: next });
  }

  /** What Google sends for an event; a cancelled one has only its id, status and series fields. */
  private toGoogle(e: CalendarEvent): Record<string, unknown> {
    const series = e.recurringEventId ? { recurringEventId: e.recurringEventId } : {};
    if (e.status === 'cancelled') return { kind: 'calendar#event', id: e.id, status: 'cancelled', ...series };
    return {
      kind: 'calendar#event',
      id: e.id,
      status: e.status,
      ...(e.htmlLink ? { htmlLink: e.htmlLink } : {}),
      ...(e.title ? { summary: e.title } : {}),
      start: e.start,
      end: e.end,
      ...(e.colorId ? { colorId: e.colorId } : {}),
      ...(e.response
        ? {
            attendees: [
              { email: 'boss@example.com', organizer: true, responseStatus: 'accepted' },
              { email: this.primaryEmail, self: true, responseStatus: e.response },
            ],
          }
        : {}),
      ...(e.marker ? { extendedProperties: { private: { omarkTime: e.marker } } } : {}),
      ...series,
    };
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function error(code: number, reason: string, message: string, status: string, domain = 'global', headers: Record<string, string> = {}): Response {
  return json(code, { error: { code, message, errors: [{ domain, reason, message }], status } }, headers);
}

/** A Google error answer with its reason only in `details` (the newer format), or with no reason at all. */
export function googleError(code: number, detailsReason?: string): Response {
  const details = detailsReason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: detailsReason }] : [];
  return json(code, { error: { code, message: `Error ${code}`, status: 'X', details } });
}

function notFound(): Response {
  return error(404, 'notFound', 'Not Found', 'NOT_FOUND');
}

function rateLimitAnswer(limit: RateLimit): Response {
  if (limit.status === 429) {
    return error(429, 'rateLimitExceeded', 'Rate Limit Exceeded', 'RESOURCE_EXHAUSTED', 'usageLimits', limit.retryAfter ? { 'Retry-After': limit.retryAfter } : {});
  }
  if (limit.status === 403) return error(403, limit.reason, 'Rate Limit Exceeded', 'PERMISSION_DENIED', 'usageLimits');
  return error(503, 'backendError', 'Backend Error', 'UNAVAILABLE');
}
