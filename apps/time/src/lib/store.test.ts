import { expect, test } from 'vitest';
import { FakeCalendar } from '@omark/calendar';
import { FakeGoogleDrive, GoogleDriveAdapter, MemoryCache } from '@omark/storage';
import type { AppDeps, Place } from './boot.ts';
import { FolderFiles } from './files.ts';
import { MemoryPrefs } from './prefs.ts';
import { MemoryState } from './state.ts';
import { TimeStore } from './store.svelte.ts';

function setup() {
  const calendar = new FakeCalendar([{ id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true }]);
  const drive = new FakeGoogleDrive({}, 'Omark Time');
  const cache = new MemoryCache();
  const state = new MemoryState();
  const prefs = new MemoryPrefs();
  const calls: string[] = [];
  const place: Place = {
    files: new FolderFiles(new GoogleDriveAdapter({ folder: 'Omark Time', getToken: async () => 't', fetch: drive.fetch }), cache, () => '2026-10-27'),
    state,
  };
  const deps: AppDeps = {
    auth: {
      isSignedIn: () => !calls.includes('signOut'),
      signIn: async () => void calls.push('signIn'),
      addAccess: async (a) => void calls.push(`addAccess:${a}`),
      getToken: async () => 't',
      handleRedirect: async () => {},
      signOut: async () => void calls.push('signOut'),
    },
    source: calendar,
    prefs,
    openPlace: () => place,
    now: () => Date.parse('2026-10-27T12:00:00Z'),
    forget: async () => {
      calls.push('forget');
      await cache.clear();
      await state.clear();
    },
  };
  return { store: new TimeStore(deps), calls, cache, state, prefs };
}

test('signing out forgets this device\'s copy of the files, its sync state and its choices', async () => {
  const { store, calls, cache, state, prefs } = setup();
  await store.start();
  await store.chooseStorage('google-drive');
  await store.chooseCalendars(['primary']);
  expect(store.phase).toBe('ready');
  expect(await cache.get('config.yaml')).not.toBeNull();
  expect((await state.load()).tokens.primary).toBeTruthy();

  await store.signOut();
  expect(calls).toEqual(['addAccess:drive', 'signOut', 'forget']);
  expect(store.phase).toBe('signin');
  expect(store.rows).toBe(0);
  expect(store.config).toBeNull();
  expect(await cache.get('config.yaml')).toBeNull();
  expect((await state.load()).tokens).toEqual({});
  expect(await prefs.load()).toEqual({ storage: null, started: false, askedDrive: false, askedEdit: false });
});
