import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdbCache, IdbDrive, MemoryCache } from '@omark/storage';
import { DEMO_CACHE_DB, DEMO_CACHE_WARNING, DEMO_DRIVE_DB, openDemo, requestDemoReset, resetDemo, takeDemoReset } from './demo.ts';
import type { DemoDrive } from './demo.ts';
import { sampleFiles } from './sample-files.ts';

const TODAY = '2026-10-21';
const SAMPLES = sampleFiles(TODAY);

// Each test starts with no databases at all.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('openDemo', () => {
  it('uses the demo databases and seeds an empty drive with the sample files', async () => {
    const demo = await openDemo(TODAY);
    expect(demo.cacheWarning).toBe(null);
    expect(demo.durableCache).toBe(true);
    for (const name of ['tasks.md', 'done.md', 'config.yaml'] as const) {
      expect(await demo.drive.read(name)).toEqual({ text: SAMPLES[name], etag: '"v1"' });
      expect(await new IdbDrive(DEMO_DRIVE_DB).peek(name)).toBe(SAMPLES[name]);
    }
    await demo.cache.put('tasks.md', { base: 'b', baseEtag: '"v1"', local: 'l', dirty: true });
    expect((await new IdbCache(DEMO_CACHE_DB).get('tasks.md'))?.local).toBe('l');
  });

  it('leaves a drive with files alone, so edits stay on the next open', async () => {
    await new IdbDrive(DEMO_DRIVE_DB).seed({ 'tasks.md': '# Tasks\n- [ ] Mine\n' });
    const demo = await openDemo(TODAY);
    expect(await demo.drive.read('tasks.md')).toEqual({ text: '# Tasks\n- [ ] Mine\n', etag: '"v1"' });
    expect(await demo.drive.read('done.md')).toBe(null);
  });

  it('falls back to memory with the demo warning when IndexedDB will not open', async () => {
    const blocked = (): never => {
      throw new Error('blocked');
    };
    const demo = await openDemo(TODAY, { stores: { drive: blocked, cache: blocked } });
    expect(demo.cacheWarning).toBe('This browser blocks offline storage, so demo edits are lost on reload.');
    expect(DEMO_CACHE_WARNING).toBe(demo.cacheWarning);
    expect(demo.durableCache).toBe(false);
    expect(demo.cache).toBeInstanceOf(MemoryCache);
    expect((await demo.drive.read('tasks.md'))?.text).toBe(SAMPLES['tasks.md']);
  });

  it('falls back to memory when the first use fails', async () => {
    const broken = new IdbDrive('unused') as DemoDrive;
    broken.isEmpty = () => Promise.reject(new Error('Connection to Indexed Database server lost'));
    const demo = await openDemo(TODAY, { stores: { drive: () => broken, cache: (name) => new IdbCache(name) } });
    expect(demo.cacheWarning).toBe(DEMO_CACHE_WARNING);
    expect(demo.durableCache).toBe(false);
    expect((await demo.drive.read('done.md'))?.text).toBe(SAMPLES['done.md']);
  });
});

describe('resetDemo', () => {
  it('empties the drive and the cache; the next open seeds the samples again', async () => {
    const demo = await openDemo(TODAY);
    await demo.drive.write('tasks.md', '# Tasks\n- [ ] Added in the demo\n', '"v1"');
    await demo.cache.put('tasks.md', { base: 'b', baseEtag: '"v2"', local: 'l', dirty: false });

    await resetDemo();

    expect(await new IdbDrive(DEMO_DRIVE_DB).isEmpty()).toBe(true);
    expect(await new IdbCache(DEMO_CACHE_DB).get('tasks.md')).toBe(null);
    const again = await openDemo(TODAY);
    expect(await again.drive.read('tasks.md')).toEqual({ text: SAMPLES['tasks.md'], etag: '"v1"' });
  });
});

describe('a reset on the next load', () => {
  it('openDemo with reset empties both and seeds the samples again', async () => {
    const demo = await openDemo(TODAY);
    await demo.drive.write('tasks.md', '# Tasks\n- [ ] Added in the demo\n', '"v1"');
    await demo.cache.put('tasks.md', { base: 'b', baseEtag: '"v2"', local: 'l', dirty: true });

    const again = await openDemo(TODAY, { reset: true });

    expect(await again.drive.read('tasks.md')).toEqual({ text: SAMPLES['tasks.md'], etag: '"v1"' });
    expect(await again.cache.get('tasks.md')).toBe(null);
  });

  it('is asked for once through session storage', async () => {
    const items = new Map<string, string>();
    const storage = () => ({
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    });
    expect(takeDemoReset(storage)).toBe(false);
    await requestDemoReset(storage);
    expect(takeDemoReset(storage)).toBe(true);
    expect(takeDemoReset(storage)).toBe(false);
  });

  it('without session storage, resets now', async () => {
    const demo = await openDemo(TODAY);
    await demo.drive.write('tasks.md', '# Tasks\n', '"v1"');
    await requestDemoReset(() => {
      throw new Error('blocked');
    });
    expect(await new IdbDrive(DEMO_DRIVE_DB).isEmpty()).toBe(true);
    const blocked = (): never => {
      throw new Error('blocked');
    };
    expect(takeDemoReset(blocked)).toBe(false);
  });
});
