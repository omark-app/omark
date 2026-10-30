import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { IdbBlobs, IdbCache, MemoryBlobs, MemoryCache } from '../src/cache.ts';
import type { CachedFile, LocalCache } from '../src/cache.ts';

let n = 0;
const sample = (): CachedFile => ({ base: 'a', baseEtag: 'e1', local: 'b', dirty: true });

function cacheContract(name: string, make: () => LocalCache): void {
  describe(`${name} (LocalCache contract)`, () => {
    it('returns null on an empty cache', async () => {
      expect(await make().get('tasks.md')).toBeNull();
    });

    it('round-trips a put', async () => {
      const c = make();
      await c.put('tasks.md', sample());
      expect(await c.get('tasks.md')).toEqual(sample());
    });

    it('round-trips a null baseEtag and keeps files separate', async () => {
      const c = make();
      await c.put('done.md', { base: '', baseEtag: null, local: 'x', dirty: false });
      expect(await c.get('done.md')).toEqual({ base: '', baseEtag: null, local: 'x', dirty: false });
      expect(await c.get('tasks.md')).toBeNull();
    });

    it('clear empties the cache', async () => {
      const c = make();
      await c.put('tasks.md', sample());
      await c.put('config.yaml', sample());
      await c.clear();
      expect(await c.get('tasks.md')).toBeNull();
      expect(await c.get('config.yaml')).toBeNull();
    });

    it('returns copies so callers cannot mutate cached state', async () => {
      const c = make();
      const input = sample();
      await c.put('tasks.md', input);
      input.local = 'mutated-input';
      const out = (await c.get('tasks.md'))!;
      out.local = 'mutated-output';
      expect((await c.get('tasks.md'))!.local).toBe('b');
    });
  });
}

cacheContract('MemoryCache', () => new MemoryCache());
cacheContract('IdbCache', () => new IdbCache(`test-contract-${n++}`));

describe('IdbCache persistence', () => {
  it('data survives a new instance on the same dbName', async () => {
    const db = `test-persist-${n++}`;
    await new IdbCache(db).put('tasks.md', sample());
    expect(await new IdbCache(db).get('tasks.md')).toEqual(sample());
  });
});

describe('IdbCache reconnect (I3)', () => {
  it('reopens the store once when an operation fails, and keeps the reopened store', async () => {
    const db = `test-reconnect-${n++}`;
    let opened = 0;
    const dead: UseStore = () => Promise.reject(new Error('Connection to Indexed Database server lost'));
    const open = (dbName: string, storeName: string): UseStore => (++opened === 1 ? dead : createStore(dbName, storeName));
    const c = new IdbCache(db, open);
    await c.put('tasks.md', sample());
    expect(opened).toBe(2);
    expect(await c.get('tasks.md')).toEqual(sample());
    expect(opened).toBe(2);
    expect(await new IdbCache(db).get('tasks.md')).toEqual(sample());
  });

  it('rejects when the reopened store fails too', async () => {
    const dead: UseStore = () => Promise.reject(new Error('gone'));
    const c = new IdbCache(`test-reconnect-${n++}`, () => dead);
    await expect(c.put('tasks.md', sample())).rejects.toThrow('gone');
  });
});

for (const [name, make] of [
  ['MemoryBlobs', () => new MemoryBlobs()],
  ['IdbBlobs', () => new IdbBlobs(`blobs-${Math.random()}`)],
] as const) {
  describe(`${name} (pictures kept on this device)`, () => {
    it('gives null for a name it does not have, and back the bytes and type it was given', async () => {
      const keep = make();
      expect(await keep.get('climbing.jpg')).toBeNull();
      await keep.put('climbing.jpg', new Blob([new Uint8Array([0xff, 0xd8, 0, 200])], { type: 'image/jpeg' }));
      const got = await keep.get('climbing.jpg');
      expect(got?.type).toBe('image/jpeg');
      expect([...new Uint8Array(await got!.arrayBuffer())]).toEqual([0xff, 0xd8, 0, 200]);
      await keep.delete('climbing.jpg');
      expect(await keep.get('climbing.jpg')).toBeNull();
    });

    it('clear forgets every picture', async () => {
      const keep = make();
      await keep.put('a.jpg', new Blob(['a']));
      await keep.put('b.jpg', new Blob(['b']));
      await keep.clear();
      expect(await keep.get('a.jpg')).toBeNull();
      expect(await keep.get('b.jpg')).toBeNull();
    });
  });
}
