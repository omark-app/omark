import { mergeTasksText } from '@omark/tasks-core';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteFile, StorageAdapter } from '../src/adapter.ts';
import type { CachedFile, LocalCache } from '../src/cache.ts';
import { MemoryCache } from '../src/cache.ts';
import { AuthRequiredError, OfflineError, PreconditionFailedError, StorageFullError } from '../src/errors.ts';
import { FakeOneDrive } from '../src/fake-onedrive.ts';
import { FileSync } from '../src/file-sync.ts';
import type { SyncStatus } from '../src/file-sync.ts';

const NAME = 'tasks.md';
const INITIAL = '# Tasks\n';
const S = '# Tasks\n- [ ] Buy milk\n- [ ] Call mom\n';
const withLocal = '# Tasks\n- [ ] Buy milk\n- [ ] Call mom\n- [ ] Local task\n';
const withRemote = '# Tasks\n- [ ] Remote task\n- [ ] Buy milk\n- [ ] Call mom\n';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error('condition never became true');
}

function makeSync(adapter: StorageAdapter, cache: LocalCache = new MemoryCache()): FileSync {
  return new FileSync({ name: NAME, adapter, cache, merge: mergeTasksText, initial: INITIAL });
}

async function opened(remote: string | null = S) {
  const drive = new FakeOneDrive(remote === null ? {} : { [NAME]: remote });
  const cache = new MemoryCache();
  const sync = makeSync(drive, cache);
  await sync.open();
  return { drive, cache, sync };
}

/** Delegates to a FakeOneDrive; writes are delayed and tracked so overlap can be detected. */
class TrackingAdapter implements StorageAdapter {
  inFlight = 0;
  maxInFlight = 0;
  writes: string[] = [];
  readGate: Promise<void> | null = null;
  writeGate: Promise<void> | null = null;
  failWrites: Error | null = null;
  failAll: Error | null = null;

  constructor(readonly drive: FakeOneDrive) {}

  async read(name: string): Promise<RemoteFile | null> {
    if (this.failAll) throw this.failAll;
    return this.track(async () => {
      if (this.readGate) await this.readGate;
      return this.drive.read(name);
    });
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    if (this.failAll) throw this.failAll;
    if (this.failWrites) throw this.failWrites;
    this.writes.push(text);
    return this.track(async () => {
      if (this.writeGate) await this.writeGate;
      await new Promise((r) => setTimeout(r, 5));
      return this.drive.write(name, text, ifMatch);
    });
  }

  private async track<T>(fn: () => Promise<T>): Promise<T> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      return await fn();
    } finally {
      this.inFlight--;
    }
  }
}

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

describe('FileSync', () => {
  it('opening with no remote and no cache creates the remote with initial and reaches saved', async () => {
    const { drive, cache, sync } = await opened(null);
    expect(sync.text()).toBe(INITIAL);
    expect(drive.peek(NAME)).toBe(INITIAL);
    expect(sync.status()).toBe('saved');
    expect((await cache.get(NAME))?.dirty).toBe(false);
  });

  it('opening with an existing remote and no cache takes the remote text without writing', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const sync = makeSync(adapter);
    expect(await sync.open()).toBe(S);
    expect(adapter.writes).toEqual([]);
    expect(sync.status()).toBe('saved');
  });

  it('an external write followed by pull() returns changed: true with the external text', async () => {
    const { drive, sync } = await opened();
    drive.externalWrite(NAME, withRemote);
    expect(await sync.pull()).toEqual({ text: withRemote, changed: true });
    expect(sync.text()).toBe(withRemote);
  });

  it('pull() with nothing changed returns changed: false', async () => {
    const { sync } = await opened();
    expect(await sync.pull()).toEqual({ text: S, changed: false });
  });

  it('a local save after a remote change (412) writes the merged text with both edits', async () => {
    const { drive, cache, sync } = await opened();
    drive.externalWrite(NAME, withRemote);
    await sync.save(withLocal, S);
    const remote = drive.peek(NAME)!;
    expect(remote).toContain('- [ ] Remote task');
    expect(remote).toContain('- [ ] Local task');
    expect(sync.text()).toBe(remote);
    const cached = (await cache.get(NAME))!;
    expect(cached.dirty).toBe(false);
    expect(cached.base).toBe(remote);
    expect(sync.status()).toBe('saved');
  });

  it('saving while offline keeps the cache dirty and the remote unchanged; pull() after reconnect writes it', async () => {
    const { drive, cache, sync } = await opened();
    drive.setOffline(true);
    await sync.save(withLocal, S);
    expect(sync.status()).toBe('offline');
    expect((await cache.get(NAME))).toMatchObject({ local: withLocal, dirty: true });
    expect(drive.peek(NAME)).toBe(S);

    drive.setOffline(false);
    await sync.pull();
    expect(drive.peek(NAME)).toBe(withLocal);
    expect(sync.text()).toBe(withLocal);
    expect(sync.status()).toBe('saved');
    expect((await cache.get(NAME))?.dirty).toBe(false);
  });

  it('both sides edit the same task while offline: after reconnecting the remote has both versions', async () => {
    const { drive, sync } = await opened();
    drive.setOffline(true);
    await sync.save('# Tasks\n- [ ] Buy oat milk\n- [ ] Call mom\n', S);
    drive.externalWrite(NAME, '# Tasks\n- [ ] Buy milk 📅 2026-10-20\n- [ ] Call mom\n');
    drive.setOffline(false);
    const { changed } = await sync.pull();
    const remote = drive.peek(NAME)!;
    expect(remote).toContain('- [ ] Buy oat milk');
    expect(remote).toContain('- [ ] Buy milk 📅 2026-10-20');
    expect(remote).toContain('- [ ] Call mom');
    expect(sync.text()).toBe(remote);
    expect(changed).toBe(true);
  });

  it('opening while offline with a cache returns the cached local text with status offline', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    drive.setOffline(true);
    const cache = new MemoryCache();
    await cache.put(NAME, { base: S, baseEtag: '"v1"', local: withLocal, dirty: true });
    const sync = makeSync(drive, cache);
    expect(await sync.open()).toBe(withLocal);
    expect(sync.status()).toBe('offline');
    expect((await cache.get(NAME))).toMatchObject({ local: withLocal, dirty: true });
  });

  it('opening while offline with no cache returns initial, offline and dirty; reconnecting creates the remote', async () => {
    const drive = new FakeOneDrive();
    drive.setOffline(true);
    const cache = new MemoryCache();
    const sync = makeSync(drive, cache);
    expect(await sync.open()).toBe(INITIAL);
    expect(sync.status()).toBe('offline');
    expect((await cache.get(NAME))).toMatchObject({ local: INITIAL, dirty: true });

    drive.setOffline(false);
    await sync.pull();
    expect(drive.peek(NAME)).toBe(INITIAL);
    expect(sync.status()).toBe('saved');
  });

  it('a file created offline-first does not inject initial into a remote that appeared meanwhile', async () => {
    const drive = new FakeOneDrive();
    drive.setOffline(true);
    const sync = makeSync(drive);
    await sync.open();
    drive.externalWrite(NAME, 'Notes above\n# Tasks\n- [ ] Remote task\n');
    drive.setOffline(false);
    const { text } = await sync.pull();
    expect(text).toBe('Notes above\n# Tasks\n- [ ] Remote task\n');
    expect(drive.peek(NAME)).toBe(text);
  });

  it('crash safety: a write that never resolves still leaves the saved text in the cache', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const cache = new MemoryCache();
    let cacheAtWrite: Promise<CachedFile | null> | null = null;
    const hanging: StorageAdapter = {
      read: (name) => drive.read(name),
      write: () => {
        cacheAtWrite = cache.get(NAME);
        return new Promise(() => {});
      },
    };
    const sync = makeSync(hanging, cache);
    await sync.open();
    void sync.save(withLocal, S);
    await until(() => cacheAtWrite !== null);
    expect((await cacheAtWrite!)?.local).toBe(withLocal);
    expect((await cache.get(NAME))).toMatchObject({ local: withLocal, dirty: true });

    // The app is killed; a new FileSync on the same cache comes back with the text and writes it.
    const reopened = makeSync(drive, cache);
    expect(await reopened.open()).toBe(withLocal);
    expect(drive.peek(NAME)).toBe(withLocal);
  });

  it('two saves in quick succession are serialized and the final remote is the second text', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const sync = makeSync(adapter);
    await sync.open();
    const first = '# Tasks\n- [ ] Buy milk\n';
    const p1 = sync.save(first, S);
    await until(() => adapter.inFlight === 1 && adapter.writes.length === 1);
    const p2 = sync.save(withLocal, first);
    await Promise.all([p1, p2]);
    expect(adapter.maxInFlight).toBe(1);
    expect(adapter.writes).toEqual([first, withLocal]);
    expect(drive.peek(NAME)).toBe(withLocal);
    expect(sync.status()).toBe('saved');
  });

  it('a save issued while a pull is in flight does not overlap and is merged with the remote change', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const sync = makeSync(adapter);
    await sync.open();
    drive.externalWrite(NAME, withRemote);

    const g = gate();
    adapter.readGate = g.promise;
    const pulled = sync.pull();
    await until(() => adapter.inFlight === 1);
    const saved = sync.save(withLocal, S);
    await tick();
    g.open();
    const [{ text, changed }] = await Promise.all([pulled, saved]);

    expect(adapter.maxInFlight).toBe(1);
    const remote = drive.peek(NAME)!;
    expect(remote).toContain('- [ ] Remote task');
    expect(remote).toContain('- [ ] Local task');
    expect(text).toBe(remote);
    expect(changed).toBe(true);
    expect(sync.text()).toBe(remote);
    expect(sync.status()).toBe('saved');
  });

  it('a save based on text the caller saw before a background merge keeps the remote change', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const inner = new MemoryCache();
    let putGate: Promise<void> | null = null;
    const cache: LocalCache = {
      get: (n) => inner.get(n),
      put: async (n, f) => {
        if (putGate) await putGate;
        await inner.put(n, f);
      },
      clear: () => inner.clear(),
    };
    const sync = makeSync(drive, cache);
    await sync.open();
    drive.externalWrite(NAME, withRemote);

    const g = gate();
    putGate = g.promise;
    const pulled = sync.pull();
    await until(() => sync.text() === withRemote); // pull took the remote; its cache write is pending
    const saved = sync.save(withLocal, S); // the caller's edit is based on S, not withRemote
    putGate = null;
    g.open();
    await Promise.all([pulled, saved]);

    const remote = drive.peek(NAME)!;
    expect(remote).toContain('- [ ] Remote task');
    expect(remote).toContain('- [ ] Local task');
    expect(sync.text()).toBe(remote);
    expect((await inner.get(NAME))).toMatchObject({ local: remote, dirty: false });
  });

  it('pull() while dirty with the remote unchanged keeps the local text and returns changed: false', async () => {
    const { drive, sync } = await opened();
    drive.setOffline(true);
    await sync.save(withLocal, S);
    drive.setOffline(false);
    expect(await sync.pull()).toEqual({ text: withLocal, changed: false });
    expect(drive.peek(NAME)).toBe(withLocal);
  });

  it('AuthRequiredError sets status signin and keeps the cache dirty', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const cache = new MemoryCache();
    const sync = makeSync(adapter, cache);
    await sync.open();
    adapter.failAll = new AuthRequiredError('sign in');
    await sync.save(withLocal, S);
    expect(sync.status()).toBe('signin');
    expect((await cache.get(NAME))).toMatchObject({ local: withLocal, dirty: true });

    adapter.failAll = null;
    await sync.pull();
    expect(sync.status()).toBe('saved');
    expect(drive.peek(NAME)).toBe(withLocal);
  });

  it('a transient plain Error goes offline, keeps the cache dirty, and the next pull retries', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const cache = new MemoryCache();
    const sync = makeSync(adapter, cache);
    await sync.open();
    adapter.failWrites = new Error('Graph 503');
    await expect(sync.save(withLocal, S)).resolves.toBeUndefined();
    expect(sync.status()).toBe('offline');
    expect((await cache.get(NAME))).toMatchObject({ local: withLocal, dirty: true });

    adapter.failWrites = null;
    await sync.pull();
    expect(sync.status()).toBe('saved');
    expect(drive.peek(NAME)).toBe(withLocal);
    expect((await cache.get(NAME))?.dirty).toBe(false);
  });

  it('gives up after 3 write attempts that all hit 412, staying dirty and offline', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const cache = new MemoryCache();
    const sync = makeSync(adapter, cache);
    await sync.open();
    adapter.failWrites = new PreconditionFailedError('412');
    let attempts = 0;
    const realWrite = adapter.write.bind(adapter);
    adapter.write = (n, t, m) => {
      attempts++;
      return realWrite(n, t, m);
    };
    await sync.save(withLocal, S);
    expect(attempts).toBe(3);
    expect(sync.status()).toBe('offline');
    expect((await cache.get(NAME))).toMatchObject({ local: withLocal, dirty: true });
  });

  it('recreates a remote file that was deleted, keeping the local text', async () => {
    const { cache } = await opened();
    await cache.put(NAME, { ...(await cache.get(NAME))!, local: withLocal, dirty: true });
    const emptied = new FakeOneDrive(); // the file is gone from OneDrive
    const sync = makeSync(emptied, cache);
    expect(await sync.open()).toBe(withLocal);
    expect(emptied.peek(NAME)).toBe(withLocal);
    expect(sync.status()).toBe('saved');
  });

  it('keeps every task when a deleted file comes back empty or cut short', async () => {
    // A folder's create is not atomic: a write that fails after creating the file leaves it empty.
    const { cache, drive } = await opened();
    const gone = new FakeOneDrive();
    const failing = new TrackingAdapter(gone);
    failing.failWrites = new OfflineError('write failed after the create');
    expect(await makeSync(failing, cache).open()).toBe(S);
    expect(drive.peek(NAME)).toBe(S);
    gone.externalWrite(NAME, '');
    const sync = makeSync(gone, cache);
    expect(await sync.open()).toBe(S);
    expect(gone.peek(NAME)).toBe(S);
    expect(await cache.get(NAME)).toMatchObject({ local: S, dirty: false });
  });

  it('notifies onStatus on change only: syncing then saved for a successful save', async () => {
    const { sync } = await opened();
    const seen: SyncStatus[] = [];
    const off = sync.onStatus((s) => seen.push(s));
    await sync.save(withLocal, S);
    expect(seen).toEqual(['syncing', 'saved']);
    off();
    await sync.save(S, withLocal);
    expect(seen).toEqual(['syncing', 'saved']);
  });

  it('a save made before open() has loaded the cache is kept (memory, cache and remote)', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const cache = new MemoryCache();
    await cache.put(NAME, { base: S, baseEtag: '"v1"', local: S, dirty: false });
    const sync = makeSync(drive, cache);
    const early = `${S}- [ ] Early\n`;
    const opening = sync.open();
    const saving = sync.save(early, S);
    await Promise.all([opening, saving]);
    expect(sync.text()).toBe(early);
    expect(drive.peek(NAME)).toBe(early);
    expect(await cache.get(NAME)).toMatchObject({ local: early, dirty: false });
    expect(sync.status()).toBe('saved');
  });

  it("a save based on the cached text, made after open has absorbed a remote change, keeps that change", async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const cache = new MemoryCache();
    await cache.put(NAME, { base: S, baseEtag: '"v1"', local: S, dirty: false });
    drive.externalWrite(NAME, `${S}- [ ] Rem\n`);
    const sync = makeSync(drive, cache);
    const opening = sync.open();
    await tick();
    const saving = sync.save(`${S}- [ ] DuringOpen\n`, S);
    const text = await opening;
    await saving;
    const remote = drive.peek(NAME)!;
    expect(remote).toContain('- [ ] Rem');
    expect(remote).toContain('- [ ] DuringOpen');
    expect(sync.text()).toBe(remote);
    expect(text).toContain('- [ ] Rem');
  });

  it('an edit of the latest text (base = what pull returned) is taken as is, with no duplicate', async () => {
    const { drive, sync } = await opened();
    const r2 = '# Tasks\n- [ ] Buy oat milk\n- [ ] Call mom\n';
    drive.externalWrite(NAME, r2);
    const { text } = await sync.pull();
    expect(text).toBe(r2);
    const edited = '# Tasks\n- [ ] Buy oat milk 📅 2026-10-20\n- [ ] Call mom\n';
    await sync.save(edited, text);
    expect(drive.peek(NAME)).toBe(edited);
    expect(sync.text()).toBe(edited);
  });

  it('a throwing onStatus listener does not stop later saves and pulls', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { drive, sync } = await opened();
      const off = sync.onStatus((s) => {
        if (s === 'syncing') throw new Error('listener boom');
      });
      const a = `${S}- [ ] A\n`;
      await expect(sync.save(a, S)).resolves.toBeUndefined();
      expect(drive.peek(NAME)).toBe(a);
      off();
      const b = `${a}- [ ] B\n`;
      await expect(sync.save(b, a)).resolves.toBeUndefined();
      await expect(sync.pull()).resolves.toEqual({ text: b, changed: false });
      expect(drive.peek(NAME)).toBe(b);
      expect(sync.status()).toBe('saved');
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("no network write starts before the save's cache write has finished", async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const inner = new MemoryCache();
    let putGate: Promise<void> | null = null;
    const events: string[] = [];
    const cache: LocalCache = {
      get: (n) => inner.get(n),
      put: async (n, f) => {
        if (putGate) await putGate;
        await inner.put(n, f);
        events.push(`put ${f.local === withLocal ? 'X' : 'other'}`);
      },
      clear: () => inner.clear(),
    };
    const sync = makeSync(adapter, cache);
    await sync.open();
    events.length = 0;

    const readGate = gate();
    adapter.readGate = readGate.promise;
    const pulled = sync.pull();
    await until(() => adapter.inFlight === 1);
    const putGateCtl = gate();
    putGate = putGateCtl.promise;
    const saved = sync.save(withLocal, S);
    readGate.open();
    for (let i = 0; i < 10; i++) await tick();
    expect(adapter.writes).toEqual([]); // the pull sees the edit, but its cache write is still pending

    putGate = null;
    putGateCtl.open();
    await Promise.all([pulled, saved]);
    expect(events[0]).toBe('put X');
    expect(adapter.writes).toEqual([withLocal]);
    expect(drive.peek(NAME)).toBe(withLocal);
  });

  it('a failed cache write in save rejects, still uploads, and the sync brings the cache up to memory', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const inner = new MemoryCache();
    let failPuts = 0;
    const cache: LocalCache = {
      get: (n) => inner.get(n),
      put: async (n, f) => {
        if (failPuts > 0) {
          failPuts--;
          throw new Error('QuotaExceededError');
        }
        await inner.put(n, f);
      },
      clear: () => inner.clear(),
    };
    const sync = makeSync(drive, cache);
    await sync.open();

    failPuts = 1;
    await expect(sync.save(withLocal, S)).rejects.toThrow('QuotaExceededError');
    expect(sync.status()).not.toBe('saved'); // offline, then syncing: the upload goes ahead (I3)
    expect(sync.text()).toBe(withLocal);

    await sync.pull();
    expect(sync.status()).toBe('saved');
    expect(drive.peek(NAME)).toBe(withLocal);
    expect(await inner.get(NAME)).toEqual({ base: withLocal, baseEtag: '"v2"', local: withLocal, dirty: false });
  });

  it('a failed cache write after a successful write is repaired by the next pull, even with nothing to sync', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const inner = new MemoryCache();
    let putsBeforeFailure = -1;
    const cache: LocalCache = {
      get: (n) => inner.get(n),
      put: async (n, f) => {
        if (putsBeforeFailure === 0) {
          putsBeforeFailure = -1;
          throw new Error('QuotaExceededError');
        }
        if (putsBeforeFailure > 0) putsBeforeFailure--;
        await inner.put(n, f);
      },
      clear: () => inner.clear(),
    };
    const sync = makeSync(drive, cache);
    await sync.open();

    putsBeforeFailure = 1; // save's own put succeeds; the put after the write fails
    await sync.save(withLocal, S);
    expect(drive.peek(NAME)).toBe(withLocal);
    expect(sync.status()).toBe('offline');
    expect(await inner.get(NAME)).toMatchObject({ dirty: true });

    expect(await sync.pull()).toEqual({ text: withLocal, changed: false }); // eTag unchanged: nothing to absorb
    expect(sync.status()).toBe('saved');
    expect(await inner.get(NAME)).toEqual({ base: withLocal, baseEtag: '"v2"', local: withLocal, dirty: false });
  });

  it('pull() reports changed when a remote change is merged in on its own 412 retry', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    let interfere = false;
    const adapter: StorageAdapter = {
      read: (n) => drive.read(n),
      write: (n, t, m) => {
        if (interfere) {
          interfere = false; // another device writes just before ours lands: 412
          drive.externalWrite(NAME, withRemote);
        }
        return drive.write(n, t, m);
      },
    };
    const sync = makeSync(adapter);
    await sync.open();
    drive.setOffline(true);
    await sync.save(withLocal, S);
    drive.setOffline(false);
    interfere = true;
    const { text, changed } = await sync.pull();
    expect(text).toContain('- [ ] Remote task');
    expect(text).toContain('- [ ] Local task');
    expect(drive.peek(NAME)).toBe(text);
    expect(changed).toBe(true);
    expect(await sync.pull()).toEqual({ text, changed: false });
  });

  it("the next pull() reports changed when a save's 412 retry merged in a remote change", async () => {
    const { drive, sync } = await opened();
    drive.externalWrite(NAME, withRemote);
    await sync.save(withLocal, S);
    const text = sync.text();
    expect(text).toContain('- [ ] Remote task');
    expect(drive.peek(NAME)).toBe(text);
    expect(await sync.pull()).toEqual({ text, changed: true }); // eTag unchanged since the save
    expect(await sync.pull()).toEqual({ text, changed: false });
  });

  it("onRemoteChange fires once a save's 412 retry merged in a remote change, and not for a plain save (#6)", async () => {
    const { drive, sync } = await opened();
    const seen: string[] = [];
    sync.onRemoteChange(() => seen.push(sync.text()));
    await sync.save(withLocal, S);
    expect(seen).toEqual([]);
    drive.externalWrite(NAME, withRemote + '- [ ] Second remote\n');
    await sync.save(`${withLocal}- [ ] Another local\n`, withLocal);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('- [ ] Second remote');
    expect(seen[0]).toContain('- [ ] Another local');
    expect(sync.status()).toBe('saved');
    await sync.pull();
    expect(seen).toHaveLength(1); // nothing new arrived
  });

  describe('nothing hangs in syncing', () => {
    /** A cache whose calls can be made to never settle, like an IndexedDB that stopped answering. */
    class HangingCache extends MemoryCache {
      hangPuts = false;
      hangGets = false;
      override get(name: string) {
        return this.hangGets ? new Promise<never>(() => {}) : super.get(name);
      }
      override put(name: string, f: CachedFile) {
        return this.hangPuts ? new Promise<never>(() => {}) : super.put(name, f);
      }
    }

    it('a cache write that never settles fails after the cache timeout; the remote is still read and the edit uploaded', async () => {
      vi.useFakeTimers();
      try {
        const drive = new FakeOneDrive({ [NAME]: S });
        const cache = new HangingCache();
        const sync = new FileSync({ name: NAME, adapter: drive, cache, merge: mergeTasksText, initial: INITIAL, cacheTimeoutMs: 1000 });
        await sync.open();
        cache.hangPuts = true;
        drive.externalWrite(NAME, withRemote);
        const pulled = sync.pull();
        await vi.advanceTimersByTimeAsync(1000);
        expect(await pulled).toEqual({ text: withRemote, changed: true });
        expect(sync.status()).toBe('offline'); // the cache is broken, so the text lives only in memory

        const saved = sync.save(`${withRemote}- [ ] Local task\n`, withRemote);
        saved.catch(() => {});
        await vi.advanceTimersByTimeAsync(3000);
        await expect(saved).rejects.toThrow('timed out');
        expect(drive.peek(NAME)).toBe(`${withRemote}- [ ] Local task\n`);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a cache read that never settles rejects open after the cache timeout, offline', async () => {
      vi.useFakeTimers();
      try {
        const cache = new HangingCache();
        cache.hangGets = true;
        const sync = new FileSync({ name: NAME, adapter: new FakeOneDrive({ [NAME]: S }), cache, merge: mergeTasksText, initial: INITIAL, cacheTimeoutMs: 1000 });
        const opening = sync.open();
        opening.catch(() => {});
        await vi.advanceTimersByTimeAsync(1000);
        await expect(opening).rejects.toThrow('timed out');
        expect(sync.status()).toBe('offline');
      } finally {
        vi.useRealTimers();
      }
    });

    it('an operation still running after stallMs shows offline, and saved once it ends', async () => {
      vi.useFakeTimers();
      try {
        const drive = new FakeOneDrive({ [NAME]: S });
        const adapter = new TrackingAdapter(drive);
        const sync = new FileSync({ name: NAME, adapter, cache: new MemoryCache(), merge: mergeTasksText, initial: INITIAL, stallMs: 5000 });
        await sync.open();
        const g = gate();
        adapter.readGate = g.promise;
        const pulled = sync.pull();
        await vi.advanceTimersByTimeAsync(4999);
        expect(sync.status()).toBe('syncing');
        await vi.advanceTimersByTimeAsync(1);
        expect(sync.status()).toBe('offline');
        g.open();
        await pulled;
        expect(sync.status()).toBe('saved');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('a failed cache load rejects and goes offline; the next open() retries the load', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const inner = new MemoryCache();
    await inner.put(NAME, { base: S, baseEtag: '"v1"', local: withLocal, dirty: true });
    let failGets = 1;
    const cache: LocalCache = {
      get: async (n) => {
        if (failGets > 0) {
          failGets--;
          throw new Error('IndexedDB unavailable');
        }
        return inner.get(n);
      },
      put: (n, f) => inner.put(n, f),
      clear: () => inner.clear(),
    };
    const sync = makeSync(drive, cache);
    await expect(sync.open()).rejects.toThrow('IndexedDB unavailable');
    expect(sync.status()).toBe('offline');
    expect(drive.peek(NAME)).toBe(S); // nothing was taken as "no cache"

    expect(await sync.open()).toBe(withLocal);
    expect(drive.peek(NAME)).toBe(withLocal);
    expect(sync.status()).toBe('saved');
  });

  it('an untouched CRLF remote is not rewritten after an offline-first open', async () => {
    const drive = new FakeOneDrive();
    drive.setOffline(true);
    const adapter = new TrackingAdapter(drive);
    const cache = new MemoryCache();
    const sync = new FileSync({ name: 'config.yaml', adapter, cache, merge: mergeTasksText, initial: 'theme: light\n' });
    expect(await sync.open()).toBe('theme: light\n');
    expect(sync.status()).toBe('offline');

    const remote = '﻿theme: light\r\nweekStart: monday';
    drive.externalWrite('config.yaml', remote);
    drive.setOffline(false);
    const { text } = await sync.pull();
    expect(adapter.writes).toEqual([]);
    expect(drive.peek('config.yaml')).toBe(remote);
    expect(text).toBe(remote);
    expect(await cache.get('config.yaml')).toEqual({ base: remote, baseEtag: '"v1"', local: remote, dirty: false });
    expect(sync.status()).toBe('saved');
  });

  it('stage() puts the edit in the cache and resolves before the network write ends', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const adapter = new TrackingAdapter(drive);
    const cache = new MemoryCache();
    const sync = makeSync(adapter, cache);
    await sync.open();
    const g = gate();
    adapter.writeGate = g.promise;

    await sync.stage(withLocal, S);
    expect(await cache.get(NAME)).toMatchObject({ local: withLocal, dirty: true });
    expect(drive.peek(NAME)).toBe(S);

    await sync.stage(`${withLocal}- [ ] Second\n`, withLocal);
    expect((await cache.get(NAME))?.local).toBe(`${withLocal}- [ ] Second\n`);

    g.open();
    await until(() => drive.peek(NAME) === `${withLocal}- [ ] Second\n` && sync.status() === 'saved');
    expect((await cache.get(NAME))?.dirty).toBe(false);
  });

  it('stage() merges onto newer text like save() and rejects when the cache put fails', async () => {
    const cache = new FailingCache();
    const drive = new FakeOneDrive({ [NAME]: S });
    const sync = makeSync(drive, cache);
    await sync.open();
    await sync.stage(withLocal, S);
    await sync.stage(withRemote, S); // started from S: merged onto withLocal
    expect(sync.text()).toBe('# Tasks\n- [ ] Remote task\n- [ ] Buy milk\n- [ ] Call mom\n- [ ] Local task\n');

    await until(() => sync.status() === 'saved');
    cache.failing = true;
    await expect(sync.stage(S, sync.text())).rejects.toThrow('put failed');
    await until(() => sync.status() === 'offline');
  });

  it('a write that landed but lost its reply is not duplicated by the next edit (M1)', async () => {
    const base = '# Tasks\n- [ ] Call the dentist\n- [ ] Other\n';
    const drive = new FakeOneDrive({ [NAME]: base });
    let loseNext = false;
    const adapter: StorageAdapter = {
      read: (n) => drive.read(n),
      async write(n, text, etag) {
        const r = await drive.write(n, text, etag);
        if (loseNext) {
          loseNext = false;
          throw new OfflineError('Request timed out'); // it landed; the reply did not
        }
        return r;
      },
    };
    const sync = makeSync(adapter);
    const shown = await sync.open();
    const v1 = shown.replace('Call the dentist', 'Call the dentist about the crown');
    loseNext = true;
    await sync.save(v1, shown);
    expect(sync.status()).toBe('offline');
    const v2 = v1.replace('about the crown', 'about the crown on Monday');
    await sync.save(v2, v1); // 412: the remote is v1, our own write
    expect(drive.peek(NAME)).toBe('# Tasks\n- [ ] Call the dentist about the crown on Monday\n- [ ] Other\n');
    expect(sync.status()).toBe('saved');

    // Lost reply, then a write that fails outright; the next pull still finds the landed one.
    const v3 = v2.replace('on Monday', 'on Tuesday');
    loseNext = true;
    await sync.save(v3, v2);
    drive.setOffline(true);
    const v4 = v3.replace('Other', 'Other thing');
    await sync.save(v4, v3);
    drive.setOffline(false);
    await sync.pull();
    expect(drive.peek(NAME)).toBe('# Tasks\n- [ ] Call the dentist about the crown on Tuesday\n- [ ] Other thing\n');
    expect(sync.status()).toBe('saved');
  });

  it('an edit whose cache write fails still goes to OneDrive at once, without a pull (I3)', async () => {
    const cache = new FailingCache();
    const drive = new FakeOneDrive({ [NAME]: S });
    const sync = makeSync(drive, cache);
    await sync.open();
    cache.failing = true; // e.g. iOS: "Connection to Indexed Database server lost"
    await expect(sync.stage(withLocal, S)).rejects.toThrow('put failed');
    expect(sync.text()).toBe(withLocal);
    await until(() => drive.peek(NAME) === withLocal);
    // The cache is still broken, so the status keeps saying the copy here is not safe.
    await until(() => sync.status() === 'offline');

    // Once the cache works again, the next sync stores the state and reaches saved.
    cache.failing = false;
    await sync.pull();
    expect(sync.status()).toBe('saved');
    expect(await cache.get(NAME)).toMatchObject({ base: withLocal, local: withLocal, dirty: false });
  });
});

describe('FileSync full storage (#68)', () => {
  it('full() is true after a full-storage failure, with status offline, until the next success', async () => {
    const adapter = new TrackingAdapter(new FakeOneDrive({ [NAME]: S }));
    const sync = makeSync(adapter);
    await sync.open();
    const seen: [SyncStatus, boolean][] = [];
    sync.onStatus((s) => seen.push([s, sync.full()]));
    adapter.failWrites = new StorageFullError('full');
    await sync.save(withLocal, S);
    expect([sync.status(), sync.full()]).toEqual(['offline', true]);
    expect(seen.at(-1)).toEqual(['offline', true]);
    adapter.failWrites = null;
    await sync.pull();
    expect([sync.status(), sync.full()]).toEqual(['saved', false]);
    expect(adapter.drive.peek(NAME)).toBe(withLocal);
  });

  it('another failure after a full one clears full() and tells the listeners, though the status stays offline', async () => {
    const adapter = new TrackingAdapter(new FakeOneDrive({ [NAME]: S }));
    const sync = makeSync(adapter);
    await sync.open();
    adapter.failWrites = new StorageFullError('full');
    await sync.save(withLocal, S);
    const seen: [SyncStatus, boolean][] = [];
    sync.onStatus((s) => seen.push([s, sync.full()]));
    adapter.failAll = new OfflineError('down');
    await sync.pull();
    expect([sync.status(), sync.full()]).toEqual(['offline', false]);
    expect(seen).toContainEqual(['offline', false]);
  });

  it('a retry that stalls after a full failure reads as offline, not full', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new TrackingAdapter(new FakeOneDrive({ [NAME]: S }));
      const sync = new FileSync({ name: NAME, adapter, cache: new MemoryCache(), merge: mergeTasksText, initial: INITIAL, stallMs: 5000 });
      await sync.open();
      adapter.failWrites = new StorageFullError('full');
      await sync.save(withLocal, S);
      expect(sync.full()).toBe(true);
      adapter.failWrites = null;
      const g = gate();
      adapter.readGate = g.promise;
      const pulled = sync.pull();
      await vi.advanceTimersByTimeAsync(5000);
      expect([sync.status(), sync.full()]).toEqual(['offline', false]);
      g.open();
      await vi.runAllTimersAsync();
      await pulled;
      expect([sync.status(), sync.full()]).toEqual(['saved', false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a sign-in failure is not full', async () => {
    const adapter = new TrackingAdapter(new FakeOneDrive({ [NAME]: S }));
    const sync = makeSync(adapter);
    await sync.open();
    adapter.failWrites = new StorageFullError('full');
    await sync.save(withLocal, S);
    adapter.failAll = new AuthRequiredError('again');
    await sync.pull();
    expect([sync.status(), sync.full()]).toEqual(['signin', false]);
  });
});

/**
 * Files by id, one of which answers to the name (`use`), as Google Drive's oldest file of a name does.
 * Reads and writes carry the id as `source` unless `sources` is false.
 */
class SourceAdapter implements StorageAdapter {
  files = new Map<string, { text: string; etag: string }>();
  current = '';
  sources = true;
  failWrites = false;
  private n = 0;

  add(id: string, text: string): void {
    this.files.set(id, { text, etag: `e${++this.n}` });
    if (this.current === '') this.current = id;
  }

  use(id: string): void {
    this.current = id;
  }

  /** Files trashed or deleted: `exists` says no. */
  gone = new Set<string>();

  async exists(source: string): Promise<boolean> {
    return this.files.has(source) && !this.gone.has(source);
  }

  async read(): Promise<RemoteFile | null> {
    const f = this.files.get(this.current);
    if (!f) return null;
    return { text: f.text, etag: f.etag, ...(this.sources && { source: this.current }) };
  }

  async write(_name: string, text: string, ifMatch: string | null): Promise<{ etag: string; source?: string }> {
    if (this.failWrites) throw new OfflineError('down');
    const f = this.files.get(this.current);
    if ((f?.etag ?? null) !== ifMatch) throw new PreconditionFailedError('changed');
    const etag = `e${++this.n}`;
    this.files.set(this.current, { text, etag });
    return { etag, ...(this.sources && { source: this.current }) };
  }
}

describe('FileSync when another file answers to the name (#67)', () => {
  const A = '# Tasks\n- [ ] Buy milk\n- [ ] From A\n';
  const B = '# Tasks\n- [ ] Buy milk\n- [ ] From B\n';
  const both = (text: string) => {
    expect(text).toContain('- [ ] From A');
    expect(text).toContain('- [ ] From B');
    expect(text.match(/Buy milk/g)).toHaveLength(1);
  };

  it('with no local edits, merges both files from an empty base and writes the result to the file in use', async () => {
    const adapter = new SourceAdapter();
    adapter.add('new', B);
    const sync = makeSync(adapter);
    await sync.open();
    adapter.add('old', A);
    adapter.use('old');
    const { text, changed } = await sync.pull();
    both(text);
    expect(changed).toBe(true);
    both(adapter.files.get('old')!.text);
    expect(adapter.files.get('new')!.text).toBe(B);
    expect(sync.status()).toBe('saved');
  });

  it('with local edits, the result has both files and the edit', async () => {
    const adapter = new SourceAdapter();
    adapter.add('new', B);
    const sync = makeSync(adapter);
    await sync.open();
    adapter.failWrites = true;
    await sync.save(`${B}- [ ] Edited here\n`, B);
    expect(sync.status()).toBe('offline');
    adapter.add('old', A);
    adapter.use('old');
    adapter.failWrites = false;
    await sync.pull();
    both(sync.text());
    expect(sync.text()).toContain('- [ ] Edited here');
    both(adapter.files.get('old')!.text);
  });

  it('when the old file is gone (trashed, then made again), the new one is taken as before', async () => {
    const adapter = new SourceAdapter();
    adapter.add('x', withRemote);
    const sync = makeSync(adapter);
    await sync.open();
    adapter.gone.add('x');
    adapter.add('y', S); // made again by a device that had deleted the remote task
    adapter.use('y');
    expect((await sync.pull()).text).toBe(S);
    expect(adapter.files.get('y')!.text).toBe(S);
  });

  it('the same file is merged against the real base, as before', async () => {
    const adapter = new SourceAdapter();
    adapter.add('one', withRemote);
    const sync = makeSync(adapter);
    await sync.open();
    adapter.files.set('one', { text: S, etag: 'later' }); // another device removed the remote task
    expect((await sync.pull()).text).toBe(S);
  });

  it('without sources, or from a cache that has none, a changed file is taken as before', async () => {
    const adapter = new SourceAdapter();
    adapter.sources = false;
    adapter.add('one', withRemote);
    const sync = makeSync(adapter);
    await sync.open();
    adapter.add('two', S);
    adapter.use('two');
    expect((await sync.pull()).text).toBe(S);

    const withSources = new SourceAdapter();
    withSources.add('two', S);
    const cache = new MemoryCache();
    await cache.put(NAME, { base: withRemote, baseEtag: 'old-etag', local: withRemote, dirty: false });
    expect(await makeSync(withSources, cache).open()).toBe(S);
    expect((await cache.get(NAME))?.baseSource).toBe('two');
  });
});

class FailingCache extends MemoryCache {
  failing = false;
  override async put(name: string, f: CachedFile): Promise<void> {
    if (this.failing) throw new Error('put failed');
    return super.put(name, f);
  }
}

describe('FileSync reads only what changed (#158)', () => {
  /**
   * A storage that records which read each pull used. `drive` is the storage behind it; swapping it for an
   * empty one stands for the file being deleted elsewhere.
   */
  function recording(files: Record<string, string> = { [NAME]: S }, withReadIfChanged = true) {
    const box = { drive: new FakeOneDrive(files) };
    const log: string[] = [];
    const adapter: StorageAdapter = {
      read: (n) => {
        log.push('read');
        return box.drive.read(n);
      },
      write: (n, t, m) => box.drive.write(n, t, m),
      ...(withReadIfChanged && {
        readIfChanged: (n: string, known: { etag: string; source?: string }) => {
          log.push(`readIfChanged ${known.etag}${known.source === undefined ? '' : ` ${known.source}`}`);
          return box.drive.readIfChanged(n, known);
        },
      }),
    };
    return { box, log, adapter };
  }

  it('reads in full while there is no eTag yet, then asks readIfChanged with the base eTag', async () => {
    const { log, adapter } = recording();
    const sync = makeSync(adapter);
    expect(await sync.open()).toBe(S);
    expect(log).toEqual(['read']);
    log.length = 0;
    expect(await sync.pull()).toEqual({ text: S, changed: false });
    expect(log).toEqual(['readIfChanged "v1"']);
    expect(sync.status()).toBe('saved');
  });

  it('an app opened again from its cached copy asks readIfChanged', async () => {
    const { log, adapter } = recording();
    const cache = new MemoryCache();
    await makeSync(adapter, cache).open();
    log.length = 0;
    const again = makeSync(adapter, cache);
    expect(await again.open()).toBe(S);
    expect(log).toEqual(['readIfChanged "v1"']);
    expect(again.status()).toBe('saved');
  });

  it('an unchanged file with edits made since still gets them written', async () => {
    const { box, log, adapter } = recording();
    const sync = makeSync(adapter);
    await sync.open();
    box.drive.setOffline(true);
    await sync.save(withLocal, S);
    expect(sync.status()).toBe('offline');
    box.drive.setOffline(false);
    log.length = 0;
    expect(await sync.pull()).toEqual({ text: withLocal, changed: false });
    expect(log).toEqual(['readIfChanged "v1"']);
    expect(box.drive.peek(NAME)).toBe(withLocal);
    expect(sync.status()).toBe('saved');
  });

  it('a file changed elsewhere comes in through readIfChanged and is merged', async () => {
    const { box, adapter } = recording();
    const sync = makeSync(adapter);
    await sync.open();
    box.drive.externalWrite(NAME, withRemote);
    expect(await sync.pull()).toEqual({ text: withRemote, changed: true });
  });

  it('a file deleted elsewhere is created again', async () => {
    const { box, adapter } = recording();
    const sync = makeSync(adapter);
    await sync.open();
    box.drive = new FakeOneDrive();
    await sync.pull();
    expect(box.drive.peek(NAME)).toBe(S);
    expect(sync.status()).toBe('saved');
  });

  it('the re-read after a write met a newer file (412) is a full read', async () => {
    const { box, log, adapter } = recording();
    const sync = makeSync(adapter);
    await sync.open();
    box.drive.externalWrite(NAME, withRemote);
    log.length = 0;
    await sync.save(withLocal, S);
    expect(log).toEqual(['read']);
    expect(box.drive.peek(NAME)).toContain('Remote task');
    expect(box.drive.peek(NAME)).toContain('Local task');
  });

  it('passes the source too, where the storage names its files (#67)', async () => {
    const drive = new FakeOneDrive({ [NAME]: S });
    const seen: unknown[] = [];
    const adapter: StorageAdapter = {
      read: async (n) => ({ ...(await drive.read(n))!, source: 'file-1' }),
      readIfChanged: async (n, known) => {
        seen.push(known);
        return drive.readIfChanged(n, known);
      },
      write: async (n, t, m) => ({ ...(await drive.write(n, t, m)), source: 'file-1' }),
    };
    const sync = makeSync(adapter);
    await sync.open();
    await sync.pull();
    expect(seen).toEqual([{ etag: '"v1"', source: 'file-1' }]);
  });

  it('a storage without readIfChanged is read in full, as before', async () => {
    const { log, adapter } = recording({ [NAME]: S }, false);
    const sync = makeSync(adapter);
    await sync.open();
    await sync.pull();
    expect(log).toEqual(['read', 'read']);
  });
});
