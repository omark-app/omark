import {
  AuthRequiredError,
  conflictCopies,
  createAuth,
  FakeOneDrive,
  folderAccess,
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
import type { TimeGiven } from 'time/src/lib/boot.ts';
import { GOOGLE_ROOT, STORAGE_MODE } from '../env.ts';
import type { Part } from './suite.ts';

/** Where this device keeps the Omark folder: an account's drive, or a folder picked on this computer. */
export type Storage = 'microsoft' | 'google' | 'folder';
export const STORAGES: readonly Storage[] = ['microsoft', 'google', 'folder'];
/** A storage reached through a sign-in. */
export type Account = Exclude<Storage, 'folder'>;
export const isAccount = (s: Storage): s is Account => s !== 'folder';

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
  /** What Time needs to open on its `time/` folder, with the calendar sign-in (U.4). */
  time(): Promise<TimeGiven>;
}

/** The calendar's sign-in for Time: on Google Drive the storage's own, widened with `access`; else its own. */
export interface CalendarSignIn {
  auth: Auth;
  access: string | null;
}

declare global {
  interface Window {
    /** Fake builds: the files each fake folder starts with (set by e2e tests before the app loads). */
    __OMARK_SEED__?: Partial<Record<Part | 'root', Record<string, string>>>;
    /** Fake builds: start signed out, so the first run shows; signing in then succeeds at once. */
    __OMARK_SIGNED_OUT__?: boolean;
    /** Fake builds: the calendar is already connected. */
    __OMARK_CALENDAR__?: boolean;
    /** Fake builds: the fake folders, so e2e tests can read what was written where. */
    __omarkFake?: Record<Part | 'root', FakeOneDrive>;
    /** Fake builds: each provider's session and the accesses added to it, and every sign-in asked for. */
    __omarkSessions?: Map<string, string[]>;
    __omarkSignIns?: { provider: string; add?: string; returnTo?: string }[];
    // __TASKAPP_SEED__ and __taskappFake are declared by Tasks' boot (apps/tasks/src/lib/boot.ts).
  }
}

/** The device's sign-ins and folders: the real sign-in helper, or the fake build's stand-ins. */
export interface Accounts {
  /** The sign-in of a storage's provider; each provider has a session of its own. */
  auth(account: Account): Auth;
  /** Time's calendar sign-in on this storage. */
  calendar(storage: Storage): CalendarSignIn;
  /** Reads a sign-in redirect's result: throws a storage sign-in's error, and leaves the calendar's for Time. */
  handleRedirect(): Promise<void>;
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
/** Every provider the one app's sign-in helper has (`functions/api/auth`): `googlecal` is the calendar alone. */
const SIGN_IN_NAMES = { microsoft: 'Microsoft', google: 'Google', googlecal: 'Google' };
const CALENDAR_TEXT = "Google didn't let Omark see your calendars and events. Connect the calendar again and tick both boxes.";
const EDIT_TEXT = "Google didn't give Omark edit access to your events, so it can't colour them. Turn colouring on again and tick the box.";
/** The texts for a sign-in that lacks a permission, by the access being added ('' for the first sign-in). */
const SCOPE_TEXTS: Record<string, Record<string, string>> = {
  google: { calendar: CALENDAR_TEXT, edit: EDIT_TEXT },
  googlecal: { '': CALENDAR_TEXT, edit: EDIT_TEXT },
};
/** The accesses Time adds, so a sign-in error about them is Time's to show. */
const CALENDAR_ACCESSES = ['calendar', 'edit'];

export function accounts(): Accounts {
  return STORAGE_MODE === 'fake' ? fakeAccounts() : realAccounts();
}

/** Whether the page is the return from a calendar sign-in that failed: Time shows that one, not the shell. */
function calendarError(): boolean {
  const q = new URL(location.href).searchParams;
  if (q.get('signin_error') === null) return false;
  return q.get('provider') === 'googlecal' || CALENDAR_ACCESSES.includes(q.get('add') ?? '');
}

/** Which session a sign-in redirect's error is about: its `?provider=`, else the default (Microsoft). */
function redirectProvider(): Account {
  return new URL(location.href).searchParams.get('provider') === 'google' ? 'google' : 'microsoft';
}

function folderParts(
  storage: Storage, storageName: string, key: string, auth: Auth | null, root: StorageAdapter, part: (p: Part) => StorageAdapter,
  time: () => Promise<TimeGiven>, extra: Partial<GivenPlace> = {},
): Place {
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
    time,
  };
}

function realAccounts(): Accounts {
  const clients = new Map<string, Auth>();
  const client = (provider: keyof typeof SIGN_IN_NAMES): Auth => {
    let c = clients.get(provider);
    if (!c) {
      c = createAuth({ cookiePrefix: 'omark', providers: SIGN_IN_NAMES, appName: 'Omark', provider, scopeErrors: SCOPE_TEXTS[provider] });
      clients.set(provider, c);
    }
    return c;
  };
  const calendar = (storage: Storage): CalendarSignIn =>
    storage === 'google' ? { auth: client('google'), access: 'calendar' } : { auth: client('googlecal'), access: null };
  const saved = new SavedFolder(FOLDER_DB);
  const timeOn = (storage: Storage, storageName: string, key: string, top: StorageAdapter, own: StorageAdapter, folder?: TimeGiven['folder']) =>
    async (): Promise<TimeGiven> => {
      const { auth, access } = calendar(storage);
      return { storage, storageName, key, top, own, calendar: auth, calendarAccess: access, ...(folder && { folder }) };
    };
  return {
    auth: (account) => client(account),
    calendar,
    async handleRedirect() {
      if (calendarError()) return;
      await client(redirectProvider()).handleRedirect();
    },
    async storages() {
      const providers = (await client('microsoft').availableProviders()).filter((p): p is Account => p === 'microsoft' || p === 'google');
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
        const getToken = (o?: { fresh?: boolean }) => client('microsoft').getToken(o);
        const drive = (folder: string) => new OneDriveAdapter({ root: 'approot', folder, getToken });
        const name = STORAGE_NAMES.microsoft;
        return folderParts(storage, name, 'microsoft', client('microsoft'), drive(''), (p) => drive(p), timeOn(storage, name, 'microsoft', drive(''), drive('time')));
      }
      if (storage === 'google') {
        const getToken = (o?: { fresh?: boolean }) => client('google').getToken(o);
        const drive = (folder: string) => new GoogleDriveAdapter({ folder, getToken });
        const name = STORAGE_NAMES.google;
        const time = timeOn(storage, name, 'google', drive(GOOGLE_ROOT), drive(`${GOOGLE_ROOT}/time`));
        return folderParts(storage, name, 'google', client('google'), drive(GOOGLE_ROOT), (p) => drive(`${GOOGLE_ROOT}/${p}`), time);
      }
      const choice = await saved.load();
      if (!choice) return null;
      const { handle, id } = choice;
      const name = folderStorageName(handle.name);
      const key = `folder-${id}`;
      const sub = (p: Part) => new LocalFolderAdapter(handle, { subfolder: p });
      const top = new LocalFolderAdapter(handle);
      const folder = { name: handle.name, access: () => folderAccess(handle), allow: () => requestFolderAccess(handle) };
      return folderParts(storage, name, key, null, top, sub, timeOn(storage, name, key, top, sub('time'), folder), {
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
 * leaving the page. Each provider has its own session (`__omarkSessions`); the calendar is connected only after
 * Time asks, unless `__OMARK_CALENDAR__`. Time reads its own fake calendar. A Tasks e2e seed (`__TASKAPP_SEED__`)
 * opens Tasks alone on it.
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
  const sessions = new Map<string, string[]>();
  if (!window.__OMARK_SIGNED_OUT__) sessions.set('microsoft', []);
  const signIns: NonNullable<Window['__omarkSignIns']> = [];
  window.__omarkSessions = sessions;
  window.__omarkSignIns = signIns;
  const client = (provider: string): Auth => ({
    async signIn(_, o) {
      signIns.push({ provider, ...(o?.add && { add: o.add }), ...(o?.returnTo && { returnTo: o.returnTo }) });
      const had = sessions.get(provider) ?? [];
      sessions.set(provider, o?.add ? [...new Set([...had, o.add])] : had);
    },
    async getToken() {
      if (!sessions.has(provider)) throw new AuthRequiredError('Sign in needed');
      return 'fake-token';
    },
    isSignedIn: () => sessions.has(provider),
    signedInProvider: () => (sessions.has(provider) ? provider : null),
    availableProviders: async () => ['microsoft', 'google'],
    handleRedirect: async () => {},
    accesses: () => sessions.get(provider) ?? [],
    async signOut() {
      sessions.delete(provider);
    },
  });
  const calendar = (storage: Storage): CalendarSignIn =>
    storage === 'google' ? { auth: client('google'), access: 'calendar' } : { auth: client('googlecal'), access: null };
  const time = (storage: Storage) => async (): Promise<TimeGiven> => {
    const signIn = calendar(storage);
    if (window.__OMARK_CALENDAR__) {
      const id = storage === 'google' ? 'google' : 'googlecal';
      const had = sessions.get(id) ?? [];
      sessions.set(id, signIn.access ? [...new Set([...had, signIn.access])] : had);
    }
    // Time's own fake calendar (its demo seed, or `__OMARK_TIME_SEED__`), loaded with the Time part only.
    const { openFake } = await import('time/src/lib/fake.ts');
    const { source, persist } = await openFake();
    return {
      storage,
      storageName: STORAGE_NAMES[storage === 'google' ? 'google' : 'microsoft'],
      key: `fake-${storage}`,
      top: fake.root,
      own: fake.time,
      calendar: signIn.auth,
      calendarAccess: signIn.access,
      source,
      persist,
    };
  };
  return {
    auth: (account) => client(account),
    calendar,
    handleRedirect: async () => {},
    storages: async () => ['microsoft', 'google'],
    savedFolder: async () => null,
    pickFolder: async () => false,
    async open(storage) {
      if (storage === 'folder') return null;
      return {
        ...folderParts(storage, STORAGE_NAMES[storage], `fake-${storage}`, null, fake.root, (p) => fake[p], time(storage)),
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
