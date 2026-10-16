import { mergeTasksText } from '@taskapp/core';
import { describe, expect, it, vi } from 'vitest';
import type { FileName, RemoteFile, StorageAdapter } from '../src/adapter.ts';
import type { CachedFile, LocalCache } from '../src/cache.ts';
import { MemoryCache } from '../src/cache.ts';
import { AuthRequiredError, PreconditionFailedError } from '../src/errors.ts';
import { FakeOneDrive } from '../src/fake-onedrive.ts';
import { FileSync } from '../src/file-sync.ts';
import type { SyncStatus } from '../src/file-sync.ts';

const NAME: FileName = 'tasks.md';
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
  failWrites: Error | null = null;
  failAll: Error | null = null;

  constructor(readonly drive: FakeOneDrive) {}

  async read(name: FileName): Promise<RemoteFile | null> {
    if (this.failAll) throw this.failAll;
    return this.track(async () => {
      if (this.readGate) await this.readGate;
      return this.drive.read(name);
    });
  }

  async write(name: FileName, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    if (this.failAll) throw this.failAll;
    if (this.failWrites) throw this.failWrites;
    this.writes.push(text);
    return this.track(async () => {
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
    drive.externalWrite(NAME, '# Always\n- Water\n\n# Tasks\n- [ ] Remote task\n');
    drive.setOffline(false);
    const { text } = await sync.pull();
    expect(text).toBe('# Always\n- Water\n\n# Tasks\n- [ ] Remote task\n');
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

  it("a save made during open's pull keeps the other device's change", async () => {
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

  it('a failed cache write in save rejects, goes offline, and a later sync brings the cache up to memory', async () => {
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
    expect(sync.status()).toBe('offline');
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
});
