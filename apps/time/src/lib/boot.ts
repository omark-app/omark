import { GoogleCalendarSource } from '@omark/calendar';
import type { CalendarSource } from '@omark/calendar';
import { GoogleDriveAdapter, IdbCache } from '@omark/storage';
import type { StorageAdapter } from '@omark/storage';
import { localDate } from '@omark/time-core';
import { GOOGLE_FOLDER, STORAGE_MODE } from '../env.ts';
import { createTimeAuth } from './auth.ts';
import type { TimeAuth } from './auth.ts';
import { openFake } from './fake.ts';
import type { Fake } from './fake.ts';
import { FolderFiles } from './files.ts';
import { IdbPrefs } from './prefs.ts';
import type { PrefsStore, StorageKind } from './prefs.ts';
import { IdbState } from './state.ts';
import type { StateStore } from './state.ts';

/** The storage of one place: the folder's files and this device's sync state for it. */
export interface Place {
  files: FolderFiles;
  state: StateStore;
}

/** Everything the store needs, real or fake. */
export interface AppDeps {
  auth: TimeAuth;
  source: CalendarSource;
  prefs: PrefsStore;
  openPlace(kind: StorageKind): Place;
  now: () => number;
  /** Drops this device's copy of the files and its sync state, for every place (sign-out). */
  forget(): Promise<void>;
  /** The fake build only: keep the fake calendar after the app changed it. */
  persist?: () => Promise<void>;
}

const KINDS: readonly StorageKind[] = ['google-drive'];
const cacheOf = (kind: StorageKind) => new IdbCache(`omark-time-cache-${kind}`);

function place(kind: StorageKind, adapter: StorageAdapter, state: StateStore, now: () => number): Place {
  // The day only matters for the defaults of a config.yaml merge; UTC is close enough for that.
  const files = new FolderFiles(adapter, cacheOf(kind), () => localDate(now(), 'UTC'));
  return { files, state };
}

async function forget(): Promise<void> {
  for (const kind of KINDS) {
    await cacheOf(kind).clear();
    await new IdbState(kind).clear();
  }
}

export async function bootDeps(): Promise<AppDeps> {
  const now = Date.now;
  if (STORAGE_MODE === 'fake') {
    const fake: Fake = await openFake();
    return {
      auth: fake.auth,
      source: fake.source,
      prefs: new IdbPrefs(),
      openPlace: (kind) => place(kind, fake.drive, new IdbState(kind), now),
      now,
      forget,
      persist: fake.persist,
    };
  }
  const auth = createTimeAuth();
  const getToken = (opts?: { fresh?: boolean }) => auth.getToken(opts);
  return {
    auth,
    source: new GoogleCalendarSource({ getToken }),
    prefs: new IdbPrefs(),
    openPlace: (kind) => place(kind, new GoogleDriveAdapter({ folder: GOOGLE_FOLDER, getToken }), new IdbState(kind), now),
    now,
    forget,
  };
}
