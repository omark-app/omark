import {
  createAuth,
  createWorkspace,
  FakeOneDrive,
  IdbCache,
  MemoryCache,
  OneDriveAdapter,
} from '@taskapp/storage';
import type { Auth, FileName, LocalCache, StorageAdapter, Workspace } from '@taskapp/storage';
import { MSAL_CLIENT_ID, ONEDRIVE_FOLDER, STORAGE_MODE } from '../env.ts';
import { createAuthStub, tokenGated } from './auth-stub.ts';
import type { AuthStub, AuthStubState } from './auth-stub.ts';
import { systemClock } from './clock.ts';
import { installLifecycle } from './lifecycle.ts';
import { createStore } from './store.svelte.ts';
import type { AppStore } from './store.svelte.ts';

declare global {
  interface Window {
    /** Files the fake drive starts with (set by e2e tests before the app loads). */
    __TASKAPP_SEED__?: Partial<Record<FileName, string>>;
    /** The fake drive, so e2e tests can read files and simulate other devices. */
    __taskappFake?: FakeOneDrive;
    /** Fake builds only: boot through sign-in with a stubbed account (set by e2e tests before the app loads). */
    __TASKAPP_AUTH_STUB__?: AuthStubState;
    /** Fake builds only: keep the cache in IndexedDB and start the fake drive offline when the browser is. */
    __TASKAPP_FAKE_DURABLE__?: boolean;
    /** The stubbed account, so e2e tests can see sign-in attempts. */
    __taskappAuth?: AuthStub;
  }
}

/**
 * `ready`: the store is open; `auth` (null in fake mode) lets the UI sign in again when the status reads
 * `sign in needed`. `signin`: no signed-in account; the UI calls `auth.signIn()`.
 */
export type BootResult = { kind: 'ready'; store: AppStore; auth: Auth | null } | { kind: 'signin'; auth: Auth };

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
 * drive seeded from `window.__TASKAPP_SEED__` and exposes it as `window.__taskappFake`; with
 * `window.__TASKAPP_AUTH_STUB__` set it goes through the sign-in path too, with a stubbed account.
 * OneDrive mode signs in with MSAL and caches in IndexedDB, falling back to memory (with
 * `store.cacheWarning`) when IndexedDB is unusable. Rejects if the sign-in redirect or the cache fails;
 * the UI shows the error with a way to try again.
 */
export async function boot(): Promise<BootResult> {
  if (STORAGE_MODE === 'fake') {
    const drive = new FakeOneDrive(window.__TASKAPP_SEED__ ?? {});
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

  const auth = createAuth({ clientId: MSAL_CLIENT_ID, redirectUri: `${window.location.origin}/` });
  const adapter = new OneDriveAdapter({ folder: ONEDRIVE_FOLDER, getToken: () => auth.getToken() });
  return signedIn(auth, adapter, openCache);
}

/** Finishes a sign-in redirect if there is one; opens the store when an account is signed in. */
async function signedIn(
  auth: Auth,
  adapter: StorageAdapter,
  cache: () => Promise<{ cache: LocalCache } & CacheInfo>,
): Promise<BootResult> {
  await auth.handleRedirect();
  if (!auth.isSignedIn()) return { kind: 'signin', auth };
  const opened = await cache();
  return ready(createWorkspace(adapter, opened.cache), opened, auth);
}

async function ready(workspace: Workspace, cache: CacheInfo, auth: Auth | null): Promise<BootResult> {
  const store = await createStore({ workspace, clock: systemClock, isPhone, ...cache });
  installLifecycle(store);
  return { kind: 'ready', store, auth };
}

/** IndexedDB can throw on construction or first use (iOS private mode): then use memory. */
async function openCache(): Promise<{ cache: LocalCache } & CacheInfo> {
  try {
    const cache = new IdbCache();
    await cache.get('tasks.md');
    return { cache, cacheWarning: null, durableCache: true };
  } catch {
    return { cache: new MemoryCache(), cacheWarning: CACHE_WARNING, durableCache: false };
  }
}
