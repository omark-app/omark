import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { PreconditionFailedError } from '../src/errors.ts';
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

  it('does not report a write whose transaction aborts after the put succeeded', async () => {
    // Every readwrite transaction aborts as soon as its put request succeeds, so nothing commits.
    const aborting = (dbName: string, storeName: string): UseStore => {
      const real = createStore(dbName, storeName);
      return (mode, callback) =>
        real(mode, (objectStore) => {
          if (mode !== 'readwrite') return callback(objectStore);
          const put = objectStore.put.bind(objectStore);
          objectStore.put = (value, key) => {
            const request = put(value, key);
            request.addEventListener('success', () => objectStore.transaction.abort());
            return request;
          };
          return callback(objectStore);
        });
    };
    const name = freshName();
    await new IdbDrive(name).seed({ 'tasks.md': 'x' });
    const drive = new IdbDrive(name, aborting);
    const outcome = await drive.write('tasks.md', 'y', '"v1"').then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(outcome).toBe('rejected');
    expect(await drive.read('tasks.md')).toEqual({ text: 'x', etag: '"v1"' });
  });

  it('stores nothing when a write is rejected', async () => {
    const drive = new IdbDrive(freshName());
    await expect(drive.write('x', 'a', '"v1"')).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(await drive.isEmpty()).toBe(true);
  });
});
