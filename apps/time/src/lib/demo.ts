import { clear, createStore } from 'idb-keyval';
import { demoSeed } from '@omark/calendar';
import type { CalendarEvent, CalendarInfo } from '@omark/calendar';
import { IdbCache, IdbDrive } from '@omark/storage';
import { defaultTimeConfigText, localDate, setTimeConfig } from '@omark/time-core';
import { DB_PREFIX } from '../env.ts';
import { CONFIG, PROJECTS } from './files.ts';
import type { DevicePrefs } from './prefs.ts';

/** The demo starts past the first run: files "in Google Drive" (the browser's), signed in, with edit access. */
export const DEMO_PREFS: DevicePrefs = { storage: 'google-drive', started: true, askedDrive: true, askedEdit: true };

/** The demo's calendar: about two weeks of events around today, in the browser's time zone (spec 12). */
export function demoStart(nowMs: number, timeZone: string): { calendars: CalendarInfo[]; events: CalendarEvent[] } {
  const { calendars, events } = demoSeed(localDate(nowMs, timeZone), timeZone);
  return { calendars, events };
}

/** The demo's folder: the sample projects, and config.yaml with colouring on, so the calendar view shows colours. */
export function demoFiles(today: string): Record<string, string> {
  const { projectsCsv } = demoSeed(today, 'UTC');
  return {
    [PROJECTS]: projectsCsv,
    [CONFIG]: setTimeConfig(defaultTimeConfigText(today), { colourEvents: true }, today),
  };
}

/**
 * Empties every store the demo keeps in this browser: the copy of the files (first, so it can't write a stale
 * copy back to the drive), the fake calendar, its drive, this device's choices and the sync state. The next
 * open seeds the demo again. Run at start-up (`takeDemoReset`), before anything opens them.
 */
export async function resetDemo(): Promise<void> {
  await new IdbCache(`${DB_PREFIX}-cache-google-drive`).clear();
  await clear(createStore(`${DB_PREFIX}-fake`, 'fake'));
  await new IdbDrive(`${DB_PREFIX}-fake-drive`).clear();
  await clear(createStore(`${DB_PREFIX}-device`, 'prefs'));
  await clear(createStore(`${DB_PREFIX}-state`, 'state'));
}

/** The part of `sessionStorage` the reset flag needs. */
export type Session = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const RESET_FLAG = 'omark-time-demo-reset';

/** "Reset demo": the reset happens at the next start (a reload follows), when nothing is running yet. */
export function requestDemoReset(session: Session): void {
  try {
    session.setItem(RESET_FLAG, '1');
  } catch {
    // Storage blocked (a private window): the reload just reopens the demo as it was.
  }
}

/** True once after `requestDemoReset`. */
export function takeDemoReset(session: Session): boolean {
  try {
    const asked = session.getItem(RESET_FLAG) === '1';
    session.removeItem(RESET_FLAG);
    return asked;
  } catch {
    return false;
  }
}
