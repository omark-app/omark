import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IdbCache, MemoryCache } from '../src/cache.ts';
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
