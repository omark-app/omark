import {
  AuthRequiredError,
  conflictCopies,
  createAuth,
  FakeOneDrive,
  folderSupported,
  GoogleDriveAdapter,
  LocalFolderAdapter,
  OneDriveAdapter,
  pickFolder,
  requestFolderAccess,
  SavedFolder,
} from '@omark/storage';
import type { Auth, FolderHandle, StorageAdapter } from '@omark/storage';
import type { GivenPlace } from 'tasks/src/lib/boot.ts';
import { folderStorageName, STORAGE_NAMES } from 'tasks/src/lib/environment.ts';
import { TASK_FILES } from 'tasks/src/lib/workspace.ts';
import { GOOGLE_ROOT, STORAGE_MODE } from '../env.ts';
import type { Part } from './suite.ts';

/** Where this device keeps the Omark folder: an account's drive, or a folder picked on this computer. */
export type Storage = 'microsoft' | 'google' | 'folder';
export const STORAGES: readonly Storage[] = ['microsoft', 'google', 'folder'];

/** The Omark folder, opened: the suite file's adapter at the top, and one per part's subfolder. */
export interface Place {
  storage: Storage;
  /** What the texts call it: OneDrive, Google Drive, or the picked folder's name. */
  storageName: string;
  /** Tells this place's offline copies apart from another's on the same device (the picked folder's id). */
  key: string;
  root: StorageAdapter;
  part(part: Part): StorageAdapter;
  /** What Tasks needs to open on its `tasks/` folder. */
  tasks(): GivenPlace;
}

declare global {
  interface Window {
    /** Fake builds: the files each fake folder starts with (set by e2e tests before the app loads). */
    __OMARK_SEED__?: Partial<Record<Part | 'root', Record<string, string>>>;
    /** Fake builds: start signed out, so the first run shows; signing in then succeeds at once. */
    __OMARK_SIGNED_OUT__?: boolean;
    /** Fake builds: the fake folders, so e2e tests can read what was written where. */
    __omarkFake?: Record<Part | 'root', FakeOneDrive>;
    // __TASKAPP_SEED__ and __taskappFake are declared by Tasks' boot (apps/tasks/src/lib/boot.ts).
  }
}

/** The device's sign-in and folders: the real sign-in helper, or the fake build's stand-ins. */
export interface Accounts {
  auth: Auth;
  /** The storages offered on the first run, in order. */
  storages(): Promise<Storage[]>;
  /** The picked folder saved on this device, if any. */
  savedFolder(): Promise<{ handle: FolderHandle; id: string } | null>;
  /** Shows the folder picker (needs a click); false when cancelled. */
  pickFolder(): Promise<boolean>;
  open(storage: Storage): Promise<Place | null>;
}

const FOLDER_DB = 'omark:picked-folder';
const PICKER_ID = 'omark';
const SIGN_IN_NAMES = { microsoft: 'Microsoft', google: 'Google' };

export function accounts(): Accounts {
  return STORAGE_MODE === 'fake' ? fakeAccounts() : realAccounts();
}

function folderParts(storage: Storage, storageName: string, key: string, auth: Auth | null, root: StorageAdapter, part: (p: Part) => StorageAdapter, extra: Partial<GivenPlace> = {}): Place {
  return {
    storage,
    storageName,
    key,
    root,
    part,
    tasks: () => ({
      adapter: part('tasks'),
      provider: storage,
      storageName,
      cacheDb: `omark-tasks:${key}`,
      syncedKey: `omark-tasks:synced-at:${key}`,
      auth,
      ...extra,
    }),
  };
}

function realAccounts(): Accounts {
  const auth = createAuth({ cookiePrefix: 'omark', providers: SIGN_IN_NAMES, appName: 'Omark' });
  const getToken = (o?: { fresh?: boolean }) => auth.getToken(o);
  const saved = new SavedFolder(FOLDER_DB);
  return {
    auth,
    async storages() {
      const providers = (await auth.availableProviders()).filter((p): p is Storage => p === 'microsoft' || p === 'google');
      return folderSupported(window) ? [...providers, 'folder'] : providers;
    },
    savedFolder: () => (folderSupported(window) ? saved.load() : Promise.resolve(null)),
    async pickFolder() {
      const handle = await pickFolder(window, PICKER_ID);
      if (!handle) return false;
      await saved.save(handle);
      return true;
    },
    async open(storage) {
      if (storage === 'microsoft') {
        const drive = (folder: string) => new OneDriveAdapter({ root: 'approot', folder, getToken });
        return folderParts(storage, STORAGE_NAMES.microsoft, 'microsoft', auth, drive(''), (p) => drive(p));
      }
      if (storage === 'google') {
        const drive = (folder: string) => new GoogleDriveAdapter({ folder, getToken });
        return folderParts(storage, STORAGE_NAMES.google, 'google', auth, drive(GOOGLE_ROOT), (p) => drive(`${GOOGLE_ROOT}/${p}`));
      }
      const choice = await saved.load();
      if (!choice) return null;
      const { handle, id } = choice;
      const sub = (p: Part) => new LocalFolderAdapter(handle, { subfolder: p });
      return folderParts(storage, folderStorageName(handle.name), `folder-${id}`, null, new LocalFolderAdapter(handle), sub, {
        folder: {
          allow: () => requestFolderAccess(handle),
          conflicts: async () => {
            const tasks = await handle.getDirectoryHandle?.('tasks').catch(() => null);
            return tasks ? conflictCopies(tasks, [...TASK_FILES]) : [];
          },
        },
      });
    },
  };
}

/**
 * Fake builds: a fake folder per part and one at the top, seeded from `__OMARK_SEED__`, exposed as
 * `__omarkFake`. Signed in with Microsoft unless `__OMARK_SIGNED_OUT__`; then signing in succeeds without
 * leaving the page. A Tasks e2e seed (`__TASKAPP_SEED__`) opens Tasks alone on it.
 */
function fakeAccounts(): Accounts {
  const seed = window.__OMARK_SEED__ ?? {};
  const tasksSeed = window.__TASKAPP_SEED__;
  const fake = {
    root: new FakeOneDrive(tasksSeed ? { 'config.yaml': 'parts: [tasks]\n', ...seed.root } : seed.root),
    tasks: new FakeOneDrive(tasksSeed ?? seed.tasks),
    time: new FakeOneDrive(seed.time),
    goals: new FakeOneDrive(seed.goals),
  };
  window.__omarkFake = fake;
  if (tasksSeed) window.__taskappFake = fake.tasks;
  // Tasks' offline e2e: the copy kept in IndexedDB, and the fake folders offline when the browser is.
  const durable = window.__TASKAPP_FAKE_DURABLE__ === true;
  if (durable) for (const f of Object.values(fake)) f.setOffline(!navigator.onLine);
  let signedIn: string | null = window.__OMARK_SIGNED_OUT__ ? null : 'microsoft';
  const auth: Auth = {
    async signIn(provider) {
      signedIn = provider ?? 'microsoft';
    },
    async getToken() {
      if (!signedIn) throw new AuthRequiredError('Sign in needed');
      return 'fake-token';
    },
    isSignedIn: () => signedIn !== null,
    signedInProvider: () => signedIn,
    availableProviders: async () => ['microsoft', 'google'],
    handleRedirect: async () => {},
  };
  return {
    auth,
    storages: async () => ['microsoft', 'google'],
    savedFolder: async () => null,
    pickFolder: async () => false,
    async open(storage) {
      if (storage === 'folder') return null;
      return {
        ...folderParts(storage, STORAGE_NAMES[storage], `fake-${storage}`, null, fake.root, (p) => fake[p]),
        tasks: () => ({
          adapter: fake.tasks,
          provider: storage,
          storageName: STORAGE_NAMES[storage],
          cacheDb: `omark-tasks:fake`,
          syncedKey: `omark-tasks:synced-at:fake`,
          auth: null,
          memory: !durable,
        }),
      };
    },
  };
}
