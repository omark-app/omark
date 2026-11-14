import { DEFAULT_CONFIG_YAML } from '@omark/tasks-core';
import { FakeOneDrive, MemoryCache, OfflineError, StorageFullError } from '@omark/storage';
import type { CachedFile, RemoteFile, StorageAdapter, SyncStatus } from '@omark/storage';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from './workspace.ts';
import type { TaskFile } from './workspace.ts';

const TASKS0 = '# Tasks\n';
const S = '# Always\n\n# Tasks\n- [ ] Buy milk\n- [ ] Call mom\n';

/** Delegates to a drive but can take single files offline. */
class PerFileAdapter implements StorageAdapter {
  down = new Set<TaskFile>();
  full = false;
  /** Every call fails as the sign-in server unreachable (#157). */
  signinDown = false;
  constructor(readonly drive: FakeOneDrive) {}
  /** A read of the file waits for its gate. */
  gates = new Map<TaskFile, Promise<void>>();
  async read(name: TaskFile): Promise<RemoteFile | null> {
    await this.gates.get(name);
    if (this.signinDown) throw new OfflineError('Sign-in helper unreachable', 'signin');
    if (this.down.has(name)) throw new OfflineError('Offline');
    return this.drive.read(name);
  }
  async write(name: TaskFile, text: string, ifMatch: string | null) {
    if (this.down.has(name)) throw new OfflineError('Offline');
    if (this.full) throw new StorageFullError('Full');
    return this.drive.write(name, text, ifMatch);
  }
}

describe('createWorkspace', () => {
  it('creates the three files on first run, done.md as a zero-byte file', async () => {
    const drive = new FakeOneDrive();
    const snap = await createWorkspace(drive, new MemoryCache()).open();
    expect(snap).toEqual({ tasks: TASKS0, done: '', config: DEFAULT_CONFIG_YAML, fromCache: false });
    expect(drive.peek('tasks.md')).toBe(TASKS0);
    expect(drive.peek('done.md')).toBe('');
    expect(drive.peek('config.yaml')).toBe(DEFAULT_CONFIG_YAML);
  });

  it('does not overwrite existing files', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': S, 'done.md': 'x\n', 'config.yaml': 'a: 1\n' });
    const snap = await createWorkspace(drive, new MemoryCache()).open();
    expect(snap).toEqual({ tasks: S, done: 'x\n', config: 'a: 1\n', fromCache: false });
    expect(drive.peek('tasks.md')).toBe(S);
    expect(drive.peek('config.yaml')).toBe('a: 1\n');
  });

  it('open() with all three files cached returns the cached text at once, before any read', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': S, 'done.md': '', 'config.yaml': 'a: 1\n' });
    const cache = new MemoryCache();
    await createWorkspace(drive, cache).open();
    drive.externalWrite('tasks.md', `${S}- [ ] From elsewhere\n`);

    // A network that never answers ("lie-fi"): open() must not wait for it.
    const reads: string[] = [];
    const hung: StorageAdapter = {
      read: (name) => {
        reads.push(name);
        return new Promise(() => {});
      },
      write: () => new Promise(() => {}),
    };
    const snap = await createWorkspace(hung, cache).open();
    expect(snap).toEqual({ tasks: S, done: '', config: 'a: 1\n', fromCache: true });
    expect(reads).toEqual([]);

    // A refresh afterwards brings the remote in; the status reads syncing until it has.
    const ws = createWorkspace(drive, cache);
    expect((await ws.open()).fromCache).toBe(true);
    expect(ws.status()).toBe('syncing');
    const r = await ws.refresh();
    expect(r.changed).toBe(true);
    expect(r.tasks).toContain('From elsewhere');
    expect(ws.status()).toBe('saved');
  });

  it('open() pulls first when any file has no cached copy', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': S, 'done.md': 'x\n' });
    const cache = new MemoryCache();
    await cache.put('tasks.md', { base: S, baseEtag: '"v1"', local: S, dirty: false });
    const snap = await createWorkspace(drive, cache).open();
    expect(snap).toEqual({ tasks: S, done: 'x\n', config: DEFAULT_CONFIG_YAML, fromCache: false });
  });

  it('refresh reports an external config.yaml edit', async () => {
    const drive = new FakeOneDrive();
    const ws = createWorkspace(drive, new MemoryCache());
    await ws.open();
    expect((await ws.refresh()).changed).toBe(false);
    drive.externalWrite('config.yaml', 'new: 1\n');
    const r = await ws.refresh();
    expect(r.changed).toBe(true);
    expect(r.config).toBe('new: 1\n');
    expect((await ws.refresh()).changed).toBe(false);
  });

  it('save writes tasks and done, each only when given', async () => {
    const drive = new FakeOneDrive();
    const ws = createWorkspace(drive, new MemoryCache());
    await ws.open();
    await ws.save({ tasks: { text: S, base: TASKS0 } });
    expect(drive.peek('tasks.md')).toBe(S);
    expect(drive.peek('done.md')).toBe('');
    await ws.save({ done: { text: 'd\n', base: '' } });
    expect(drive.peek('done.md')).toBe('d\n');
    expect(ws.status()).toBe('saved');
  });

  it('a save with a stale base merges with an external change pulled in between', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': S });
    const ws = createWorkspace(drive, new MemoryCache());
    await ws.open();
    const external = '# Always\n\n# Tasks\n- [ ] Remote task\n- [ ] Buy milk\n- [ ] Call mom\n';
    drive.externalWrite('tasks.md', external);
    const r = await ws.refresh();
    expect(r.tasks).toBe(external);
    const mine = `${S}- [ ] Local task\n`;
    await ws.save({ tasks: { text: mine, base: S } });
    const out = drive.peek('tasks.md') as string;
    expect(out).toContain('Remote task');
    expect(out).toContain('Local task');
    expect(out).toContain('Buy milk');
  });

  it('full() is true while a file\'s last save failed on a full storage, and onStatus tells of it (#68)', async () => {
    const drive = new FakeOneDrive();
    const adapter = new PerFileAdapter(drive);
    const ws = createWorkspace(adapter, new MemoryCache());
    const snap = await ws.open();
    const seen: [SyncStatus, boolean][] = [];
    ws.onStatus((s) => seen.push([s, ws.full()]));
    adapter.full = true;
    await ws.save({ tasks: { text: '# Tasks\n- [ ] a\n', base: snap.tasks } });
    expect([ws.status(), ws.full()]).toEqual(['offline', true]);
    expect(seen.at(-1)).toEqual(['offline', true]);
    adapter.full = false;
    adapter.down.add('tasks.md');
    await ws.refresh();
    expect([ws.status(), ws.full()]).toEqual(['offline', false]);
    expect(seen.at(-1)).toEqual(['offline', false]);
  });

  it("signInUnreachable() is true while a file's last sync failed to reach the sign-in server, and onStatus tells of it (#157)", async () => {
    const drive = new FakeOneDrive();
    const adapter = new PerFileAdapter(drive);
    const ws = createWorkspace(adapter, new MemoryCache());
    await ws.open();
    const seen: [SyncStatus, boolean][] = [];
    ws.onStatus((s) => seen.push([s, ws.signInUnreachable()]));
    adapter.signinDown = true;
    await ws.refresh();
    expect([ws.status(), ws.signInUnreachable()]).toEqual(['offline', true]);
    expect(seen.at(-1)).toEqual(['offline', true]);
    adapter.signinDown = false;
    adapter.down.add('tasks.md');
    await ws.refresh();
    expect([ws.status(), ws.signInUnreachable()]).toEqual(['offline', false]);
    expect(seen.at(-1)).toEqual(['offline', false]);
  });

  it('signInUnreachable() counts only the files whose status the workspace shows (#157)', async () => {
    const drive = new FakeOneDrive();
    const adapter = new PerFileAdapter(drive);
    const ws = createWorkspace(adapter, new MemoryCache());
    await ws.open();
    adapter.signinDown = true;
    await ws.refresh();
    expect(ws.signInUnreachable()).toBe(true);
    // The retry: tasks.md now fails on the storage itself while done.md's read, still under way, has the old cause.
    adapter.signinDown = false;
    adapter.down.add('tasks.md');
    let open!: () => void;
    adapter.gates.set('done.md', new Promise<void>((r) => (open = r)));
    const refreshed = ws.refresh();
    await expect.poll(() => ws.status()).toBe('offline');
    await expect.poll(() => ws.signInUnreachable()).toBe(false);
    open();
    await refreshed;
  });

  it('status is the worst of the three and onStatus fires on combined changes', async () => {
    const drive = new FakeOneDrive();
    const adapter = new PerFileAdapter(drive);
    const ws = createWorkspace(adapter, new MemoryCache());
    const seen: SyncStatus[] = [];
    ws.onStatus((s) => seen.push(s));
    await ws.open();
    expect(ws.status()).toBe('saved');
    seen.length = 0;

    adapter.down.add('done.md');
    await ws.refresh();
    expect(ws.status()).toBe('offline');
    expect(seen.filter((s) => s === 'offline')).toHaveLength(1);
    expect(seen.at(-1)).toBe('offline');

    adapter.down.clear();
    await ws.refresh();
    expect(ws.status()).toBe('saved');
    expect(seen.at(-1)).toBe('saved');
    expect(seen.every((s, i) => i === 0 || s !== seen[i - 1])).toBe(true);
  });

  it('stage() caches both files without waiting for the network', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': S });
    const cache = new MemoryCache();
    const ws = createWorkspace(drive, cache);
    await ws.open();
    drive.setOffline(true);
    const tasks = `${S}- [ ] New\n`;
    const done = '- [x] Old ✅ 2026-10-16\n';
    await ws.stage({ tasks: { text: tasks, base: S }, done: { text: done, base: '' } });
    expect((await cache.get('tasks.md'))?.local).toBe(tasks);
    expect((await cache.get('done.md'))?.local).toBe(done);
    expect(drive.peek('tasks.md')).toBe(S);
  });

  it('stage({ config }) writes config.yaml, and a 412 merge reports the conflicts by label', async () => {
    const drive = new FakeOneDrive({ 'config.yaml': 'theme: system\n' });
    const ws = createWorkspace(drive, new MemoryCache());
    const seen: string[][] = [];
    ws.onConfigConflict((labels) => seen.push(labels));
    await ws.open();
    await ws.stage({ config: { text: 'theme: light\n', base: 'theme: system\n' } });
    await ws.refresh(); // queued behind the upload
    expect(drive.peek('config.yaml')).toBe('theme: light\n');

    // Another device changed the theme too, and the save delay: the write meets it (412) and merges.
    drive.externalWrite('config.yaml', 'theme: dark\nsaveDelaySeconds: 2\n');
    await ws.save({ config: { text: 'theme: system\n', base: 'theme: light\n' } });
    expect(drive.peek('config.yaml')).toBe('theme: system\nsaveDelaySeconds: 2\n');
    expect(seen).toEqual([['Theme']]);
  });

  it('a 412 merge with a config.yaml that does not parse keeps it and reports the change as dropped', async () => {
    const drive = new FakeOneDrive({ 'config.yaml': 'theme: system\n' });
    const ws = createWorkspace(drive, new MemoryCache());
    const seen: [string[], unknown][] = [];
    ws.onConfigConflict((labels, dropped) => seen.push([labels, dropped]));
    await ws.open();
    drive.externalWrite('config.yaml', 'theme: [\n');
    await ws.save({ config: { text: 'theme: dark\n', base: 'theme: system\n' } });
    expect(drive.peek('config.yaml')).toBe('theme: [\n');
    expect(seen).toEqual([[['Theme'], 'remote-broken']]);
  });

  it('stage() still caches done.md when the tasks.md put fails, then rethrows', async () => {
    class TasksPutFails extends MemoryCache {
      failing = false;
      override async put(name: TaskFile, f: CachedFile): Promise<void> {
        if (this.failing && name === 'tasks.md') throw new Error('tasks put failed');
        return super.put(name, f);
      }
    }
    const cache = new TasksPutFails();
    const ws = createWorkspace(new FakeOneDrive({ 'tasks.md': S }), cache);
    await ws.open();
    cache.failing = true;
    const done = '- [x] Old ✅ 2026-10-16\n';
    await expect(
      ws.stage({ tasks: { text: `${S}- [ ] New\n`, base: S }, done: { text: done, base: '' } }),
    ).rejects.toThrow('tasks put failed');
    expect((await cache.get('done.md'))?.local).toBe(done);
  });
});
