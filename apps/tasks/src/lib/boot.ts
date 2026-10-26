import {
  createAuth,
  FakeOneDrive,
  IdbCache,
  MemoryCache,
  migrateCache,
  OneDriveAdapter,
} from '@omark/storage';
import type { Auth, LocalCache, StorageAdapter } from '@omark/storage';
import { toISODate } from '@omark/tasks-core';
import { BRAND } from '../brand.ts';
import { APP_ENV, HOSTS, ONEDRIVE_FOLDER, ONEDRIVE_ROOT, STORAGE_MODE } from '../env.ts';
import { createAuthStub, tokenGated } from './auth-stub.ts';
import { createWorkspace, TASK_FILES } from './workspace.ts';
import type { TaskFile, Workspace } from './workspace.ts';
import type { AuthStub, AuthStubState } from './auth-stub.ts';
import { systemClock } from './clock.ts';
import { legacyCacheApplies } from './environment.ts';
import { installLifecycle } from './lifecycle.ts';
import { createStore } from './store.svelte.ts';
import type { AppStore } from './store.svelte.ts';
import { fakeSeed } from './sample-files.ts';
import { installUpdates } from './updates.svelte.ts';
import type { UpdateDeps, Updates } from './updates.svelte.ts';

declare global {
  interface Window {
    /** Files the fake drive starts with (set by e2e tests before the app loads). */
    __TASKAPP_SEED__?: Partial<Record<TaskFile, string>>;
    /** The fake drive, so e2e tests can read files and simulate other devices. */
    __taskappFake?: FakeOneDrive;
    /** Fake builds only: boot through sign-in with a stubbed account (set by e2e tests before the app loads). */
    __TASKAPP_AUTH_STUB__?: AuthStubState;
    /** Fake builds only: keep the cache in IndexedDB and start the fake drive offline when the browser is. */
    __TASKAPP_FAKE_DURABLE__?: boolean;
    /** The stubbed account, so e2e tests can see sign-in attempts. */
    __taskappAuth?: AuthStub;
    /** Fake builds only: shorter update timings, so e2e tests need not wait a minute for an idle page. */
    __TASKAPP_UPDATE_TIMING__?: Partial<Pick<UpdateDeps, 'idleMs' | 'pollMs'>>;
  }
}

/**
 * `ready`: the store is open; `auth` (null in fake mode) lets the UI sign in again when the status reads
 * `sign in needed`; `updates` loads newer builds. `signin`: no signed-in account; the UI calls `auth.signIn()`.
 */
export type BootResult =
  | { kind: 'ready'; store: AppStore; auth: Auth | null; updates: Updates }
  | { kind: 'signin'; auth: Auth };

const PHONE_QUERY = '(max-width: 719.98px)';

export const CACHE_WARNING =
  'This browser blocks offline storage (private browsing?). Changes are saved to OneDrive but not kept offline.';

/** What the store is told about its cache: a warning to show, and whether it survives a reload. */
interface CacheInfo {
  cacheWarning: string | null;
  durableCache: boolean;
}
/** The fake build caches in memory, without a warning. */
const MEMORY: CacheInfo = { cacheWarning: null, durableCache: false };

const isPhone = (): boolean => window.matchMedia(PHONE_QUERY).matches;

/**
 * Builds the store for this build's storage mode. Fake mode (`VITE_STORAGE=fake`) runs on an in-memory
 * drive seeded from `window.__TASKAPP_SEED__` (sample files on a PR preview) and exposes it as `window.__taskappFake`; with
 * `window.__TASKAPP_AUTH_STUB__` set it goes through the sign-in path too, with a stubbed account.
 * OneDrive mode signs in through the sign-in helper (`/api/auth`) and caches in IndexedDB, falling back to
 * memory (with `store.cacheWarning`) when IndexedDB is unusable. Rejects if the sign-in redirect or the cache fails;
 * the UI shows the error with a way to try again.
 */
export async function boot(): Promise<BootResult> {
  if (STORAGE_MODE === 'fake') {
    const drive = new FakeOneDrive(fakeSeed(APP_ENV, window.__TASKAPP_SEED__, toISODate(new Date())));
    window.__taskappFake = drive;
    if (window.__TASKAPP_FAKE_DURABLE__) {
      drive.setOffline(!navigator.onLine);
      const opened = await openCache();
      return ready(createWorkspace(drive, opened.cache), opened, null);
    }
    const stub = window.__TASKAPP_AUTH_STUB__;
    if (!stub) return ready(createWorkspace(drive, new MemoryCache()), MEMORY, null);
    const auth = (window.__taskappAuth = createAuthStub(stub));
    return signedIn(auth, tokenGated(drive, () => auth.getToken()), async () => ({ cache: new MemoryCache(), ...MEMORY }));
  }

  const auth = createAuth({ cookiePrefix: 'taskapp', providerName: 'Microsoft' });
  const adapter = new OneDriveAdapter({ root: ONEDRIVE_ROOT, folder: ONEDRIVE_FOLDER, getToken: (o) => auth.getToken(o) });
  return signedIn(auth, adapter, openCache);
}

/**
 * How long start-up waits for the sign-in client to start (reading a sign-in redirect's result). Every
 * later token request has the adapter's own time limit; this one runs before the list can show.
 */
export const AUTH_START_MS = 15_000;

/**
 * Reports a failed sign-in redirect if there was one; opens the store when an account is signed in. If that
 * takes longer than `AUTH_START_MS`, the store opens anyway from what is cached: the list shows, and
 * the first token request fails as offline or sign-in needed instead of the app hanging on "Loading…".
 */
async function signedIn(
  auth: Auth,
  adapter: StorageAdapter,
  cache: () => Promise<{ cache: LocalCache } & CacheInfo>,
): Promise<BootResult> {
  if (!(await settlesWithin(auth.handleRedirect(), AUTH_START_MS))) {
    console.warn(`${BRAND.app}: sign-in did not finish starting; opening the cached copy`);
  } else if (!auth.isSignedIn()) {
    return { kind: 'signin', auth };
  }
  const opened = await cache();
  return ready(createWorkspace(adapter, opened.cache), opened, auth);
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

const SYNCED_AT_KEY = `taskapp:synced-at:${ONEDRIVE_FOLDER}`;

/** `syncedAt` in localStorage, so a reopened app can say since when it has not synced. */
const syncedAtStore = {
  load(): Date | null {
    try {
      const ms = Number(localStorage.getItem(SYNCED_AT_KEY));
      return ms > 0 ? new Date(ms) : null;
    } catch {
      return null;
    }
  },
  save(at: Date): void {
    try {
      localStorage.setItem(SYNCED_AT_KEY, String(at.getTime()));
    } catch {
      // Storage blocked: the banner just leaves out "since".
    }
  },
};

async function ready(workspace: Workspace, cache: CacheInfo, auth: Auth | null): Promise<BootResult> {
  const store = await createStore({
    workspace, clock: systemClock, isPhone, syncedAtStore, confirm: (m) => window.confirm(m), ...cache,
  });
  installLifecycle(store);
  const timing = STORAGE_MODE === 'fake' ? window.__TASKAPP_UPDATE_TIMING__ : undefined;
  const updates = installUpdates(store, { ...timing });
  return { kind: 'ready', store, auth, updates };
}

/** The cache's IndexedDB database before it was keyed by folder (it only ever held the default folder's files on the deployed origin). */
const LEGACY_DB = 'taskapp';
const MIGRATED_KEY = 'taskapp:cache-migrated';

/**
 * IndexedDB can throw on construction or first use (iOS private mode): then use memory. The database is
 * keyed by OneDrive folder, so builds for different folders on one origin (`pnpm dev` and the real-OneDrive
 * smoke on localhost) never mix their cached text.
 */
async function openCache(): Promise<{ cache: LocalCache } & CacheInfo> {
  let cache: IdbCache;
  try {
    cache = new IdbCache(`taskapp:${ONEDRIVE_FOLDER}`);
    await cache.get('tasks.md');
  } catch {
    return { cache: new MemoryCache(), cacheWarning: CACHE_WARNING, durableCache: false };
  }
  await migrateLegacyCache(cache);
  // Ask the browser not to evict the cache under storage pressure (it may hold unsynced edits).
  void navigator.storage?.persist?.().catch(() => {});
  return { cache, cacheWarning: null, durableCache: true };
}

/**
 * Once per browser, moves unsynced edits from the old unkeyed database into the default folder's one,
 * then empties it. Other folders never take them (on localhost the old database may hold another
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
