import {
  conflictCopies,
  createAuth,
  FakeGoogleDrive,
  folderSupported,
  FakeOneDrive,
  GoogleDriveAdapter,
  IdbCache,
  LocalFolderAdapter,
  MemoryCache,
  migrateCache,
  OneDriveAdapter,
  pickFolder,
  requestFolderAccess,
  SavedFolder,
} from '@omark/storage';
import type { Auth, FolderChoice, LocalCache, StorageAdapter } from '@omark/storage';
import { toISODate } from '@omark/tasks-core';
import { BRAND } from '../brand.ts';
import { GOOGLE_FOLDER, HOSTS, ONEDRIVE_FOLDER, ONEDRIVE_ROOT, STORAGE_MODE } from '../env.ts';
import { createAuthStub, tokenGated } from './auth-stub.ts';
import { createWorkspace, TASK_FILES } from './workspace.ts';
import type { TaskFile, Workspace } from './workspace.ts';
import type { AuthStub, AuthStubState } from './auth-stub.ts';
import { systemClock } from './clock.ts';
import { cacheName, folderStorageName, legacyCacheApplies, SIGN_IN_NAMES, STORAGE_NAMES, syncedAtKey } from './environment.ts';
import type { StorageKind } from './environment.ts';
import { installLifecycle } from './lifecycle.ts';
import { createStore } from './store.svelte.ts';
import type { AppStore } from './store.svelte.ts';
import { fakeSeed } from './sample-files.ts';
import { openDemo, takeDemoReset } from './demo.ts';
import { installUpdates } from './updates.svelte.ts';
import type { UpdateDeps, Updates } from './updates.svelte.ts';

declare global {
  interface Window {
    /** Files the fake drive starts with (set by e2e tests before the app loads). */
    __TASKAPP_SEED__?: Partial<Record<TaskFile, string>>;
    /** The fake drive, so e2e tests can read files and simulate other devices. */
    __taskappFake?: FakeOneDrive | FakeGoogleDrive;
    /** Fake builds only: boot through sign-in with a stubbed account (set by e2e tests before the app loads). */
    __TASKAPP_AUTH_STUB__?: AuthStubState;
    /** Fake builds only: the sign-in providers the stubbed helper offers (default just Microsoft). */
    __TASKAPP_PROVIDERS__?: string[];
    /** Fake builds only: keep the cache in IndexedDB and start the fake drive offline when the browser is. */
    __TASKAPP_FAKE_DURABLE__?: boolean;
    /** The stubbed account, so e2e tests can see sign-in attempts. */
    __taskappAuth?: AuthStub;
    /** Fake builds only: shorter update timings, so e2e tests need not wait a minute for an idle page. */
    __TASKAPP_UPDATE_TIMING__?: Partial<Pick<UpdateDeps, 'idleMs' | 'pollMs'>>;
  }
}

/**
 * A picked folder that is open: `allow` asks for access again (from a click) and, once given, re-reads the
 * files; `conflicts` names the sync clients' conflict copies in it.
 */
export interface OpenFolder {
  allow(): Promise<boolean>;
  conflicts(): Promise<string[]>;
}

/**
 * `ready`: the store is open; `auth` (null in demo, fake and folder mode) lets the UI sign in again when the
 * status reads `sign in needed`, and `folder` (only in folder mode) allows access again instead; `updates`
 * loads newer builds; `provider` is the sign-in the storage belongs to, so signing in again keeps to it (the
 * helper forgets it on a failed token request); `storageName` is what the texts call the storage.
 * `signin`: no signed-in account; the UI offers `providers` and calls `auth.signIn(provider)`, and a folder
 * on this computer when `folders` (the browser can pick one).
 */
export type BootResult =
  | {
      kind: 'ready';
      store: AppStore;
      auth: Auth | null;
      folder: OpenFolder | null;
      updates: Updates;
      provider: StorageKind;
      storageName: string;
    }
  | { kind: 'signin'; auth: Auth; providers: string[]; folders: boolean };
type Ready = Extract<BootResult, { kind: 'ready' }>;

const PHONE_QUERY = '(max-width: 719.98px)';

export const cacheWarning = (storageName = 'OneDrive'): string =>
  `This browser blocks offline storage (private browsing?). Changes are saved to ${storageName} but not kept offline.`;

/** What the store is told about its cache: a warning to show, and whether it survives a reload. */
interface CacheInfo {
  cacheWarning: string | null;
  durableCache: boolean;
}
/** The fake build caches in memory, without a warning. */
const MEMORY: CacheInfo = { cacheWarning: null, durableCache: false };
const inMemory = async (): Promise<{ cache: LocalCache } & CacheInfo> => ({ cache: new MemoryCache(), ...MEMORY });

/**
 * The storage and folder the files live in (for a picked folder, its id). Each has its own cache and
 * synced-at key, and its name in the texts.
 */
interface Place {
  provider: StorageKind;
  folder: string;
  storageName: string;
}
const ONEDRIVE: Place = { provider: 'microsoft', folder: ONEDRIVE_FOLDER, storageName: STORAGE_NAMES.microsoft };
const GOOGLE: Place = { provider: 'google', folder: GOOGLE_FOLDER, storageName: STORAGE_NAMES.google };

/** The IndexedDB database that keeps the picked folder's handle. */
const FOLDER_DB = 'taskapp:picked-folder';
/** Lets the browser open the picker where it was last time. */
const PICKER_ID = 'omark-tasks';

const isPhone = (): boolean => window.matchMedia(PHONE_QUERY).matches;

/**
 * Builds the store for this build's storage mode. Demo mode (`VITE_STORAGE=demo`) runs on a drive in
 * IndexedDB seeded with sample files (src/lib/demo.ts) and never signs in. Fake mode (`VITE_STORAGE=fake`)
 * runs on an in-memory drive seeded from `window.__TASKAPP_SEED__` and exposes it as `window.__taskappFake`; with
 * `window.__TASKAPP_AUTH_STUB__` set it goes through the sign-in path too, with a stubbed account.
 * Real mode signs in through the sign-in helper (`/api/auth`) and opens the storage of the provider signed in
 * with (OneDrive, or Google Drive), caching in IndexedDB, falling back to memory (with `store.cacheWarning`)
 * when IndexedDB is unusable. A folder picked on this device (`chooseFolder`) opens before either, with no
 * sign-in. Rejects if the sign-in redirect or the cache fails; the UI shows the error with a
 * way to try again.
 */
export async function boot(): Promise<BootResult> {
  if (STORAGE_MODE === 'demo') {
    const demo = await openDemo(toISODate(new Date()), { reset: takeDemoReset() });
    return ready(createWorkspace(demo.drive, demo.cache), demo, null, ONEDRIVE);
  }
  // A folder picked on this device comes before any sign-in.
  const folder = await new SavedFolder(FOLDER_DB).load();
  if (folder) return openFolder(folder);
  if (STORAGE_MODE === 'fake') {
    const seed = fakeSeed(window.__TASKAPP_SEED__);
    if (window.__TASKAPP_AUTH_STUB__?.startsWith('google')) return fakeGoogle(seed, window.__TASKAPP_AUTH_STUB__);
    const drive = new FakeOneDrive(seed);
    window.__taskappFake = drive;
    if (window.__TASKAPP_FAKE_DURABLE__) {
      drive.setOffline(!navigator.onLine);
      const opened = await openCache(ONEDRIVE);
      return ready(createWorkspace(drive, opened.cache), opened, null, ONEDRIVE);
    }
    const stub = window.__TASKAPP_AUTH_STUB__;
    if (!stub) return ready(createWorkspace(drive, new MemoryCache()), MEMORY, null, ONEDRIVE);
    const auth = (window.__taskappAuth = createAuthStub(stub, window.__TASKAPP_PROVIDERS__));
    const adapter = tokenGated(drive, () => auth.getToken());
    return signedIn(auth, () => ({ place: ONEDRIVE, adapter }), inMemory);
  }

  const auth = createAuth({ cookiePrefix: 'taskapp', providers: SIGN_IN_NAMES, appName: BRAND.app });
  const getToken = (o?: { fresh?: boolean }) => auth.getToken(o);
  // Only a Google session opens Google Drive; any other (an old `signed_in=1` too) is OneDrive, as before.
  return signedIn(
    auth,
    (provider) =>
      provider === 'google'
        ? { place: GOOGLE, adapter: new GoogleDriveAdapter({ folder: GOOGLE_FOLDER, getToken }) }
        : { place: ONEDRIVE, adapter: new OneDriveAdapter({ root: ONEDRIVE_ROOT, folder: ONEDRIVE_FOLDER, getToken }) },
    openCache,
  );
}

/**
 * Shows the folder picker (needs a click) and keeps the folder picked, so the next start opens it.
 * False when the user cancels.
 */
export async function chooseFolder(): Promise<boolean> {
  const handle = await pickFolder(window, PICKER_ID);
  if (!handle) return false;
  await new SavedFolder(FOLDER_DB).save(handle);
  return true;
}

/**
 * Opens the picked folder, with an offline cache of its own. When the browser wants permission again, the
 * store opens from that cache with status `sign in needed`, and `folder.allow()` (from a click) asks.
 */
async function openFolder({ handle, id }: FolderChoice): Promise<BootResult> {
  const place: Place = { provider: 'folder', folder: id, storageName: folderStorageName(handle.name) };
  const opened = await openCache(place);
  const result = await ready(createWorkspace(new LocalFolderAdapter(handle), opened.cache), opened, null, place);
  const store = result.store;
  const folder: OpenFolder = {
    async allow() {
      if (!(await requestFolderAccess(handle))) return false;
      await store.refresh();
      return true;
    },
    conflicts: () => conflictCopies(handle, [...TASK_FILES]),
  };
  return { ...result, folder };
}

/** Fake builds with a `google` stub: signed in with Google, the real adapter over a fake Google Drive. */
function fakeGoogle(seed: Partial<Record<TaskFile, string>>, stub: AuthStubState): Promise<BootResult> {
  const drive = new FakeGoogleDrive(seed, GOOGLE_FOLDER);
  window.__taskappFake = drive;
  const auth = (window.__taskappAuth = createAuthStub(stub, window.__TASKAPP_PROVIDERS__));
  const adapter = new GoogleDriveAdapter({ folder: GOOGLE_FOLDER, getToken: () => auth.getToken(), fetch: drive.fetch });
  return signedIn(auth, () => ({ place: GOOGLE, adapter }), inMemory);
}

/**
 * How long start-up waits for the sign-in client to start (reading a sign-in redirect's result). Every
 * later token request has the adapter's own time limit; this one runs before the list can show.
 */
export const AUTH_START_MS = 15_000;

/**
 * Reports a failed sign-in redirect if there was one; opens the store when an account is signed in, on the
 * storage `open` picks for its provider. If that takes longer than `AUTH_START_MS`, the store opens anyway
 * from what is cached: the list shows, and the first token request fails as offline or sign-in needed
 * instead of the app hanging on "Loading…".
 */
async function signedIn(
  auth: Auth,
  open: (provider: string | null) => { place: Place; adapter: StorageAdapter },
  cache: (place: Place) => Promise<{ cache: LocalCache } & CacheInfo>,
): Promise<BootResult> {
  if (!(await settlesWithin(auth.handleRedirect(), AUTH_START_MS))) {
    console.warn(`${BRAND.app}: sign-in did not finish starting; opening the cached copy`);
  } else if (!auth.isSignedIn()) {
    return {
      kind: 'signin',
      auth,
      providers: knownProviders(await auth.availableProviders()),
      folders: folderSupported(window),
    };
  }
  const { place, adapter } = open(auth.signedInProvider());
  const opened = await cache(place);
  return ready(createWorkspace(adapter, opened.cache), opened, auth, place);
}

/** The providers this app has buttons for, in the helper's order; Microsoft when none is left. */
function knownProviders(ids: string[]): string[] {
  const known = ids.filter((id) => Object.hasOwn(SIGN_IN_NAMES, id));
  return known.length > 0 ? known : ['microsoft'];
}

/** True when `p` resolves within `ms`, false on timeout; rejects if `p` rejects first. */
export function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** `syncedAt` in localStorage, so a reopened app can say since when it has not synced. One key per cache. */
function syncedAtStore(place: Place) {
  const key = syncedAtKey(place.provider, place.folder);
  return {
    load(): Date | null {
      try {
        const ms = Number(localStorage.getItem(key));
        return ms > 0 ? new Date(ms) : null;
      } catch {
        return null;
      }
    },
    save(at: Date): void {
      try {
        localStorage.setItem(key, String(at.getTime()));
      } catch {
        // Storage blocked: the banner just leaves out "since".
      }
    },
  };
}

async function ready(workspace: Workspace, cache: CacheInfo, auth: Auth | null, place: Place): Promise<Ready> {
  const store = await createStore({
    workspace, clock: systemClock, isPhone, syncedAtStore: syncedAtStore(place), confirm: (m) => window.confirm(m), ...cache,
  });
  installLifecycle(store);
  const timing = STORAGE_MODE === 'fake' ? window.__TASKAPP_UPDATE_TIMING__ : undefined;
  const updates = installUpdates(store, { ...timing });
  return { kind: 'ready', store, auth, folder: null, updates, provider: place.provider, storageName: place.storageName };
}

/** The cache's IndexedDB database before it was keyed by folder (it only ever held the default folder's files on the deployed origin). */
const LEGACY_DB = 'taskapp';
const MIGRATED_KEY = 'taskapp:cache-migrated';

/**
 * IndexedDB can throw on construction or first use (iOS private mode): then use memory. The database is
 * keyed by storage and folder (`cacheName`), so builds for different folders on one origin (`pnpm dev` and
 * the real-OneDrive smoke on localhost) never mix their cached text, and Google Drive never sees OneDrive's.
 */
async function openCache(place: Place): Promise<{ cache: LocalCache } & CacheInfo> {
  let cache: IdbCache;
  try {
    cache = new IdbCache(cacheName(place.provider, place.folder));
    await cache.get('tasks.md');
  } catch {
    return { cache: new MemoryCache(), cacheWarning: cacheWarning(place.storageName), durableCache: false };
  }
  if (place.provider === 'microsoft') await migrateLegacyCache(cache);
  // Ask the browser not to evict the cache under storage pressure (it may hold unsynced edits).
  void navigator.storage?.persist?.().catch(() => {});
  return { cache, cacheWarning: null, durableCache: true };
}

/**
 * Once per browser, moves unsynced edits from the old unkeyed database into the default OneDrive folder's
 * one, then empties it. Other folders never take them (on localhost the old database may hold another
 * folder's files). Failures are ignored: the old database is left as it was and tried again next time.
 */
async function migrateLegacyCache(cache: LocalCache): Promise<void> {
  if (!legacyCacheApplies(ONEDRIVE_FOLDER, HOSTS)) return;
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    await migrateCache(new IdbCache(LEGACY_DB), cache, TASK_FILES);
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch (e) {
    console.warn(`${BRAND.app}: could not migrate the old offline cache`, e);
  }
}
