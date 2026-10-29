import { createStore, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';

/** Where this device keeps the files (spec 4.2: per device). OneDrive only inside the one Omark app (U.4). */
export type StorageKind = 'google-drive' | 'local-folder' | 'onedrive';

/** This device's own choices, in IndexedDB. */
export interface DevicePrefs {
  storage: StorageKind | null;
  /** The calendars step of the first run is done on this device. */
  started: boolean;
  /** This device asked Google for Drive access, or edit access. */
  askedDrive: boolean;
  askedEdit: boolean;
}

export const FRESH_PREFS: DevicePrefs = { storage: null, started: false, askedDrive: false, askedEdit: false };

export interface PrefsStore {
  load(): Promise<DevicePrefs>;
  save(prefs: DevicePrefs): Promise<void>;
}

/** `start`: choices already made (the one app's demo starts past the first run). */
export class MemoryPrefs implements PrefsStore {
  private prefs: DevicePrefs;
  constructor(start: Partial<DevicePrefs> = {}) {
    this.prefs = { ...FRESH_PREFS, ...start };
  }
  async load(): Promise<DevicePrefs> {
    return { ...this.prefs };
  }
  async save(prefs: DevicePrefs): Promise<void> {
    this.prefs = { ...prefs };
  }
}

/** `key`: whose choices; the one Omark app keeps them per place, as each place has its own calendar sign-in. */
export class IdbPrefs implements PrefsStore {
  private readonly store: UseStore = createStore('omark-time-device', 'prefs');
  constructor(private readonly key = 'prefs') {}
  async load(): Promise<DevicePrefs> {
    return { ...FRESH_PREFS, ...((await get<DevicePrefs>(this.key, this.store)) ?? {}) };
  }
  async save(prefs: DevicePrefs): Promise<void> {
    await set(this.key, prefs, this.store);
  }
}
