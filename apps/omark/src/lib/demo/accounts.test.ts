import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoAccounts } from './accounts.ts';
import { DEMO_DBS, DEMO_KEY, DEMO_SYNCED_KEY, resetDemo } from './open.ts';
import { demoWorld } from './world.ts';

const ZONE = 'Europe/Lisbon';
const DAY = '2026-10-29';
const pictures = async (name: string) => new Blob([`bytes of ${name}`], { type: 'image/jpeg' });

beforeEach(async () => {
  // Time's fake calendar publishes itself on `window` for the e2e.
  vi.stubGlobal('window', {});
  await resetDemo(null);
});
afterEach(() => vi.unstubAllGlobals());

const open = (reset = false) => demoAccounts({ today: () => DAY, timeZone: ZONE, pictures, reset: () => reset, local: null });

describe('demoAccounts (U.6)', () => {
  it('is the demo: no storage to choose, every sign-in already done', async () => {
    const a = open();
    expect(a.demo).toBe(true);
    expect(a.resetDemo).toBeTypeOf('function');
    expect(await a.storages()).toEqual([]);
    expect(a.calendar('folder')).toMatchObject({ access: null });
    expect(a.calendar('folder').auth.isSignedIn()).toBe(true);
  });

  it('opens the world in this browser, under the demo\'s own names', async () => {
    const place = (await open().open('folder'))!;
    expect(place).toMatchObject({ storage: 'folder', storageName: 'this browser', key: DEMO_KEY });
    expect((await place.root.read('config.yaml'))?.text).toBe(demoWorld(DAY, ZONE).root['config.yaml']);
    expect((await place.pictures().readBytes('health.jpg'))?.size).toBeGreaterThan(0);
    expect(place.tasks()).toMatchObject({ provider: 'folder', storageName: 'this browser', cacheDb: DEMO_DBS.tasksCopy, syncedKey: DEMO_SYNCED_KEY, auth: null });
    expect((await place.tasks().adapter.read('tasks.md'))?.text).toBe(demoWorld(DAY, ZONE).tasks['tasks.md']);
  });

  it('gives Time the made-up calendar with edit access, its first run done and the Calendar view', async () => {
    const place = (await open().open('folder'))!;
    const time = await place.time();
    expect(time).toMatchObject({ storage: 'folder', storageName: 'this browser', key: DEMO_KEY, calendarAccess: null, calendarView: true });
    expect(time.calendar.isSignedIn()).toBe(true);
    expect(await time.prefs!.load()).toMatchObject({ started: true, askedEdit: true });
    const events = await time.source!.readChanges('primary', null);
    expect(events.events.length).toBe(demoWorld(DAY, ZONE).calendar.events.filter((e) => e.status !== 'cancelled').length);
    // Edit access: colouring can write.
    const first = events.events[0]!;
    await expect(time.source!.setColour('primary', first.id, { colorId: '10', marker: null })).resolves.toBeUndefined();
  });

  it('leaves a picture out when the host answers with a page instead of the image', async () => {
    // Cloudflare Pages and `vite dev` answer a missing file with index.html and 200.
    vi.stubGlobal('fetch', async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const place = (await demoAccounts({ today: () => DAY, timeZone: ZONE, reset: () => false, local: null }).open('folder'))!;
    expect(await place.pictures().readBytes('health.jpg')).toBeNull();
  });

  it('keeps edits across opens, and a reset brings the world back', async () => {
    const place = (await open().open('folder'))!;
    const file = (await place.tasks().adapter.read('tasks.md'))!;
    await place.tasks().adapter.write('tasks.md', 'edited\n', file.etag);
    const again = (await open().open('folder'))!;
    expect((await again.tasks().adapter.read('tasks.md'))?.text).toBe('edited\n');
    const reset = (await open(true).open('folder'))!;
    expect((await reset.tasks().adapter.read('tasks.md'))?.text).toBe(demoWorld(DAY, ZONE).tasks['tasks.md']);
  });
});
