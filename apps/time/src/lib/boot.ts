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
import type { FolderPermission, StorageAdapter } from '@omark/storage';
import { localDate } from '@omark/time-core';
import { GOOGLE_FOLDER, STORAGE_MODE } from '../env.ts';
import { createTimeAuth } from './auth.ts';
import type { TimeAuth } from './auth.ts';
import { openFake } from './fake.ts';
import { FolderFiles } from './files.ts';
import { IdbPrefs } from './prefs.ts';
import type { PrefsStore, StorageKind } from './prefs.ts';
import { IdbState } from './state.ts';
import type { StateStore } from './state.ts';

/** The storage of one place: the folder's files and this device's sync state for it. */
export interface Place {
  files: FolderFiles;
  state: StateStore;
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
}

/** The IndexedDB database that keeps the picked folder's handle; the picker's id lets it reopen where it was. */
const FOLDER_DB = 'omark-time:picked-folder';
const PICKER_ID = 'omark-time';

const cacheOf = (name: string) => new IdbCache(`omark-time-cache-${name}`);

function filesOn(adapter: StorageAdapter, cacheName: string, now: () => number): FolderFiles {
  // The day only matters for the defaults of a config.yaml merge; UTC is close enough for that.
  return new FolderFiles(adapter, cacheOf(cacheName), () => localDate(now(), 'UTC'));
}

/** The picked folder, with an offline copy and a sync state of its own (by its id); null when none is picked. */
async function folderPlace(now: () => number): Promise<Place | null> {
  if (!folderSupported(window)) return null;
  const choice = await new SavedFolder(FOLDER_DB).load();
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

async function forget(): Promise<void> {
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
  const folders = { canPickFolder: folderSupported(window), pickFolder: chooseFolder, forget };
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
