import { AuthRequiredError, OfflineError } from '@omark/storage';
import { EditAccessRequiredError, SyncTokenExpiredError, parseInstant } from '@omark/time-core';
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarSource,
  ChangesResult,
  ColourPatch,
  EventTime,
  ResponseStatus,
  TrackerColour,
} from '@omark/time-core';

const API = 'https://www.googleapis.com/calendar/v3';
/** Google's most per page. */
const PAGE = 2500;
const GREEN = '#51b749';
const RED = '#dc2127';
const DEFAULT_TIMEOUT_MS = 20_000;
/** A longer Retry-After would stall the sync; Google's per-minute quota refills within this. */
const MAX_RETRY_AFTER_MS = 60_000;

export interface GoogleCalendarOptions {
  /** `fresh`: Google rejected the last token, so get a new one. `@omark/storage`'s `Auth` fits. */
  getToken(opts?: { fresh?: boolean }): Promise<string>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Minimum gap between colour patches. Default 200 (300 a minute; Google allows 600). */
  patchIntervalMs?: number;
  /** Retries on 429, 403 rate limit and 5xx. Default 5. */
  maxRetries?: number;
  /** Per request, body included; a request that takes longer fails with `OfflineError`. Default 20 s. */
  timeoutMs?: number;
}

/** A Google answer this source has no meaning for. */
export class GoogleCalendarError extends Error {
  override name = 'GoogleCalendarError';
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The parts of Google's event resource the tracker reads. */
interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  colorId?: string;
  extendedProperties?: { private?: Record<string, string> };
  recurringEventId?: string;
  htmlLink?: string;
}

interface GoogleError {
  error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
}

/**
 * Google Calendar's REST API, called from the browser with the sign-in helper's access token. Reads use
 * `singleEvents=true`, so each instance of a series is its own event. The only write is a colour patch:
 * `colorId` and the private extended property `omarkTime`, with `sendUpdates=none`, spaced at least
 * `patchIntervalMs` apart.
 */
export class GoogleCalendarSource implements CalendarSource {
  private getToken: GoogleCalendarOptions['getToken'];
  private fetchFn: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;
  private patchIntervalMs: number;
  private maxRetries: number;
  private timeoutMs: number;
  private colours: Promise<Record<TrackerColour, string>> | null = null;
  /** Patches run one at a time, in call order. */
  private patches: Promise<void> = Promise.resolve();
  private lastPatchAt = -Infinity;

  constructor(opts: GoogleCalendarOptions) {
    this.getToken = opts.getToken;
    this.fetchFn = opts.fetch ?? ((...args) => globalThis.fetch(...args));
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = opts.now ?? Date.now;
    this.patchIntervalMs = opts.patchIntervalMs ?? 200;
    this.maxRetries = opts.maxRetries ?? 5;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    type Entry = { id: string; summary?: string; summaryOverride?: string; timeZone?: string; accessRole?: string; primary?: boolean };
    const entries = await this.pages<Entry>(`${API}/users/me/calendarList`, new URLSearchParams({ maxResults: '250' }));
    return entries
      .filter((c) => c.accessRole === 'owner')
      .map((c) => ({
        id: c.primary ? 'primary' : c.id,
        name: c.summaryOverride ?? c.summary ?? c.id,
        primary: c.primary === true,
        timeZone: c.timeZone ?? 'UTC',
        owned: true,
      }));
  }

  async readChanges(calendarId: string, syncToken: string | null): Promise<ChangesResult> {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: String(PAGE) });
    // Google refuses a sync token with any other restriction (timeMin, showDeleted, …).
    if (syncToken !== null) params.set('syncToken', syncToken);
    let nextSyncToken: string | undefined;
    let items: GoogleEvent[];
    try {
      items = await this.pages<GoogleEvent>(this.eventsUrl(calendarId), params, (page) => {
        nextSyncToken = page.nextSyncToken as string | undefined;
      });
    } catch (e) {
      // Google documents 410 `fullSyncRequired`; any 410 to a sync token means the same: read it all again.
      if (syncToken !== null && e instanceof GoogleCalendarError && e.status === 410) throw new SyncTokenExpiredError(e.message);
      throw e;
    }
    if (!nextSyncToken) throw new GoogleCalendarError(200, 'Google Calendar sent no sync token');
    const events = items.map((e) => toEvent(calendarId, e));
    // A full read never has cancelled events; Google leaves them out, this makes sure.
    return { events: syncToken === null ? events.filter((e) => e.status !== 'cancelled') : events, syncToken: nextSyncToken };
  }

  async readRange(calendarId: string, from: string, to: string): Promise<CalendarEvent[]> {
    // Google wants seconds and an offset; time-core's times may have minutes only.
    const utc = (t: string) => new Date(parseInstant(t)).toISOString();
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: String(PAGE), timeMin: utc(from), timeMax: utc(to) });
    const items = await this.pages<GoogleEvent>(this.eventsUrl(calendarId), params);
    return items.map((e) => toEvent(calendarId, e)).filter((e) => e.status !== 'cancelled');
  }

  colourIds(): Promise<Record<TrackerColour, string>> {
    this.colours ??= this.call(`${API}/colors`, {}).then((body) => {
      const palette = Object.entries((body as { event?: Record<string, { background?: string }> }).event ?? {});
      const find = (hex: string) => palette.find(([, c]) => c.background?.toLowerCase() === hex)?.[0];
      return { green: find(GREEN) ?? '10', red: find(RED) ?? '11' };
    });
    this.colours.catch(() => {
      this.colours = null;
    });
    return this.colours;
  }

  setColour(calendarId: string, eventId: string, patch: ColourPatch): Promise<void> {
    const turn = this.patches.then(() => this.patchNow(calendarId, eventId, patch));
    this.patches = turn.catch(() => {});
    return turn;
  }

  private async patchNow(calendarId: string, eventId: string, patch: ColourPatch): Promise<void> {
    const wait = this.lastPatchAt + this.patchIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastPatchAt = this.now();
    // null removes a field in a PATCH. Only our own key under `private`; Google keeps the others.
    const body = JSON.stringify({ colorId: patch.colorId, extendedProperties: { private: { omarkTime: patch.marker } } });
    const url = `${this.eventsUrl(calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=none`;
    try {
      await this.call(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    } catch (e) {
      // Deleted (410) or gone for good (404) since it was read: nothing left to colour.
      if (e instanceof GoogleCalendarError && (e.status === 410 || e.status === 404)) return;
      throw e;
    }
  }

  private eventsUrl(calendarId: string): string {
    return `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  }

  /** Every page's `items`; `onLast` sees the last page (it has the sync token). */
  private async pages<T>(url: string, params: URLSearchParams, onLast?: (page: Record<string, unknown>) => void): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams(params);
      if (pageToken) q.set('pageToken', pageToken);
      const page = (await this.call(`${url}?${q}`, {})) as Record<string, unknown> & { items?: T[]; nextPageToken?: string };
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
      if (!pageToken) onLast?.(page);
    } while (pageToken);
    return items;
  }

  /**
   * One authenticated call, as JSON. 401: a fresh token and one retry, then `AuthRequiredError`.
   * 429, 403 rate limits and 5xx: wait (`Retry-After`, at most a minute, else 1, 2, 4 … s) and retry, up to
   * `maxRetries`. A 403 for a missing scope is `EditAccessRequiredError` on a patch (colouring asks for edit
   * access) and `AuthRequiredError` on a read (the user unticked a read permission: sign in again).
   */
  private async call(url: string, init: RequestInit): Promise<unknown> {
    let refreshed = false;
    let fresh = false;
    for (let retry = 0; ; ) {
      // A token refresh can stall too, so the token gets the same time limit as a request.
      const token = await this.withTimeout(() => this.getToken(fresh ? { fresh: true } : undefined));
      fresh = false;
      const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
      const { status, body, retryAfter } = await this.send(url, { ...init, headers });
      if (status >= 200 && status < 300) return body;
      if (status === 401) {
        if (refreshed) throw new AuthRequiredError('Sign-in required');
        refreshed = fresh = true;
        continue;
      }
      const err = (body ?? {}) as GoogleError;
      const reasons = [...(err.error?.errors ?? []), ...(err.error?.details ?? [])].map((r) => r.reason);
      const message = `Google Calendar answered ${status}: ${err.error?.message ?? 'no message'}`;
      if (status === 403 && reasons.some((r) => r === 'insufficientPermissions' || r === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
        throw init.method === 'PATCH' ? new EditAccessRequiredError(message) : new AuthRequiredError(message);
      }
      const rateLimited = status === 403 && reasons.some((r) => r === 'rateLimitExceeded' || r === 'userRateLimitExceeded');
      if ((status === 429 || rateLimited || status >= 500) && retry < this.maxRetries) {
        await this.sleep(Math.min(retryAfter ?? 1000 * 2 ** retry, MAX_RETRY_AFTER_MS));
        retry += 1;
        continue;
      }
      throw new GoogleCalendarError(status, message);
    }
  }

  /** One request, body read in full, within the time limit. A fetch TypeError means the network is down. */
  private send(url: string, init: RequestInit): Promise<{ status: number; body: unknown; retryAfter: number | null }> {
    return this.withTimeout(async (signal) => {
      let res: Response;
      let text: string;
      try {
        res = await this.fetchFn(url, { ...init, signal });
        text = await res.text();
      } catch (e) {
        if (e instanceof TypeError) throw new OfflineError('Network unreachable');
        throw e;
      }
      let body: unknown = null;
      try {
        body = text === '' ? null : JSON.parse(text);
      } catch {
        // A proxy's HTML error page; the status says enough.
      }
      return { status: res.status, body, retryAfter: retryAfterMs(res.headers.get('Retry-After'), this.now()) };
    });
  }

  /**
   * Runs `work` within `timeoutMs`. On timeout its signal is aborted and the call fails with `OfflineError`,
   * even if `work` ignores the abort (as `@omark/storage`'s request code does).
   */
  private async withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new OfflineError('Google Calendar timed out'));
      }, this.timeoutMs);
    });
    const run = Promise.resolve().then(() => work(controller.signal)); // a synchronous throw rejects too
    run.catch(() => {}); // a late failure after the timeout must not go unhandled
    try {
      return await Promise.race([run, timedOut]);
    } catch (e) {
      if (!(e instanceof OfflineError) && controller.signal.aborted) throw new OfflineError('Google Calendar timed out');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Seconds, or an HTTP date. */
function retryAfterMs(header: string | null, now: number): number | null {
  if (header === null) return null;
  if (/^\d+$/.test(header.trim())) return Number(header) * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

const RESPONSES: readonly string[] = ['needsAction', 'declined', 'tentative', 'accepted'];

function toEvent(calendarId: string, e: GoogleEvent): CalendarEvent {
  const status = e.status === 'cancelled' || e.status === 'tentative' ? e.status : 'confirmed';
  const base = { calendarId, id: e.id, recurringEventId: e.recurringEventId ?? null, htmlLink: e.htmlLink ?? null };
  // Google promises only the id on a cancelled item.
  if (status === 'cancelled') {
    return { ...base, status, title: '', start: null, end: null, response: null, colorId: null, marker: null };
  }
  const reply = e.attendees?.find((a) => a.self)?.responseStatus;
  const marker = e.extendedProperties?.private?.omarkTime;
  return {
    ...base,
    status,
    title: e.summary ?? '',
    start: toTime(e.start),
    end: toTime(e.end),
    response: reply !== undefined && RESPONSES.includes(reply) ? (reply as ResponseStatus) : null,
    colorId: e.colorId ?? null,
    marker: marker === 'green' || marker === 'red' ? marker : null,
  };
}

function toTime(t: GoogleEvent['start']): EventTime | null {
  if (t?.date) return { date: t.date };
  if (t?.dateTime) return { dateTime: t.dateTime };
  return null;
}
