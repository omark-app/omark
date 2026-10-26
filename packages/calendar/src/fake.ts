import { EditAccessRequiredError, SyncTokenExpiredError, parseInstant, startOfDay } from '@omark/time-core';
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarSource,
  ChangesResult,
  ColourPatch,
  EventTime,
  TrackerColour,
} from '@omark/time-core';

export interface FakeCalendarState {
  calendars: CalendarInfo[];
  events: CalendarEvent[];
  seq: number;
  /** Change stamp (the `seq` at the last change) per `calendarId/eventId`. */
  changedAt: Record<string, number>;
  /** Tokens below this are expired. */
  tokenFloor: number;
  readOnly: boolean;
}

const TOKEN = /^fake-(\d+)$/;
const key = (calendarId: string, id: string) => `${calendarId}/${id}`;
const copy = (e: CalendarEvent): CalendarEvent => structuredClone(e);

/** An in-memory calendar that behaves like Google's (see the CalendarSource contract). */
export class FakeCalendar implements CalendarSource {
  /** Every setColour call, in order. */
  readonly patches: { calendarId: string; eventId: string; patch: ColourPatch }[] = [];
  /** When true, setColour throws EditAccessRequiredError. */
  readOnly = false;

  private calendars: CalendarInfo[];
  private events: CalendarEvent[] = [];
  private seq = 0;
  private changedAt: Record<string, number> = {};
  private tokenFloor = 0;

  constructor(calendars: CalendarInfo[], events: CalendarEvent[] = []) {
    this.calendars = structuredClone(calendars);
    for (const e of events) this.add(e);
  }

  /** A change made outside the source, as the user would in Google Calendar. */
  add(event: CalendarEvent): void {
    this.calendar(event.calendarId);
    const at = this.events.findIndex((e) => e.calendarId === event.calendarId && e.id === event.id);
    if (at >= 0) this.events[at] = copy(event);
    else this.events.push(copy(event));
    this.stamp(event.calendarId, event.id);
  }

  edit(calendarId: string, id: string, changes: Partial<CalendarEvent>): void {
    Object.assign(this.find(calendarId, id), structuredClone(changes), { calendarId, id });
    this.stamp(calendarId, id);
  }

  /** Cancelled events stay, as Google keeps them for incremental reads. */
  cancel(calendarId: string, id: string): void {
    Object.assign(this.find(calendarId, id), { status: 'cancelled', title: '', start: null, end: null });
    this.stamp(calendarId, id);
  }

  /** Every token handed out so far is now too old. */
  expireTokens(): void {
    this.tokenFloor = this.seq + 1;
    this.seq += 1;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    return this.calendars.filter((c) => c.owned).map((c) => ({ ...c }));
  }

  async readChanges(calendarId: string, syncToken: string | null): Promise<ChangesResult> {
    this.calendar(calendarId);
    const mine = this.events.filter((e) => e.calendarId === calendarId);
    let events: CalendarEvent[];
    if (syncToken === null) {
      events = mine.filter((e) => e.status !== 'cancelled');
    } else {
      const since = this.tokenSeq(syncToken);
      events = mine.filter((e) => (this.changedAt[key(calendarId, e.id)] ?? 0) > since);
    }
    return { events: events.map(copy), syncToken: `fake-${this.seq}` };
  }

  async readRange(calendarId: string, from: string, to: string): Promise<CalendarEvent[]> {
    const tz = this.calendar(calendarId).timeZone;
    const rangeStart = parseInstant(from);
    const rangeEnd = parseInstant(to);
    return this.events
      .filter((e) => e.calendarId === calendarId && e.status !== 'cancelled' && e.start && e.end)
      .filter((e) => instant(e.start!, tz) < rangeEnd && instant(e.end!, tz) > rangeStart)
      .map(copy);
  }

  async colourIds(): Promise<Record<TrackerColour, string>> {
    return { green: '10', red: '11' };
  }

  async setColour(calendarId: string, eventId: string, patch: ColourPatch): Promise<void> {
    if (this.readOnly) throw new EditAccessRequiredError('This sign-in has read-only access to the calendar');
    const event = this.find(calendarId, eventId);
    event.colorId = patch.colorId;
    event.marker = patch.marker;
    this.stamp(calendarId, eventId);
    this.patches.push({ calendarId, eventId, patch: { ...patch } });
  }

  toJSON(): FakeCalendarState {
    return structuredClone({
      calendars: this.calendars,
      events: this.events,
      seq: this.seq,
      changedAt: this.changedAt,
      tokenFloor: this.tokenFloor,
      readOnly: this.readOnly,
    });
  }

  static fromJSON(state: FakeCalendarState): FakeCalendar {
    const fake = new FakeCalendar(state.calendars);
    const s = structuredClone(state);
    fake.events = s.events;
    fake.seq = s.seq;
    fake.changedAt = s.changedAt;
    fake.tokenFloor = s.tokenFloor;
    fake.readOnly = s.readOnly;
    return fake;
  }

  private stamp(calendarId: string, id: string): void {
    this.seq += 1;
    this.changedAt[key(calendarId, id)] = this.seq;
  }

  private calendar(id: string): CalendarInfo {
    const found = this.calendars.find((c) => c.id === id);
    if (!found) throw new Error(`Unknown calendar: ${id}`);
    return found;
  }

  private find(calendarId: string, id: string): CalendarEvent {
    this.calendar(calendarId);
    const found = this.events.find((e) => e.calendarId === calendarId && e.id === id);
    if (!found) throw new Error(`Unknown event ${id} in calendar ${calendarId}`);
    return found;
  }

  private tokenSeq(token: string): number {
    const match = TOKEN.exec(token);
    if (!match) throw new SyncTokenExpiredError(`Not a sync token: ${token}`);
    const seq = Number(match[1]);
    if (seq < this.tokenFloor) throw new SyncTokenExpiredError('The sync token has expired');
    return seq;
  }
}

/** The instant an event time starts at; all-day dates are midnight in the calendar's zone. */
function instant(time: EventTime, tz: string): number {
  return 'date' in time ? startOfDay(time.date, tz) : parseInstant(time.dateTime);
}
