import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IdbDrive } from '../src/idb-drive.ts';
import { adapterContract } from './adapter-contract.ts';

let n = 0;
const freshName = (): string => `drive-test-${++n}`;

adapterContract(() => {
  const drive = new IdbDrive(freshName());
  return {
    adapter: drive,
    external: (name, text) => drive.externalWrite(name, text),
    offline: (on) => drive.setOffline(on),
  };
});

describe('IdbDrive', () => {
  it('is empty when new and not after seed; seeded files read back as v1', async () => {
    const drive = new IdbDrive(freshName());
    expect(await drive.isEmpty()).toBe(true);
    await drive.seed({ 'tasks.md': 'x', 'done.md': 'y' });
    expect(await drive.isEmpty()).toBe(false);
    expect(await drive.read('tasks.md')).toEqual({ text: 'x', etag: '"v1"' });
    expect(await drive.read('done.md')).toEqual({ text: 'y', etag: '"v1"' });
  });

  it('clear empties the drive', async () => {
    const drive = new IdbDrive(freshName());
    await drive.seed({ 'tasks.md': 'x' });
    await drive.clear();
    expect(await drive.isEmpty()).toBe(true);
    expect(await drive.read('tasks.md')).toBeNull();
  });

  it('keeps text and versions in a new instance on the same database', async () => {
    const name = freshName();
    const first = new IdbDrive(name);
    await first.seed({ 'tasks.md': 'x' });
    await first.write('tasks.md', 'y', '"v1"');
    const second = new IdbDrive(name);
    expect(await second.read('tasks.md')).toEqual({ text: 'y', etag: '"v2"' });
    expect(await second.peek('tasks.md')).toBe('y');
    expect(await second.peek('done.md')).toBeNull();
  });
});
