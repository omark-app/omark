import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { FakeOneDrive, IdbCache, SavedFolder } from '@omark/storage';
import type { CalendarSource } from '@omark/calendar';
import type { Auth, FolderHandle } from '@omark/storage';
import { forgetDevice, timeDeps } from './boot.ts';
import type { TimeGiven } from './boot.ts';
import { MemoryPrefs } from './prefs.ts';
import { freshState, IdbState } from './state.ts';

test('forgetting the device clears Google Drive\'s and the picked folder\'s copies, states and the folder itself', async () => {
  const copy = { base: 'x', baseEtag: '"1"', local: 'x', dirty: false };
  await new IdbCache('omark-time-cache-google-drive').put('config.yaml', copy);
  await new IdbState('google-drive').save({ ...freshState(), tokens: { primary: 't' } });
  const saved = new SavedFolder('omark-time:picked-folder');
  const { id } = await saved.save({ name: 'Hours', kind: 'directory' } as unknown as FolderHandle);
  await new IdbCache(`omark-time-cache-folder-${id}`).put('config.yaml', copy);
  await new IdbState(`folder-${id}`).save({ ...freshState(), tokens: { primary: 't' } });

  await forgetDevice();

  expect(await new IdbCache('omark-time-cache-google-drive').get('config.yaml')).toBeNull();
  expect(await new IdbState('google-drive').load()).toEqual(freshState());
  expect(await new IdbCache(`omark-time-cache-folder-${id}`).get('config.yaml')).toBeNull();
  expect(await new IdbState(`folder-${id}`).load()).toEqual(freshState());
  expect(await saved.load()).toBeNull();
});

/** A bound sign-in client, recording what it was asked. */
function calendarAuth(signedIn: boolean, accesses: string[] = []) {
  const calls: unknown[][] = [];
  const auth: Auth = {
    signIn: async (provider, o) => void calls.push(['signIn', provider ?? null, o ?? null]),
    getToken: async () => 't',
    isSignedIn: () => signedIn,
    signedInProvider: () => (signedIn ? 'google' : null),
    availableProviders: async () => ['google'],
    handleRedirect: async () => {},
    accesses: () => accesses,
    signOut: async () => void calls.push(['signOut']),
  };
  return { auth, calls };
}

const given = (calendar: Auth, calendarAccess: string | null): TimeGiven => ({
  storage: 'microsoft',
  storageName: 'OneDrive',
  key: 'microsoft',
  top: new FakeOneDrive(),
  own: new FakeOneDrive(),
  calendar,
  calendarAccess,
  source: { listCalendars: async () => [] } as unknown as CalendarSource,
});

test('in the one app, a shared Google sign-in counts as the calendar only once the calendar was added (U.4)', async () => {
  const off = calendarAuth(true);
  expect(timeDeps(given(off.auth, 'calendar')).auth.isSignedIn()).toBe(false);
  const on = calendarAuth(true, ['calendar']);
  const deps = timeDeps(given(on.auth, 'calendar'));
  expect(deps.auth.isSignedIn()).toBe(true);
  await deps.auth.signIn();
  await deps.auth.addAccess('edit');
  await deps.auth.signOut();
  expect(on.calls).toEqual([
    ['signIn', null, { add: 'calendar', returnTo: '/time' }],
    ['signIn', null, { add: 'edit', returnTo: '/time' }],
  ]);
});

test('in the one app, a calendar-only sign-in is its own session, and Time signs out of it alone (U.4)', async () => {
  const cal = calendarAuth(false);
  const deps = timeDeps(given(cal.auth, null));
  expect(deps.auth.isSignedIn()).toBe(false);
  await deps.auth.signIn();
  await deps.auth.signOut();
  expect(cal.calls).toEqual([['signIn', null, { returnTo: '/time' }], ['signOut']]);
});

test('in the one app, this device\'s Time choices are kept per place, and the storage\'s sign-in is handed on (U.4)', async () => {
  const signIns: string[] = [];
  const a = timeDeps({ ...given(calendarAuth(true).auth, null), key: 'microsoft', storageSignIn: async () => void signIns.push('ms') });
  const b = timeDeps({ ...given(calendarAuth(true).auth, null), key: 'google' });
  await a.prefs.save({ storage: null, started: true, askedDrive: false, askedEdit: true });
  expect(await b.prefs.load()).toMatchObject({ started: false, askedEdit: false });
  expect(await a.prefs.load()).toMatchObject({ started: true, askedEdit: true });
  await a.storageSignIn!();
  expect(signIns).toEqual(['ms']);
  expect(b.storageSignIn).toBeUndefined();
});

test('in the one app, the demo hands Time its own device choices and the calendar view (U.6)', async () => {
  const prefs = new MemoryPrefs({ started: true, askedEdit: true });
  const deps = timeDeps({ ...given(calendarAuth(true).auth, null), prefs, calendarView: true });
  expect(deps.prefs).toBe(prefs);
  expect(await deps.prefs.load()).toMatchObject({ started: true, askedEdit: true, askedDrive: false });
  expect(deps.calendarView).toBe(true);
  expect(timeDeps(given(calendarAuth(true).auth, null)).calendarView).toBeUndefined();
});

test('in the one app, the storage is fixed and named as given, with no folder picker (U.4)', async () => {
  const deps = timeDeps(given(calendarAuth(true).auth, null));
  expect(deps.storage).toBe('onedrive');
  expect(deps.embedded).toBe(true);
  expect(deps.canPickFolder).toBe(false);
  expect(await deps.pickFolder()).toBe(false);
  expect((await deps.openPlace('onedrive'))?.storageName).toBe('OneDrive');
});
