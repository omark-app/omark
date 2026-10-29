import { GoogleCalendarSource } from '@omark/calendar';
import type { CalendarSource } from '@omark/calendar';
import {
  folderAccess,
  folderSupported,
  GoogleDriveAdapter,
  IdbCache,
  LocalFolderAdapter,
  pickFolder,
  requestFolderAccess,
  SavedFolder,
} from '@omark/storage';
import type { Auth, FolderPermission, StorageAdapter } from '@omark/storage';
import { localDate } from '@omark/time-core';
import { GOOGLE_FOLDER, STORAGE_MODE } from '../env.ts';
import { createTimeAuth } from './auth.ts';
import type { TimeAuth } from './auth.ts';
import { openFake } from './fake.ts';
import { FolderFiles, routed } from './files.ts';
import { IdbPrefs } from './prefs.ts';
import type { PrefsStore, StorageKind } from './prefs.ts';
import { IdbState } from './state.ts';
import type { StateStore } from './state.ts';

/** The storage of one place: the folder's files and this device's sync state for it. */
export interface Place {
  files: FolderFiles;
  state: StateStore;
  /** What the texts call the storage, when the one app names it ("OneDrive"); else Google Drive or the folder. */
  storageName?: string;
  /** A folder on this computer: its name, and the browser's permission for it (asking needs a click). */
  folder?: {
    name: string;
    access(): Promise<FolderPermission>;
    allow(): Promise<boolean>;
  };
}

/** Everything the store needs, real or fake. */
export interface AppDeps {
  auth: TimeAuth;
  source: CalendarSource;
  prefs: PrefsStore;
  /** Null for a folder on this computer when none is picked on this device. */
  openPlace(kind: StorageKind): Promise<Place | null>;
  /** The browser can pick a folder (Chrome and Edge on a computer). */
  canPickFolder: boolean;
  /** Shows the folder picker (needs a click); `again` keeps the old folder's copy. False when cancelled. */
  pickFolder(opts?: { again?: boolean }): Promise<boolean>;
  now: () => number;
  /** Drops this device's copy of the files and its sync state, for every place (sign-out). */
  forget(): Promise<void>;
  /** The fake build only: keep the fake calendar after the app changed it. */
  persist?: () => Promise<void>;
  /** The storage, when the one Omark app chose it: the store then skips its own storage step (U.4). */
  storage?: StorageKind;
  /** Inside the one Omark app, which owns storage and sign-out: Time offers neither. */
  embedded?: boolean;
  /**
   * Inside the one Omark app: signs in to the storage again. Its session is not the calendar's, so a storage that
   * asks for a sign-in shows `sync` `storage`, with this, rather than the calendar's sign-in.
   */
  storageSignIn?: () => Promise<void>;
  /** Inside the one Omark app: opens its Settings page. */
  openSettings?: () => void;
}

/** The IndexedDB database that keeps the picked folder's handle; the picker's id lets it reopen where it was. */
const FOLDER_DB = 'omark-time:picked-folder';
const PICKER_ID = 'omark-time';

const cacheOf = (name: string) => new IdbCache(`omark-time-cache-${name}`);

function filesOn(adapter: StorageAdapter, cacheName: string, now: () => number): FolderFiles {
  // The day only matters for the defaults of a config.yaml merge; UTC is close enough for that.
  return new FolderFiles(adapter, cacheOf(cacheName), () => localDate(now(), 'UTC'));
}

/** How long start-up waits for IndexedDB to give the picked folder back (as in apps/tasks). */
const SAVED_FOLDER_MS = 3_000;

/** The picked folder, with an offline copy and a sync state of its own (by its id); null when none is picked. */
async function folderPlace(now: () => number): Promise<Place | null> {
  if (!folderSupported(window)) return null;
  // A stuck IndexedDB must not leave the app on "Opening…": then the folder is picked again.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SAVED_FOLDER_MS));
  const choice = await Promise.race([new SavedFolder(FOLDER_DB).load(), timeout]);
  if (!choice) return null;
  const { handle, id } = choice;
  return {
    files: filesOn(new LocalFolderAdapter(handle), `folder-${id}`, now),
    state: new IdbState(`folder-${id}`),
    folder: { name: handle.name, access: () => folderAccess(handle), allow: () => requestFolderAccess(handle) },
  };
}

async function chooseFolder(opts: { again?: boolean } = {}): Promise<boolean> {
  const handle = await pickFolder(window, PICKER_ID);
  if (!handle) return false;
  await new SavedFolder(FOLDER_DB).save(handle, { keepId: opts.again });
  return true;
}

/** Sign-out: the copy, the sync state and the picked folder of every place, gone from this device. */
export async function forgetDevice(): Promise<void> {
  await cacheOf('google-drive').clear();
  await new IdbState('google-drive').clear();
  const saved = new SavedFolder(FOLDER_DB);
  const choice = await saved.load();
  if (choice) {
    await cacheOf(`folder-${choice.id}`).clear();
    await new IdbState(`folder-${choice.id}`).clear();
    await saved.forget();
  }
}

export async function bootDeps(): Promise<AppDeps> {
  const now = Date.now;
  const folders = { canPickFolder: folderSupported(window), pickFolder: chooseFolder, forget: forgetDevice };
  if (STORAGE_MODE === 'fake') {
    const fake = await openFake();
    return {
      auth: fake.auth,
      source: fake.source,
      prefs: new IdbPrefs(),
      // The fake drive stands in for Google Drive; a folder is a real one (the e2e gives it a private folder).
      openPlace: async (kind) =>
        kind === 'local-folder' ? folderPlace(now) : { files: filesOn(fake.drive, kind, now), state: new IdbState(kind) },
      now,
      ...folders,
      persist: fake.persist,
    };
  }
  const auth = createTimeAuth();
  const getToken = (opts?: { fresh?: boolean }) => auth.getToken(opts);
  return {
    auth,
    source: new GoogleCalendarSource({ getToken }),
    prefs: new IdbPrefs(),
    openPlace: async (kind) =>
      kind === 'local-folder'
        ? folderPlace(now)
        : { files: filesOn(new GoogleDriveAdapter({ folder: GOOGLE_FOLDER, getToken }), kind, now), state: new IdbState(kind) },
    now,
    ...folders,
  };
}

/** What the one Omark app hands Time (U.4): the storage it opened and the calendar sign-in. */
export interface TimeGiven {
  storage: 'microsoft' | 'google' | 'folder';
  /** What the texts call it: OneDrive, Google Drive, or the folder. */
  storageName: string;
  /** Tells this place's offline copy and sync state apart from another's on the same device. */
  key: string;
  /** The top of the Omark folder (`projects.csv`) and Time's own `time/`. */
  top: StorageAdapter;
  own: StorageAdapter;
  /** A client bound to the calendar's sign-in session. */
  calendar: Auth;
  /** The access the calendar is added as to a shared sign-in (`calendar`, on Google Drive); null when the calendar has its own sign-in. */
  calendarAccess: string | null;
  folder?: Place['folder'];
  /** Fake builds: the calendar to read instead of Google's. */
  source?: CalendarSource;
  now?: () => number;
  /** Fake builds: keep the fake calendar after the app changed it. */
  persist?: () => Promise<void>;
  /** The storage's own sign-in again (OneDrive's, Google Drive's), when its session lapsed; none for a folder. */
  storageSignIn?: () => Promise<void>;
  /** Opens the one app's Settings page (through its router, so its back link comes back here). */
  openSettings?: () => void;
}

const KINDS: Record<TimeGiven['storage'], StorageKind> = { microsoft: 'onedrive', google: 'google-drive', folder: 'local-folder' };

/**
 * Time's deps inside the one Omark app: the storage is fixed (no storage step, no folder picker, no sign-out), the
 * files go to `time/` with `projects.csv` at the top, and the calendar sign-in returns to `/time`. Signed in means
 * the session has the calendar: on a shared Google sign-in, once the calendar access was added to it.
 */
export function timeDeps(given: TimeGiven): AppDeps {
  const now = given.now ?? Date.now;
  const { calendar, calendarAccess } = given;
  const returnTo = '/time';
  const auth: TimeAuth = {
    isSignedIn: () => calendar.isSignedIn() && (calendarAccess === null || calendar.accesses().includes(calendarAccess)),
    signIn: () => calendar.signIn(undefined, calendarAccess === null ? { returnTo } : { add: calendarAccess, returnTo }),
    addAccess: (access) => calendar.signIn(undefined, { add: access, returnTo }),
    getToken: (opts) => calendar.getToken(opts),
    handleRedirect: () => calendar.handleRedirect(),
    // A shared sign-in is the storage's too: only the one app's own sign-out ends it.
    signOut: () => (calendarAccess === null ? calendar.signOut() : Promise.resolve()),
  };
  const cacheName = `omark-${given.key}`;
  return {
    auth,
    source: given.source ?? new GoogleCalendarSource({ getToken: (opts) => calendar.getToken(opts) }),
    prefs: new IdbPrefs(`prefs-${given.key}`),
    openPlace: async () => ({
      files: filesOn(routed(given.top, given.own), cacheName, now),
      state: new IdbState(cacheName),
      storageName: given.storageName,
      ...(given.folder && { folder: given.folder }),
    }),
    canPickFolder: false,
    pickFolder: async () => false,
    now,
    async forget() {
      await cacheOf(cacheName).clear();
      await new IdbState(cacheName).clear();
    },
    ...(given.persist && { persist: given.persist }),
    ...(given.storageSignIn && { storageSignIn: given.storageSignIn }),
    ...(given.openSettings && { openSettings: given.openSettings }),
    storage: KINDS[given.storage],
    embedded: true,
  };
}
