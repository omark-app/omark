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
import type { StorageKind, StorageProvider } from './environment.ts';
import { decideStart, loadChoice, saveChoice } from './storage-choice.ts';
import type { StorageChoice } from './storage-choice.ts';
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
 * The storages this build and browser can offer: the sign-in helper's providers, and a folder where the
 * browser can pick one; `savedFolder` names the folder already picked on this device, if any.
 */
export interface StorageOptions {
  providers: StorageProvider[];
  folders: boolean;
  savedFolder: string | null;
}

/**
 * Changing where this device keeps its tasks (none in demo builds): `options` lists what can be picked,
 * `use` saves the choice and opens it (a reload, a sign-in redirect, or the folder picker first). `use`
 * resolves false when the user cancels the folder picker.
 */
export interface StorageSwitch {
  options(): Promise<StorageOptions>;
  /**
   * For a folder, the one saved on this device opens again, unless `pick` (show the picker, for another
   * folder) or `again` (pick the folder in use once more as it moved or access was refused: its offline copy
   * carries over).
   */
  use(to: StorageChoice, opts?: { again?: boolean; pick?: boolean }): Promise<boolean>;
}

/**
 * `ready`: the store is open; `auth` (null in demo, fake and folder mode) lets the UI sign in again when the
 * status reads `sign in needed`, and `folder` (only in folder mode) allows access again instead; `updates`
 * loads newer builds; `provider` is the storage open (for an account, the sign-in it belongs to, so signing
 * in again keeps to it: the helper forgets it on a failed token request); `storageName` is what the texts
 * call the storage; `storage` changes it (null in demo builds).
 * `choose`: the first-run screen. Nothing is chosen yet, or the choice can't be opened (`remembered`, offered
 * first); `options` is what can be picked, and `storage.use` picks.
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
      storage: StorageSwitch | null;
    }
  | { kind: 'choose'; options: StorageOptions; remembered: StorageChoice | null; storage: StorageSwitch };
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
 * when IndexedDB is unusable. A folder picked on this device (`chooseFolder`) needs no sign-in.
 * Outside demo mode, this device's storage choice decides which of these opens (`decideStart`), or whether the
 * first-run screen shows. Rejects if the sign-in redirect or the cache fails; the UI shows the error with a
 * way to try again.
 */
export async function boot(): Promise<BootResult> {
  if (STORAGE_MODE === 'demo') {
    const demo = await openDemo(toISODate(new Date()), { reset: takeDemoReset() });
    return ready(createWorkspace(demo.drive, demo.cache), demo, null, ONEDRIVE);
  }
  const accounts = STORAGE_MODE === 'fake' ? fakeAccounts() : realAccounts();
  const storage = storageSwitch(accounts);
  const choice = loadChoice();
  // A saved folder is looked for only where it could open: chosen, or nothing chosen yet.
  const saved = choice === null || choice === 'folder' ? await savedFolder() : { folder: null, sure: true };
  const folder = saved.folder;
  // A saved folder opens either way, so the sign-in client is not started for it.
  const session = folder ? { provider: null, sure: true } : await accounts.session(choice);
  const start = decideStart({ choice, signedIn: session.provider, folder: folder !== null });
  if (start.open === 'choose') {
    return { kind: 'choose', options: await storage.options(), remembered: start.remembered, storage };
  }
  // A start that had to guess (the folder lookup or the sign-in client too slow) opens, but saves nothing,
  // so the next start looks again rather than keeping the guess for good.
  if (start.save && saved.sure && session.sure) saveChoice(start.open);
  const result = start.open === 'folder' && folder ? await openFolder(folder) : await accounts.open(start.open as StorageProvider);
  return { ...result, storage };
}

/** The sign-in side of a build: the session start-up finds, and opening an account's storage. */
interface Accounts {
  /** Null in fake builds without a stubbed account, which count as signed in with Microsoft. */
  auth: Auth | null;
  /** `sure` is false when the sign-in client was too slow to start and the provider is a guess. */
  session(choice: StorageChoice | null): Promise<{ provider: StorageProvider | null; sure: boolean }>;
  open(provider: StorageProvider): Promise<Ready>;
}

function realAccounts(): Accounts {
  const auth = createAuth({ cookiePrefix: 'taskapp', providers: SIGN_IN_NAMES, appName: BRAND.app });
  const getToken = (o?: { fresh?: boolean }) => auth.getToken(o);
  return {
    auth,
    session: (choice) => sessionOf(auth, choice),
    open: (provider) =>
      provider === 'google'
        ? openAccount(auth, GOOGLE, new GoogleDriveAdapter({ folder: GOOGLE_FOLDER, getToken }), openCache)
        : openAccount(auth, ONEDRIVE, new OneDriveAdapter({ root: ONEDRIVE_ROOT, folder: ONEDRIVE_FOLDER, getToken }), openCache),
  };
}

/**
 * Fake builds: a fake drive seeded from `window.__TASKAPP_SEED__` (a fake Google Drive for Google), exposed
 * as `window.__taskappFake`. With `__TASKAPP_AUTH_STUB__` the stubbed account signs in; without it, the build
 * counts as signed in with Microsoft and opens at once. `__TASKAPP_FAKE_DURABLE__` caches in IndexedDB.
 */
function fakeAccounts(): Accounts {
  const seed = fakeSeed(window.__TASKAPP_SEED__);
  const stub = window.__TASKAPP_AUTH_STUB__;
  const auth = stub ? (window.__taskappAuth = createAuthStub(stub, window.__TASKAPP_PROVIDERS__)) : null;
  return {
    auth,
    session: async (choice) => (auth ? sessionOf(auth, choice) : { provider: 'microsoft', sure: true }),
    async open(provider) {
      if (provider === 'google') {
        const drive = new FakeGoogleDrive(seed, GOOGLE_FOLDER);
        window.__taskappFake = drive;
        const getToken = async () => (auth ? auth.getToken() : 'fake-google-token');
        const adapter = new GoogleDriveAdapter({ folder: GOOGLE_FOLDER, getToken, fetch: drive.fetch });
        return openAccount(auth, GOOGLE, adapter, inMemory);
      }
      const drive = new FakeOneDrive(seed);
      window.__taskappFake = drive;
      if (window.__TASKAPP_FAKE_DURABLE__) {
        drive.setOffline(!navigator.onLine);
        const opened = await openCache(ONEDRIVE);
        return ready(createWorkspace(drive, opened.cache), opened, null, ONEDRIVE);
      }
      if (!auth) return ready(createWorkspace(drive, new MemoryCache()), MEMORY, null, ONEDRIVE);
      return openAccount(auth, ONEDRIVE, tokenGated(drive, () => auth.getToken()), inMemory);
    },
  };
}

/** Only a Google session is Google; any other (an old `signed_in=1` too) is Microsoft, as before. */
function providerOf(id: string | null): StorageProvider | null {
  if (id === null) return null;
  return id === 'google' ? 'google' : 'microsoft';
}

/**
 * The provider signed in with, after reading a sign-in redirect's result if there was one (null: signed
 * out). If the sign-in client takes longer than `AUTH_START_MS` to start, a guess (`sure` false): the
 * session the cookie hints at, else the chosen account, else Microsoft. The store then opens from what is
 * cached: the list shows, and the first token request fails as offline or sign-in needed instead of the app
 * hanging on "Loading…".
 */
async function sessionOf(
  auth: Auth,
  choice: StorageChoice | null,
): Promise<{ provider: StorageProvider | null; sure: boolean }> {
  if (!(await settlesWithin(auth.handleRedirect(), AUTH_START_MS))) {
    console.warn(`${BRAND.app}: sign-in did not finish starting; opening the cached copy`);
    const guess = providerOf(auth.signedInProvider()) ?? (choice === 'folder' || choice === null ? 'microsoft' : choice);
    return { provider: guess, sure: false };
  }
  return { provider: auth.isSignedIn() ? (providerOf(auth.signedInProvider()) ?? 'microsoft') : null, sure: true };
}

async function openAccount(
  auth: Auth | null,
  place: Place,
  adapter: StorageAdapter,
  cache: (place: Place) => Promise<{ cache: LocalCache } & CacheInfo>,
): Promise<Ready> {
  const opened = await cache(place);
  return ready(createWorkspace(adapter, opened.cache), opened, auth, place);
}

/**
 * Changing storage. The choice is saved first, so the next start opens it: then a reload, a sign-in with
 * the chosen provider when not signed in with it, or for a folder the one saved on this device (unless
 * `pick` or `again`), else the picker before anything is saved. Each storage keeps its own offline cache,
 * so nothing is copied or deleted, and edits not yet saved wait in theirs until the user switches back.
 * Rejects when the browser won't keep the choice (site data blocked), as the next start could not know it.
 */
function storageSwitch(accounts: Accounts): StorageSwitch {
  const remember = (choice: StorageChoice): void => {
    if (!saveChoice(choice)) throw new Error("this browser doesn't let the app remember the choice (site data blocked?)");
  };
  return {
    async options() {
      const providers = accounts.auth ? knownProviders(await accounts.auth.availableProviders()) : ['microsoft'];
      const folders = folderSupported(window);
      const saved = folders ? (await savedFolder()).folder : null;
      return { providers: providers as StorageProvider[], folders, savedFolder: saved?.handle.name ?? null };
    },
    async use(to, opts = {}) {
      if (to === 'folder') {
        const reuse = !opts.pick && !opts.again && (await savedFolder()).folder !== null;
        if (!reuse && !(await chooseFolder(opts))) return false;
        remember('folder');
        location.reload();
        return true;
      }
      remember(to);
      const auth = accounts.auth;
      if (!auth || (auth.isSignedIn() && providerOf(auth.signedInProvider()) === to)) location.reload();
      else await auth.signIn(to);
      return true;
    },
  };
}

/**
 * Shows the folder picker (needs a click) and keeps the folder picked, so the next start opens it.
 * `again`: the user is picking the folder they had once more (moved, renamed, or access refused), so its
 * offline copy and any edits waiting in it carry over. False when the user cancels.
 */
export async function chooseFolder(opts: { again?: boolean } = {}): Promise<boolean> {
  const handle = await pickFolder(window, PICKER_ID);
  if (!handle) return false;
  await new SavedFolder(FOLDER_DB).save(handle, { keepId: opts.again });
  return true;
}

/** How long start-up waits for IndexedDB to give the picked folder back before going on without it. */
const SAVED_FOLDER_MS = 3_000;

/**
 * The folder picked on this device, or null. Only where the browser can pick folders (elsewhere none can
 * have been saved), and never holding start-up up: IndexedDB can hang on open (WebKit). `sure` is false
 * when it did not answer in time, so a folder may be saved after all.
 */
async function savedFolder(): Promise<{ folder: FolderChoice | null; sure: boolean }> {
  if (!folderSupported(window)) return { folder: null, sure: true };
  let found: FolderChoice | null = null;
  const load = new SavedFolder(FOLDER_DB).load().then((f) => (found = f));
  if (await settlesWithin(load, SAVED_FOLDER_MS)) return { folder: found, sure: true };
  console.warn(`${BRAND.app}: the picked folder did not load in time`);
  return { folder: null, sure: false };
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
      // A refresh already running (say, from the focus the permission prompt gave back) started without
      // access and was shared; one more reads the folder now that access is given.
      if (store.status === 'signin') await store.refresh();
      return true;
    },
    conflicts: () => conflictCopies(handle, [...TASK_FILES]),
  };
  return { ...result, folder };
}

/**
 * How long start-up waits for the sign-in client to start (reading a sign-in redirect's result). Every
 * later token request has the adapter's own time limit; this one runs before the list can show.
 */
export const AUTH_START_MS = 15_000;

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
  return { kind: 'ready', store, auth, folder: null, updates, provider: place.provider, storageName: place.storageName, storage: null };
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
