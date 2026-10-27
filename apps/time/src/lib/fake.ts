import { createStore, get, set } from 'idb-keyval';
import { demoSeed, FakeCalendar } from '@omark/calendar';
import type { CalendarEvent, CalendarInfo, CalendarSource, FakeCalendarState } from '@omark/calendar';
import { IdbDrive, OfflineError } from '@omark/storage';
import { localDate } from '@omark/time-core';
import { DB_PREFIX } from '../env.ts';
import type { Access, TimeAuth } from './auth.ts';

/** What an e2e test can set before the app loads. Without it, the demo seed. */
export interface FakeSeed {
  calendars?: CalendarInfo[];
  events?: CalendarEvent[];
  /** Files already in the folder, as another device left them. */
  files?: Record<string, string>;
  /** `signed-out`: the sign-in screen shows. */
  auth?: 'signed-in' | 'signed-out';
  /** The sign-in already has edit access (by default it is read-only, like a first Google sign-in). */
  edit?: boolean;
  /** Google and the drive can't be reached (set again before a reload to open offline). */
  offline?: boolean;
}

/** The stubbed sign-in: it records what the app asked for instead of leaving the page. */
export interface FakeAuth extends TimeAuth {
  readonly calls: string[];
}

export interface Fake {
  calendar: FakeCalendar;
  /** What the app reads: the calendar, unless offline. */
  source: CalendarSource;
  setOffline(on: boolean): void;
  drive: IdbDrive;
  auth: FakeAuth;
  /** Keeps the fake calendar across reloads; call after changing it. */
  persist(): Promise<void>;
}

declare global {
  interface Window {
    __OMARK_TIME_SEED__?: FakeSeed;
    /** The fake build's calendar, drive and sign-in, for e2e tests. */
    __omarkTime?: Fake;
  }
}

const DEMO_ZONE = 'Europe/Warsaw';

/**
 * The fake calendar, drive and sign-in, kept in IndexedDB so a reload finds them as they were. `start` is what
 * they begin with (the demo's); otherwise an e2e test's `__OMARK_TIME_SEED__`, else the demo seed.
 */
export async function openFake(start?: FakeSeed): Promise<Fake> {
  const store = createStore(`${DB_PREFIX}-fake`, 'fake');
  const seed = start ?? window.__OMARK_TIME_SEED__ ?? {};
  let saved = await get<FakeCalendarState>('calendar', store);
  if (!saved) {
    const demo = demoSeed(localDate(Date.now(), DEMO_ZONE), DEMO_ZONE);
    const calendar = new FakeCalendar(seed.calendars ?? demo.calendars, seed.events ?? demo.events);
    calendar.readOnly = seed.edit !== true;
    saved = calendar.toJSON();
    await set('calendar', saved, store);
    await set('signedIn', seed.auth !== 'signed-out', store);
  }
  const calendar = FakeCalendar.fromJSON(saved);
  const drive = new IdbDrive(`${DB_PREFIX}-fake-drive`);
  if (seed.files && (await drive.isEmpty())) {
    for (const [name, text] of Object.entries(seed.files)) await drive.externalWrite(name, text);
  }
  const persist = () => set('calendar', calendar.toJSON(), store);
  let offline = false;
  const online = <T>(run: () => Promise<T>): Promise<T> =>
    offline ? Promise.reject(new OfflineError('Network unreachable')) : run();
  const source: CalendarSource = {
    listCalendars: () => online(() => calendar.listCalendars()),
    readChanges: (id, token) => online(() => calendar.readChanges(id, token)),
    readRange: (id, from, to) => online(() => calendar.readRange(id, from, to)),
    colourIds: () => online(() => calendar.colourIds()),
    setColour: (id, eventId, patch) => online(() => calendar.setColour(id, eventId, patch)),
  };
  const setOffline = (on: boolean) => {
    offline = on;
    drive.setOffline(on);
  };
  setOffline(seed.offline === true);
  let signedIn = (await get<boolean>('signedIn', store)) ?? true;
  const calls: string[] = [];
  const auth: FakeAuth = {
    calls,
    isSignedIn: () => signedIn,
    async signIn() {
      calls.push('signIn');
      signedIn = true;
      await set('signedIn', true, store);
    },
    async addAccess(access: Access) {
      calls.push(`addAccess:${access}`);
      if (access === 'edit') {
        calendar.readOnly = false;
        await persist();
      }
    },
    async getToken() {
      return 'fake-token';
    },
    async handleRedirect() {},
    async signOut() {
      calls.push('signOut');
      signedIn = false;
      await set('signedIn', false, store);
    },
  };
  const fake = { calendar, source, setOffline, drive, auth, persist };
  window.__omarkTime = fake;
  return fake;
}
