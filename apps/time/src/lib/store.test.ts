import { expect, test } from 'vitest';
import { FakeCalendar } from '@omark/calendar';
import type { CalendarEvent } from '@omark/calendar';
import { AuthRequiredError, FakeGoogleDrive, GoogleDriveAdapter, MemoryCache, OfflineError } from '@omark/storage';
import type { StorageAdapter } from '@omark/storage';
import type { AppDeps, Place } from './boot.ts';
import { FolderFiles } from './files.ts';
import { MemoryPrefs } from './prefs.ts';
import { MemoryState } from './state.ts';
import { TimeStore } from './store.svelte.ts';

function event(id: string, date: string): CalendarEvent {
  return {
    calendarId: 'primary',
    id,
    status: 'confirmed',
    title: 'ACME; Coding',
    start: { dateTime: `${date}T09:00:00+01:00` },
    end: { dateTime: `${date}T10:00:00+01:00` },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
  };
}

function setup() {
  const calendar = new FakeCalendar([{ id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true }]);
  const drive = new FakeGoogleDrive({ 'projects.csv': 'code,description,client,rate,currency,archived\nACME,Acme,,,,\n' }, 'Omark Time');
  const google = new GoogleDriveAdapter({ folder: 'Omark Time', getToken: async () => 't', fetch: drive.fetch });
  const net = { offline: false, refuse: false };
  // The drive as the app sees it: offline throws OfflineError, refuse is Google refusing the sign-in's scopes.
  const adapter: StorageAdapter = {
    read: async (name) => {
      if (net.offline) throw new OfflineError('Network unreachable');
      if (net.refuse) throw new AuthRequiredError('Sign-in required');
      return google.read(name);
    },
    write: async (name, text, ifMatch) => {
      if (net.offline) throw new OfflineError('Network unreachable');
      if (net.refuse) throw new AuthRequiredError('Sign-in required');
      return google.write(name, text, ifMatch);
    },
  };
  const cache = new MemoryCache();
  const state = new MemoryState();
  const prefs = new MemoryPrefs();
  const calls: string[] = [];
  const place: Place = { files: new FolderFiles(adapter, cache, () => '2026-10-27'), state };
  let listFails = false;
  const deps: AppDeps = {
    auth: {
      isSignedIn: () => !calls.includes('signOut'),
      signIn: async () => void calls.push('signIn'),
      addAccess: async (a) => {
        calls.push(`addAccess:${a}`);
        if (a === 'edit') calendar.readOnly = false;
      },
      getToken: async () => 't',
      handleRedirect: async () => {},
      signOut: async () => void calls.push('signOut'),
    },
    source: new Proxy(calendar, {
      get: (target, key) =>
        key === 'listCalendars' && listFails ? () => Promise.reject(new OfflineError('Network unreachable')) : Reflect.get(target, key).bind?.(target) ?? Reflect.get(target, key),
    }),
    prefs,
    openPlace: () => place,
    now: () => Date.parse('2026-10-27T12:00:00Z'),
    forget: async () => {
      calls.push('forget');
      await cache.clear();
      await state.clear();
    },
  };
  const store = new TimeStore(deps);
  const ready = async () => {
    await store.start();
    await store.chooseStorage('google-drive');
    await store.chooseCalendars(['primary']);
  };
  return { store, calls, cache, state, prefs, calendar, net, ready, failList: (on: boolean) => (listFails = on) };
}

test('signing out forgets this device\'s copy of the files, its sync state and its choices', async () => {
  const { store, calls, cache, state, prefs, ready } = setup();
  await ready();
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

test('sign-out asks first when a change has not reached the drive yet', async () => {
  const { store, calls, net, ready } = setup();
  await ready();
  net.offline = true;
  await store.setCalendars(['primary', 'work@example.com']);
  await store.signOut();
  expect(store.signOutPending).toBe(true);
  expect(calls).not.toContain('forget');
  await store.signOut({ anyway: true });
  expect(calls).toContain('forget');
  expect(store.phase).toBe('signin');
});

test('a drive that refuses the sign-in shows "sign in", not "synced"', async () => {
  const { store, net, ready } = setup();
  await ready();
  net.refuse = true;
  await store.syncNow();
  expect(store.sync).toBe('signin');
});

test('turning colouring off stops a pass that is running', async () => {
  const { store, calendar, ready } = setup();
  for (let i = 1; i <= 20; i++) calendar.add(event(`e${i}`, `2026-10-${String(i).padStart(2, '0')}`));
  await ready();
  let release: () => void = () => {};
  const setColour = calendar.setColour.bind(calendar);
  calendar.setColour = async (...args) => {
    // The third patch waits until the user has turned colouring off.
    if (calendar.patches.length === 2) await new Promise<void>((r) => (release = r));
    return setColour(...args);
  };
  const on = store.setColouring(true);
  await expect.poll(() => calendar.patches.length).toBe(2);
  const off = store.setColouring(false);
  await expect.poll(() => store.config?.colourEvents).toBe(false);
  release();
  await Promise.all([on, off]);
  expect(calendar.patches.length).toBe(3);
  expect(store.config?.colourEvents).toBe(false);
});

test('a change made while a sync runs gets a sync of its own after it', async () => {
  const { store, calendar, ready } = setup();
  await ready();
  calendar.add(event('late', '2026-10-21'));
  const first = store.syncNow();
  const second = store.setCalendars(['primary']);
  calendar.add(event('later', '2026-10-22'));
  await Promise.all([first, second]);
  expect(store.rows).toBe(2);
});

test('the calendars step says when the calendars can\'t be read, and can try again', async () => {
  const { store, failList } = setup();
  failList(true);
  await store.start();
  await store.chooseStorage('google-drive');
  expect(store.phase).toBe('calendars');
  expect(store.calendarsError).toMatch(/can't reach Google/);
  failList(false);
  await store.loadCalendars();
  expect(store.calendarsError).toBeNull();
  expect(store.calendars.map((c) => c.id)).toEqual(['primary']);
});

test('a failing action shows its error instead of rejecting', async () => {
  const { store, calls } = setup();
  await store.start();
  const auth = (store as unknown as { deps: AppDeps }).deps.auth;
  auth.addAccess = async () => {
    calls.push('boom');
    throw new Error('The helper is down');
  };
  await expect(store.chooseStorage('google-drive')).resolves.toBeUndefined();
  expect(store.error).toBe('The helper is down');
});
