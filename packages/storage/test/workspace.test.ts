import { DEFAULT_CONFIG_YAML } from '@taskapp/core';
import { describe, expect, it } from 'vitest';
import type { FileName, RemoteFile, StorageAdapter } from '../src/adapter.ts';
import { MemoryCache } from '../src/cache.ts';
import { OfflineError } from '../src/errors.ts';
import { FakeOneDrive } from '../src/fake-onedrive.ts';
import type { SyncStatus } from '../src/file-sync.ts';
import { createWorkspace } from '../src/workspace.ts';

const TASKS0 = '# Always\n\n# Tasks\n';
const S = '# Always\n\n# Tasks\n- [ ] Buy milk\n- [ ] Call mom\n';

/** Delegates to a drive but can take single files offline. */
class PerFileAdapter implements StorageAdapter {
  down = new Set<FileName>();
  constructor(readonly drive: FakeOneDrive) {}
  async read(name: FileName): Promise<RemoteFile | null> {
    if (this.down.has(name)) throw new OfflineError('Offline');
    return this.drive.read(name);
  }
  async write(name: FileName, text: string, ifMatch: string | null) {
    if (this.down.has(name)) throw new OfflineError('Offline');
    return this.drive.write(name, text, ifMatch);
  }
}

describe('createWorkspace', () => {
  it('creates the three files on first run, done.md as a zero-byte file', async () => {
    const drive = new FakeOneDrive();
    const snap = await createWorkspace(drive, new MemoryCache()).open();
    expect(snap).toEqual({ tasks: TASKS0, done: '', config: DEFAULT_CONFIG_YAML });
    expect(drive.peek('tasks.md')).toBe(TASKS0);
    expect(drive.peek('done.md')).toBe('');
    expect(drive.peek('config.yaml')).toBe(DEFAULT_CONFIG_YAML);
  });

  it('does not overwrite existing files', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': S, 'done.md': 'x\n', 'config.yaml': 'a: 1\n' });
    const snap = await createWorkspace(drive, new MemoryCache()).open();
    expect(snap).toEqual({ tasks: S, done: 'x\n', config: 'a: 1\n' });
    expect(drive.peek('tasks.md')).toBe(S);
    expect(drive.peek('config.yaml')).toBe('a: 1\n');
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
});
