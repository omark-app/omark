import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeOneDrive } from '@omark/storage';
import type { Auth, StorageAdapter } from '@omark/storage';
import type { Accounts, Place, Storage } from './places.ts';
import { Shell } from './shell.svelte.ts';
import type { Part } from './suite.ts';

// The shell's start-up and first run against stand-in accounts, with the browser's address, history and
// localStorage stubbed (no DOM here).

let url: URL;
let store: Map<string, string>;

beforeEach(() => {
  url = new URL('https://app.example/');
  store = new Map();
  vi.stubGlobal('location', {
    get pathname() { return url.pathname; },
    get search() { return url.search; },
    get hash() { return url.hash; },
  });
  const set = (_: unknown, __: string, to?: string | URL | null) => {
    if (to) url = new URL(String(to), url);
  };
  vi.stubGlobal('history', { state: null, pushState: set, replaceState: set });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('scrollY', 0);
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => f());
});
afterEach(() => vi.unstubAllGlobals());

interface Drive {
  root: StorageAdapter & { setOffline?(o: boolean): void };
  parts?: Partial<Record<Part, FakeOneDrive>>;
}

/** Accounts signed in with `signedIn` (null: none); `redirect` makes the sign-in redirect's result fail. */
function accounts(opts: {
  signedIn?: string | null;
  drives?: Partial<Record<Storage, Drive>>;
  redirect?: Error;
  signInSwitches?: boolean;
}) {
  // One session per provider, as the one app's sign-in helper keeps them.
  const sessions = new Set<string>(opts.signedIn ? [opts.signedIn] : []);
  const signIns: { provider?: string; returnTo?: string }[] = [];
  const opened: Storage[] = [];
  const client = (id: string): Auth => ({
    async signIn(_, o) {
      signIns.push({ provider: id, returnTo: o?.returnTo });
      // A real sign-in leaves the page, which keeps running for a moment without the new session.
      if (opts.signInSwitches) sessions.add(id);
    },
    getToken: async () => 'tok',
    isSignedIn: () => sessions.has(id),
    signedInProvider: () => (sessions.has(id) ? id : null),
    availableProviders: async () => ['microsoft', 'google'],
    accesses: () => [],
    signOut: async () => void sessions.delete(id),
    handleRedirect: async () => {},
  });
  const a: Accounts = {
    auth: client,
    calendar: (s) => (s === 'google' ? { auth: client('google'), access: 'calendar' } : { auth: client('googlecal'), access: null }),
    signOut: async () => sessions.clear(),
    async handleRedirect() {
      if (opts.redirect) throw opts.redirect;
    },
    storages: async () => ['microsoft', 'google'],
    savedFolder: async () => (opts.drives?.folder ? { handle: {} as never, id: 'f1' } : null),
    pickFolder: async () => true,
    async open(storage) {
      opened.push(storage);
      const d = opts.drives?.[storage];
      if (!d) return null;
      const part = (p: Part) => d.parts?.[p] ?? new FakeOneDrive();
      return { storage, storageName: storage, key: storage, root: d.root, part, tasks: () => ({}) as never, time: async () => ({}) as never } satisfies Place;
    },
  };
  return { accounts: a, signIns, opened };
}

const PARTS_TEXT = 'parts: [tasks, time]\n';

describe('start-up', () => {
  it('opens the parts the folder lists for a device whose choice is signed in', async () => {
    store.set('omark:storage', 'microsoft');
    const { accounts: a } = accounts({ signedIn: 'microsoft', drives: { microsoft: { root: new FakeOneDrive({ 'config.yaml': PARTS_TEXT }) } } });
    const shell = new Shell(a);
    await shell.start();
    expect(shell.phase).toBe('ready');
    expect(shell.on).toEqual(['tasks', 'time']);
  });

  it("a calendar-only Google session is not the storage's sign-in (U.4)", async () => {
    store.set('omark:storage', 'google');
    const g = { root: new FakeOneDrive({ 'config.yaml': PARTS_TEXT }) };
    const shell = new Shell(accounts({ signedIn: 'googlecal', drives: { google: g } }).accounts);
    await shell.start();
    expect(shell.phase).toBe('welcome');
    store.clear();
    const fresh = new Shell(accounts({ signedIn: 'googlecal', drives: { google: g } }).accounts);
    await fresh.start();
    expect(fresh.phase).toBe('welcome');
  });

  it('a failed sign-in redirect with a usable choice opens the folder and shows the error', async () => {
    store.set('omark:storage', 'microsoft');
    const { accounts: a } = accounts({
      signedIn: 'microsoft',
      redirect: new Error('Sign-in was cancelled'),
      drives: { microsoft: { root: new FakeOneDrive({ 'config.yaml': PARTS_TEXT }) } },
    });
    const shell = new Shell(a);
    await shell.start();
    expect(shell.phase).toBe('ready');
    expect(shell.error).toBe('Sign-in was cancelled');
  });

  it('a failed sign-in redirect with no usable choice asks where, with the error', async () => {
    const { accounts: a } = accounts({ redirect: new Error('Sign-in was cancelled') });
    const shell = new Shell(a);
    await shell.start();
    expect(shell.phase).toBe('where');
    expect(shell.error).toBe('Sign-in was cancelled');
  });

  it('anything else that fails during start-up shows the error card, not "Opening…" for ever', async () => {
    store.set('omark:storage', 'microsoft');
    const { accounts: a } = accounts({ signedIn: 'microsoft' });
    a.open = async () => {
      throw new Error('IndexedDB is broken');
    };
    const shell = new Shell(a);
    await shell.start();
    expect(shell.phase).toBe('error');
    expect(shell.error).toBe('IndexedDB is broken');
  });
});

describe('the parts a device remembers', () => {
  it('are not kept from a first open that could not read the folder, so the next start asks', async () => {
    store.set('omark:storage', 'microsoft');
    const root = new FakeOneDrive();
    root.setOffline(true);
    const shell = new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } }).accounts);
    await shell.start();
    expect(shell.phase).toBe('ready');
    expect(shell.on).toEqual(['tasks']);
    root.setOffline(false);
    const again = new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } }).accounts);
    await again.start();
    expect(again.phase).toBe('parts');
  });

  it("are kept per folder: another storage's folder without a suite file asks", async () => {
    store.set('omark:storage', 'microsoft');
    const ms = { root: new FakeOneDrive({ 'config.yaml': PARTS_TEXT }) };
    const g = { root: new FakeOneDrive() };
    await new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: ms } }).accounts).start();
    store.set('omark:storage', 'google');
    const shell = new Shell(accounts({ signedIn: 'google', drives: { google: g } }).accounts);
    await shell.start();
    expect(shell.phase).toBe('parts');
  });

  it('ask again when the folder has lost its suite file', async () => {
    store.set('omark:storage', 'microsoft');
    const root = new FakeOneDrive({ 'config.yaml': PARTS_TEXT });
    await new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } }).accounts).start();
    const empty = new FakeOneDrive();
    const shell = new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root: empty } } }).accounts);
    await shell.start();
    await vi.waitFor(() => expect(shell.phase).toBe('parts'));
  });

  it("a late re-read does not undo a part turned on meanwhile", async () => {
    store.set('omark:storage', 'microsoft');
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks]\n' });
    await new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } }).accounts).start();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let first = true;
    const slow: StorageAdapter = {
      async read(n) {
        if (first) {
          first = false;
          const before = await root.read(n);
          await held;
          return before;
        }
        return root.read(n);
      },
      write: (n, t, m) => root.write(n, t, m),
    };
    const shell = new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root: slow } } }).accounts);
    await shell.start();
    await shell.turnOn('time');
    expect(shell.on).toEqual(['tasks', 'time']);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(shell.on).toEqual(['tasks', 'time']);
  });
});

describe('choosing where the files live', () => {
  it('signed in with another provider, picking Google leaves for the sign-in and opens nothing', async () => {
    const { accounts: a, signIns, opened } = accounts({ signedIn: 'microsoft', drives: { google: { root: new FakeOneDrive() } } });
    const shell = new Shell(a);
    await shell.toWhere();
    await shell.choose('google');
    expect(signIns).toEqual([{ provider: 'google', returnTo: '/' }]);
    expect(opened).toEqual([]);
    expect(store.has('omark:parts:google')).toBe(false);
  });

  it('refuses a picked folder that holds Omark Tasks files at its top, and says why', async () => {
    const { accounts: a } = accounts({ drives: { folder: { root: new FakeOneDrive({ 'tasks.md': '# Tasks\n', 'config.yaml': 'theme: dark\n' }) } } });
    const shell = new Shell(a);
    await shell.toWhere();
    await shell.choose('folder');
    expect(shell.phase).toBe('where');
    expect(shell.error).toMatch(/tasks\.md/);
  });
});

describe('parts on and off (U.5)', () => {
  const ready = async (root: FakeOneDrive) => {
    store.set('omark:storage', 'microsoft');
    const shell = new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } }).accounts);
    await shell.start();
    return shell;
  };

  it('turns a part off: its tab goes, its address offers it again, the file lists the rest', async () => {
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks, time]\n' });
    const shell = await ready(root);
    await shell.turnOff('time');
    expect(shell.on).toEqual(['tasks']);
    expect(root.peek('config.yaml')).toBe('parts: [tasks]\n');
    shell.go('/time');
    expect(shell.offer).toBe('time');
  });

  it('never turns the last part off', async () => {
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks]\n' });
    const shell = await ready(root);
    await shell.turnOff('tasks');
    expect(shell.on).toEqual(['tasks']);
    expect(root.peek('config.yaml')).toBe('parts: [tasks]\n');
  });

  it('offline, a part turned on shows at once, stays on the device and is written once the folder is back', async () => {
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks]\n' });
    const shell = await ready(root);
    root.setOffline(true);
    await shell.turnOn('time');
    expect(shell.on).toEqual(['tasks', 'time']);
    expect(shell.error).toBeNull();
    expect(shell.pending).toBe(true);
    root.setOffline(false);
    root.externalWrite('config.yaml', 'parts: [tasks, goals]\n'); // another device, meanwhile
    await shell.flush();
    expect(root.peek('config.yaml')).toBe('parts: [tasks, goals, time]\n');
    expect(shell.on).toEqual(['tasks', 'goals', 'time']);
    expect(shell.pending).toBe(false);
  });

  it('a change still pending when the app closed is written on the next start', async () => {
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks, time]\n' });
    const first = await ready(root);
    root.setOffline(true);
    await first.turnOff('time');
    root.setOffline(false);
    const next = await ready(root);
    await new Promise((r) => setTimeout(r, 0));
    expect(root.peek('config.yaml')).toBe('parts: [tasks]\n');
    expect(next.on).toEqual(['tasks']);
  });
});

describe('the one Settings page (U.5)', () => {
  it('opens at /settings with every part that is on mounted, and goes back where it came from', async () => {
    store.set('omark:storage', 'microsoft');
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks, time]\n' });
    const shell = new Shell(accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } }).accounts);
    await shell.start();
    expect(shell.visited).toEqual(['tasks']);
    shell.go('/settings');
    expect(shell.settings).toBe(true);
    expect(shell.current).toBeNull();
    expect(shell.visited).toEqual(['tasks', 'time']);
    // Turning a part on from Settings stays on Settings.
    await shell.turnOn('goals', { open: false });
    expect(url.pathname).toBe('/settings');
    expect(shell.visited).toEqual(['tasks', 'time', 'goals']);
    shell.go('/tasks');
    expect(shell.settings).toBe(false);
    expect(shell.current).toBe('tasks');
  });

  it('sign out ends the sign-ins, forgets the storage choice and shows the welcome screen', async () => {
    store.set('omark:storage', 'microsoft');
    const root = new FakeOneDrive({ 'config.yaml': 'parts: [tasks]\n' });
    const made = accounts({ signedIn: 'microsoft', drives: { microsoft: { root } } });
    const shell = new Shell(made.accounts);
    await shell.start();
    await shell.signOut();
    expect(made.accounts.auth('microsoft').isSignedIn()).toBe(false);
    expect(store.has('omark:storage')).toBe(false);
    expect(store.has('omark:parts:microsoft')).toBe(false);
    expect(shell.phase).toBe('welcome');
    expect(shell.place).toBeNull();
    expect(url.pathname).toBe('/');
  });
});

describe('Tasks signing in again', () => {
  it('comes back to the part it left', async () => {
    store.set('omark:storage', 'microsoft');
    const { accounts: a, signIns } = accounts({ signedIn: 'microsoft', drives: { microsoft: { root: new FakeOneDrive({ 'config.yaml': PARTS_TEXT }) } } });
    const shell = new Shell(a);
    await shell.start();
    shell.go('/time');
    await shell.partAuth()!.signIn('microsoft');
    expect(signIns.at(-1)).toEqual({ provider: 'microsoft', returnTo: '/time' });
  });
});
