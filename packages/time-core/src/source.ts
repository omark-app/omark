/** All-day: `date` is YYYY-MM-DD, end exclusive. Timed: `dateTime` is RFC 3339 with offset. */
export type EventTime = { date: string } | { dateTime: string };
export type ResponseStatus = 'needsAction' | 'declined' | 'tentative' | 'accepted';
export type TrackerColour = 'green' | 'red';

export interface CalendarEvent {
  /** 'primary' for the primary calendar. */
  calendarId: string;
  /** Instance id. */
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  /** '' when absent (a cancelled instance has none). */
  title: string;
  /** null on a cancelled instance. */
  start: EventTime | null;
  end: EventTime | null;
  /** The user's own reply; null when not an invite. */
  response: ResponseStatus | null;
  colorId: string | null;
  /** extendedProperties.private.omarkTime */
  marker: TrackerColour | null;
  recurringEventId: string | null;
  htmlLink: string | null;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  timeZone: string;
  owned: boolean;
}

export interface ChangesResult {
  events: CalendarEvent[];
  syncToken: string;
}

/** The values to set; null clears. */
export interface ColourPatch {
  colorId: string | null;
  marker: TrackerColour | null;
}

export interface CalendarSource {
  listCalendars(): Promise<CalendarInfo[]>;
  /** Every page. A null token is a full read. Throws SyncTokenExpiredError (Google: 410). */
  readChanges(calendarId: string, syncToken: string | null): Promise<ChangesResult>;
  /** Instances overlapping [from, to), RFC 3339 instants (Google's timeMin/timeMax); no sync token. */
  readRange(calendarId: string, from: string, to: string): Promise<CalendarEvent[]>;
  colourIds(): Promise<Record<TrackerColour, string>>;
  /** Throws EditAccessRequiredError when the sign-in has read-only access. */
  setColour(calendarId: string, eventId: string, patch: ColourPatch): Promise<void>;
}

export class SyncTokenExpiredError extends Error {}
export class EditAccessRequiredError extends Error {}
