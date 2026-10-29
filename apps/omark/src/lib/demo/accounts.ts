import type { Auth } from '@omark/storage';
import type { ISODate } from '@omark/tasks-core';
import { localDate } from '@omark/time-core';
import { MemoryPrefs } from 'time/src/lib/prefs.ts';
import type { Accounts, Place } from '../places.ts';
import { askDemoReset, DEMO_DBS, DEMO_KEY, DEMO_SYNCED_KEY, openDemo, takeDemoReset } from './open.ts';
import { demoWorld } from './world.ts';

/** What the texts call the demo's storage: "Your files are in this browser". */
const STORAGE_NAME = 'this browser';

export interface DemoDeps {
  today?: () => ISODate;
  timeZone?: string;
  pictures?: (name: string) => Promise<Blob>;
  /** True when Reset demo was asked for before this start. */
  reset?: () => boolean;
  local?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

/** A sign-in that is always there and never leaves the page: the demo's made-up calendar needs none. */
const signedIn: Auth = {
  signIn: async () => {},
  getToken: async () => 'demo',
  isSignedIn: () => true,
  signedInProvider: () => null,
  availableProviders: async () => [],
  handleRedirect: async () => {},
  accesses: () => [],
  signOut: async () => {},
};

/** A picture the world shows, from the demo build's own files (vite.config.ts puts them in `demo/`). */
async function fetchPicture(name: string): Promise<Blob> {
  const res = await fetch(`/demo/${encodeURIComponent(name)}`);
  // A host answers a missing file with its index.html and 200 (Cloudflare Pages, `vite dev`): not a picture.
  if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) throw new Error(`${name}: not a picture`);
  return res.blob();
}

/**
 * The demo build's accounts (one app spec, section 9): Maya's world in this browser's IndexedDB, opened at once
 * (`demo`), with no storage choice and no sign-in. Time reads a made-up calendar with edit access, starts past
 * its first run and shows the Calendar view. A reset asked for before this start empties every demo store first.
 */
export function demoAccounts(deps: DemoDeps = {}): Accounts {
  const timeZone = deps.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = deps.today ?? (() => localDate(Date.now(), timeZone));
  const reset = deps.reset ?? (() => takeDemoReset());
  return {
    demo: true,
    resetDemo: () => void askDemoReset(),
    auth: () => signedIn,
    calendar: () => ({ auth: signedIn, access: null }),
    handleRedirect: async () => {},
    signOut: async () => {},
    storages: async () => [],
    savedFolder: async () => null,
    pickFolder: async () => false,
    async open(): Promise<Place> {
      const demo = await openDemo(today(), timeZone, {
        pictures: deps.pictures ?? fetchPicture,
        reset: reset(),
        ...(deps.local !== undefined && { local: deps.local }),
      });
      const tasks = { adapter: demo.tasks, provider: 'folder' as const, storageName: STORAGE_NAME, cacheDb: DEMO_DBS.tasksCopy, syncedKey: DEMO_SYNCED_KEY, auth: null };
      return {
        storage: 'folder',
        storageName: STORAGE_NAME,
        key: DEMO_KEY,
        root: demo.root,
        part: (p) => demo[p],
        pictures: () => demo.images,
        tasks: () => (demo.durable ? tasks : { ...tasks, memory: true }),
        async time() {
          const { openFake } = await import('time/src/lib/fake.ts');
          // The calendar is made for the day the files were, so the hours already in them match its events.
          const { source, persist } = await openFake({ db: DEMO_DBS.calendar, seed: { ...demoWorld(demo.day, timeZone).calendar, edit: true } });
          return {
            storage: 'folder',
            storageName: STORAGE_NAME,
            key: DEMO_KEY,
            top: demo.root,
            own: demo.time,
            calendar: signedIn,
            calendarAccess: null,
            source,
            persist,
            prefs: new MemoryPrefs({ started: true, askedEdit: true }),
            calendarView: true,
          };
        },
      };
    },
  };
}
