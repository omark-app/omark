import {
  createAuth,
  createWorkspace,
  FakeOneDrive,
  IdbCache,
  MemoryCache,
  OneDriveAdapter,
} from '@taskapp/storage';
import type { Auth, FileName, LocalCache, Workspace } from '@taskapp/storage';
import { MSAL_CLIENT_ID, ONEDRIVE_FOLDER, STORAGE_MODE } from '../env.ts';
import { systemClock } from './clock.ts';
import { createStore } from './store.svelte.ts';
import type { AppStore } from './store.svelte.ts';

declare global {
  interface Window {
    /** Files the fake drive starts with (set by e2e tests before the app loads). */
    __TASKAPP_SEED__?: Partial<Record<FileName, string>>;
    /** The fake drive, so e2e tests can read files and simulate other devices. */
    __taskappFake?: FakeOneDrive;
  }
}

/** `ready`: the store is open. `signin`: OneDrive mode with no signed-in account; the UI calls `auth.signIn()`. */
export type BootResult = { kind: 'ready'; store: AppStore } | { kind: 'signin'; auth: Auth };

const PHONE_QUERY = '(max-width: 719.98px)';
const TICK_MS = 30_000;

export const CACHE_WARNING =
  'This browser blocks offline storage (private browsing?). Changes are saved to OneDrive but not kept offline.';

const isPhone = (): boolean => window.matchMedia(PHONE_QUERY).matches;

/**
 * Builds the store for this build's storage mode. Fake mode (`VITE_STORAGE=fake`) runs on an in-memory
 * drive seeded from `window.__TASKAPP_SEED__` and exposes it as `window.__taskappFake`. OneDrive mode
 * signs in with MSAL and caches in IndexedDB, falling back to memory (with `store.cacheWarning`) when
 * IndexedDB is unusable.
 */
export async function boot(): Promise<BootResult> {
  if (STORAGE_MODE === 'fake') {
    const drive = new FakeOneDrive(window.__TASKAPP_SEED__ ?? {});
    window.__taskappFake = drive;
    return ready(createWorkspace(drive, new MemoryCache()), null);
  }

  const auth = createAuth({ clientId: MSAL_CLIENT_ID, redirectUri: `${window.location.origin}/` });
  await auth.handleRedirect();
  if (!auth.isSignedIn()) return { kind: 'signin', auth };

  const { cache, warning } = await openCache();
  const adapter = new OneDriveAdapter({ folder: ONEDRIVE_FOLDER, getToken: () => auth.getToken() });
  return ready(createWorkspace(adapter, cache), warning);
}

async function ready(workspace: Workspace, cacheWarning: string | null): Promise<BootResult> {
  const store = await createStore({ workspace, clock: systemClock, isPhone, cacheWarning });
  wireBrowser(store);
  return { kind: 'ready', store };
}

/** IndexedDB can throw on construction or first use (iOS private mode): then use memory. */
async function openCache(): Promise<{ cache: LocalCache; warning: string | null }> {
  try {
    const cache = new IdbCache();
    await cache.get('tasks.md');
    return { cache, warning: null };
  } catch {
    return { cache: new MemoryCache(), warning: CACHE_WARNING };
  }
}

/**
 * Spec 3.5 and planning decision 13: re-read on focus, save when hidden or closed, and recompute buckets
 * at midnight (checked every 30 s, which also covers a device waking from sleep).
 */
function wireBrowser(store: AppStore): void {
  // Regaining focus fires both `focus` and `visibilitychange`: one refresh at a time is enough.
  let refreshing: Promise<void> | null = null;
  const refresh = (): void => {
    refreshing ??= store.refresh().finally(() => {
      refreshing = null;
    });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
    else refresh();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', () => void store.flush());
  window.setInterval(() => store.tick(), TICK_MS);
}
