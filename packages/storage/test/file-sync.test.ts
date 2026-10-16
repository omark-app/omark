import { mergeTasksText } from '@taskapp/core';
import { describe, expect, it } from 'vitest';
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
    await sync.save(withLocal);
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
    await sync.save(withLocal);
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
    await sync.save('# Tasks\n- [ ] Buy oat milk\n- [ ] Call mom\n');
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
    void sync.save(withLocal);
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
    const p1 = sync.save(first);
    await until(() => adapter.inFlight === 1 && adapter.writes.length === 1);
    const p2 = sync.save(withLocal);
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
    const saved = sync.save(withLocal);
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
    const saved = sync.save(withLocal); // the caller's edit is based on S, not withRemote
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
    await sync.save(withLocal);
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
    await sync.save(withLocal);
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
    await expect(sync.save(withLocal)).resolves.toBeUndefined();
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
    await sync.save(withLocal);
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
    await sync.save(withLocal);
    expect(seen).toEqual(['syncing', 'saved']);
    off();
    await sync.save(S);
    expect(seen).toEqual(['syncing', 'saved']);
  });
});
