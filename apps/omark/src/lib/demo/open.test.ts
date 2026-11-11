import 'fake-indexeddb/auto';
import { IdbCache, IdbDrive } from '@omark/storage';
import { describe, expect, it } from 'vitest';
import { askDemoReset, DEMO_DBS, openDemo, requestDemoReset, resetDemo, takeDemoReset } from './open.ts';
import { demoWorld } from './world.ts';

const ZONE = 'Europe/Lisbon';
const picture = async (name: string) => new Blob([`bytes of ${name}`], { type: 'image/jpeg' });

/** A stand-in for localStorage or sessionStorage. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, v),
    removeItem: (k) => void items.delete(k),
    clear: () => items.clear(),
  };
}

/** A demo with nothing kept yet, as on a new browser. */
const fresh = () => resetDemo(null);

describe('openDemo', () => {
  it('seeds an empty demo with the world of the day, the pictures included', async () => {
    await fresh();
    const local = memoryStorage();
    const demo = await openDemo('2026-10-29', ZONE, { pictures: picture, local });
    const world = demoWorld('2026-10-29', ZONE);
    expect(demo.durable).toBe(true);
    expect(demo.day).toBe('2026-10-29');
    expect((await demo.root.read('config.yaml'))?.text).toBe(world.root['config.yaml']);
    expect((await demo.root.read('projects.csv'))?.text).toBe(world.root['projects.csv']);
    expect((await demo.tasks.read('tasks.md'))?.text).toBe(world.tasks['tasks.md']);
    expect((await demo.time.read('events-2026.csv'))?.text).toBe(world.time['events-2026.csv']);
    expect((await demo.goals.read('goals.md'))?.text).toBe(world.goals['goals.md']);
    for (const name of world.pictures) expect(await (await demo.images.readBytes(name))?.text()).toBe(`bytes of ${name}`);
  });

  it('keeps edits and the day it was seeded on the next open, even on a later day', async () => {
    await fresh();
    const local = memoryStorage();
    const first = await openDemo('2026-10-29', ZONE, { pictures: picture, local });
    const file = (await first.tasks.read('tasks.md'))!;
    await first.tasks.write('tasks.md', `${file.text}- [ ] Buy stamps\n`, file.etag);
    const again = await openDemo('2026-11-02', ZONE, { pictures: picture, local });
    expect((await again.tasks.read('tasks.md'))?.text).toContain('- [ ] Buy stamps');
    expect(again.day).toBe('2026-10-29');
  });

  it('a reset empties every demo store and seeds the world of the new day', async () => {
    await fresh();
    const local = memoryStorage();
    const first = await openDemo('2026-10-29', ZONE, { pictures: picture, local });
    await first.goals.write('goals.md', '# Vision\n\nChanged\n', (await first.goals.read('goals.md'))!.etag);
    await new IdbCache(DEMO_DBS.tasksCopy).put('tasks.md', { base: 'x', local: 'y', baseEtag: '"v1"' } as never);
    local.setItem('omark:parts:demo', 'parts: [tasks]\n');
    local.setItem('omark:parts-pending:demo', '[]');

    const reset = await openDemo('2026-11-02', ZONE, { pictures: picture, local, reset: true });
    expect(reset.day).toBe('2026-11-02');
    expect((await reset.goals.read('goals.md'))?.text).toBe(demoWorld('2026-11-02', ZONE).goals['goals.md']);
    expect(await new IdbCache(DEMO_DBS.tasksCopy).get('tasks.md')).toBeNull();
    expect(local.getItem('omark:parts:demo')).toBeNull();
    expect(local.getItem('omark:parts-pending:demo')).toBeNull();
  });

  it('adds the pictures before the top folder, so a seed cut short before them starts again', async () => {
    await fresh();
    const rootEmpty: boolean[] = [];
    let root: { isEmpty(): Promise<boolean> } | null = null;
    await openDemo('2026-10-29', ZONE, {
      local: memoryStorage(),
      drive: (name) => {
        const d = new IdbDrive(name);
        if (name === DEMO_DBS.root) root = d;
        return d;
      },
      pictures: async (name) => {
        rootEmpty.push(await root!.isEmpty());
        return picture(name);
      },
    });
    expect(rootEmpty).toEqual([true, true, true, true]);
  });

  it('seeds the rest when a picture cannot be loaded', async () => {
    await fresh();
    const demo = await openDemo('2026-10-29', ZONE, {
      pictures: async (name) => (name === 'money.jpg' ? Promise.reject(new Error('offline')) : picture(name)),
      local: memoryStorage(),
    });
    expect(await demo.images.readBytes('money.jpg')).toBeNull();
    expect(await demo.images.readBytes('health.jpg')).not.toBeNull();
    expect((await demo.goals.read('goals.md'))?.text).toContain('## Money #money');
  });

  it('runs on the world in memory when IndexedDB is unusable', async () => {
    const demo = await openDemo('2026-10-29', ZONE, {
      pictures: picture,
      local: memoryStorage(),
      drive: () => {
        throw new Error('IndexedDB blocked');
      },
    });
    expect(demo.durable).toBe(false);
    expect((await demo.tasks.read('tasks.md'))?.text).toBe(demoWorld('2026-10-29', ZONE).tasks['tasks.md']);
    expect(await demo.images.readBytes('health.jpg')).not.toBeNull();
  });
});

describe('Reset demo', () => {
  it('is asked for once, for the next start', () => {
    const session = memoryStorage();
    expect(takeDemoReset(() => session)).toBe(false);
    requestDemoReset(() => session);
    expect(takeDemoReset(() => session)).toBe(true);
    expect(takeDemoReset(() => session)).toBe(false);
  });

  it('asks first, then reloads into a start that resets; a no keeps everything', async () => {
    const session = memoryStorage();
    const reloads: number[] = [];
    const answers = [false, true];
    const ask = () => askDemoReset({ confirm: () => answers.shift()!, reload: () => void reloads.push(1), session: () => session });
    await ask();
    expect(reloads).toEqual([]);
    expect(takeDemoReset(() => session)).toBe(false);
    await ask();
    expect(reloads).toEqual([1]);
    expect(takeDemoReset(() => session)).toBe(true);
  });

  it('resets at once where session storage is blocked, then reloads', async () => {
    const steps: string[] = [];
    await askDemoReset({
      confirm: () => true,
      reload: () => void steps.push('reload'),
      session: () => {
        throw new Error('blocked');
      },
      resetNow: async () => void steps.push('reset'),
    });
    expect(steps).toEqual(['reset', 'reload']);
  });

  it('is never asked for where session storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    expect(() => requestDemoReset(blocked)).not.toThrow();
    expect(takeDemoReset(blocked)).toBe(false);
  });
});
