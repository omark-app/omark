import { FakeOneDrive, IdbCache, IdbDrive, MemoryCache } from '@omark/storage';
import type { LocalCache, StorageAdapter } from '@omark/storage';
import type { ISODate } from '@omark/tasks-core';
import { sampleFiles } from './sample-files.ts';

/**
 * The demo's databases. They are apart from the OneDrive cache's `taskapp:<folder>`, so a demo never
 * touches a real cache on the same origin (e.g. localhost).
 */
export const DEMO_DRIVE_DB = 'omark-demo:drive';
export const DEMO_CACHE_DB = 'omark-demo:cache';

export const DEMO_CACHE_WARNING = 'This browser blocks offline storage, so demo edits are lost on reload.';
export const RESET_CONFIRM = 'Reset the demo? Your demo edits are lost.';

/** What the demo needs of its drive besides reading and writing files. */
export type DemoDrive = StorageAdapter & Pick<IdbDrive, 'isEmpty' | 'seed' | 'clear'>;

/** Opens the drive and the cache; IndexedDB unless a test passes its own. */
export interface DemoStores {
  drive(dbName: string): DemoDrive;
  cache(dbName: string): LocalCache;
}

const IDB: DemoStores = { drive: (name) => new IdbDrive(name), cache: (name) => new IdbCache(name) };

export interface OpenedDemo {
  drive: StorageAdapter;
  cache: LocalCache;
  cacheWarning: string | null;
  durableCache: boolean;
}

/**
 * Opens the demo's drive and cache. An empty drive (the first open, or after a reset) is seeded with the
 * sample files; one with files is left alone, so edits stay. `reset` empties both first. If IndexedDB is
 * unusable (it can throw on construction or first use, as in private mode), the demo runs on the sample
 * files in memory, with a warning that edits are lost on reload.
 */
export async function openDemo(
  today: ISODate,
  { stores = IDB, reset = false }: { stores?: DemoStores; reset?: boolean } = {},
): Promise<OpenedDemo> {
  try {
    const drive = stores.drive(DEMO_DRIVE_DB);
    const cache = stores.cache(DEMO_CACHE_DB);
    if (reset) await clearBoth(drive, cache);
    if (await drive.isEmpty()) await drive.seed(sampleFiles(today));
    await cache.get('tasks.md');
    return { drive, cache, cacheWarning: null, durableCache: true };
  } catch {
    return {
      drive: new FakeOneDrive(sampleFiles(today)),
      cache: new MemoryCache(),
      cacheWarning: DEMO_CACHE_WARNING,
      durableCache: false,
    };
  }
}

/** Empties the demo's drive and cache; the next open seeds the samples again. */
export async function resetDemo(stores: DemoStores = IDB): Promise<void> {
  await clearBoth(stores.drive(DEMO_DRIVE_DB), stores.cache(DEMO_CACHE_DB));
}

/** The cache first: a cache whose bases the drive no longer has would bring old edits back. */
async function clearBoth(drive: DemoDrive, cache: LocalCache): Promise<void> {
  await cache.clear();
  await drive.clear();
}

const RESET_KEY = 'omark-demo:reset';

/**
 * Has the next load reset the demo; the caller then reloads. The reset runs there, before anything opens
 * the databases, so a save this page still has in flight (or makes as it unloads) cannot land after it.
 * Without session storage, resets now instead (and a failure is left for the reload to show).
 */
export async function requestDemoReset(storage: () => Pick<Storage, 'setItem'> = () => sessionStorage): Promise<void> {
  try {
    storage().setItem(RESET_KEY, '1');
  } catch {
    await resetDemo().catch(() => {});
  }
}

/** True once after `requestDemoReset`. */
export function takeDemoReset(storage: () => Pick<Storage, 'getItem' | 'removeItem'> = () => sessionStorage): boolean {
  try {
    const s = storage();
    if (s.getItem(RESET_KEY) === null) return false;
    s.removeItem(RESET_KEY);
    return true;
  } catch {
    return false;
  }
}
