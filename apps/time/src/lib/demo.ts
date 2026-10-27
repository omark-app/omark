import { clear, createStore } from 'idb-keyval';
import { demoSeed } from '@omark/calendar';
import type { CalendarEvent, CalendarInfo } from '@omark/calendar';
import { IdbCache, IdbDrive } from '@omark/storage';
import { defaultTimeConfigText, localDate, setTimeConfig } from '@omark/time-core';
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
 * Empties every store the demo keeps in this browser: the fake calendar, its drive, this device's choices,
 * the sync state and the copy of the files. The next open seeds the demo again. (The stores are emptied, not
 * deleted: the page holds them open, and a delete would wait for it to close.)
 */
export async function resetDemo(): Promise<void> {
  await clear(createStore('omark-time-fake', 'fake'));
  await new IdbDrive('omark-time-fake-drive').clear();
  await clear(createStore('omark-time-device', 'prefs'));
  await clear(createStore('omark-time-state', 'state'));
  await new IdbCache('omark-time-cache-google-drive').clear();
}
