import { createStore, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';

/** Where this device keeps the files (spec 4.2: per device). Only Google Drive so far. */
export type StorageKind = 'google-drive';

/** This device's own choices, in IndexedDB. */
export interface DevicePrefs {
  storage: StorageKind | null;
  /** The calendars step of the first run is done on this device. */
  started: boolean;
  /** This device asked Google for Drive access, or edit access. */
  askedDrive: boolean;
  askedEdit: boolean;
}

const FRESH: DevicePrefs = { storage: null, started: false, askedDrive: false, askedEdit: false };

export interface PrefsStore {
  load(): Promise<DevicePrefs>;
  save(prefs: DevicePrefs): Promise<void>;
}

export class MemoryPrefs implements PrefsStore {
  private prefs = { ...FRESH };
  async load(): Promise<DevicePrefs> {
    return { ...this.prefs };
  }
  async save(prefs: DevicePrefs): Promise<void> {
    this.prefs = { ...prefs };
  }
}

export class IdbPrefs implements PrefsStore {
  private readonly store: UseStore = createStore('omark-time-device', 'prefs');
  async load(): Promise<DevicePrefs> {
    return { ...FRESH, ...((await get<DevicePrefs>('prefs', this.store)) ?? {}) };
  }
  async save(prefs: DevicePrefs): Promise<void> {
    await set('prefs', prefs, this.store);
  }
}
