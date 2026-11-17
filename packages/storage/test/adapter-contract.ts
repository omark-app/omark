import { describe, expect, it } from 'vitest';
import { OfflineError, PreconditionFailedError } from '../src/errors.ts';
import type { BinaryStore, StorageAdapter } from '../src/adapter.ts';

export interface ContractHarness {
  adapter: StorageAdapter;
  external(name: string, text: string): void | Promise<void>;
  offline(on: boolean): void;
}

export function adapterContract(make: () => ContractHarness): void {
  describe('StorageAdapter contract', () => {
    it('returns null when reading a missing file', async () => {
      const { adapter } = make();
      expect(await adapter.read('tasks.md')).toBeNull();
    });

    it('creates a file with ifMatch null and rejects a second create', async () => {
      const { adapter } = make();
      const written = await adapter.write('tasks.md', 'a', null);
      const { etag } = written;
      expect(etag).toBeTruthy();
      // A storage that names files (Google Drive) gives the same `source` on both; the rest give none.
      const read = await adapter.read('tasks.md');
      const source = written.source === undefined ? {} : { source: written.source };
      expect(read).toEqual({ text: 'a', etag, ...source });
      await expect(adapter.write('tasks.md', 'b', null)).rejects.toBeInstanceOf(PreconditionFailedError);
    });

    it('writes with the current etag and returns a new etag', async () => {
      const { adapter } = make();
      const first = await adapter.write('done.md', 'a', null);
      const second = await adapter.write('done.md', 'b', first.etag);
      expect(second.etag).not.toBe(first.etag);
      expect((await adapter.read('done.md'))?.text).toBe('b');
    });

    it('rejects a stale etag after an external write', async () => {
      const { adapter, external } = make();
      const { etag } = await adapter.write('tasks.md', 'a', null);
      await external('tasks.md', 'other device');
      await expect(adapter.write('tasks.md', 'b', etag)).rejects.toBeInstanceOf(PreconditionFailedError);
    });

    it('reads externally written text', async () => {
      const { adapter, external } = make();
      await external('config.yaml', 'from elsewhere');
      expect((await adapter.read('config.yaml'))?.text).toBe('from elsewhere');
    });

    it('throws OfflineError for read and write while offline', async () => {
      const { adapter, offline } = make();
      offline(true);
      await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
      await expect(adapter.write('tasks.md', 'a', null)).rejects.toBeInstanceOf(OfflineError);
      offline(false);
      expect(await adapter.read('tasks.md')).toBeNull();
    });
  });
}

/** The `readIfChanged` contract, for the adapters that have the method (#158). */
export function readIfChangedContract(make: () => ContractHarness): void {
  describe('StorageAdapter readIfChanged contract', () => {
    /** The adapter's `readIfChanged`, which the adapters under this contract must have. */
    const ric = (adapter: StorageAdapter) => {
      expect(adapter.readIfChanged).toBeTypeOf('function');
      return adapter.readIfChanged!.bind(adapter);
    };
    /** What a sync knows after a write: its eTag, and the source where the storage gives one. */
    const known = (w: { etag: string; source?: string }) => (w.source === undefined ? { etag: w.etag } : { etag: w.etag, source: w.source });

    it('answers unchanged for the eTag the file has', async () => {
      const { adapter } = make();
      const w = await adapter.write('tasks.md', 'a', null);
      expect(await ric(adapter)('tasks.md', known(w))).toBe('unchanged');
    });

    it('answers the file, as read does, after another device changed it', async () => {
      const { adapter, external } = make();
      const w = await adapter.write('tasks.md', 'a', null);
      await external('tasks.md', 'other device');
      const got = await ric(adapter)('tasks.md', known(w));
      expect(got).toEqual(await adapter.read('tasks.md'));
      expect(got).toMatchObject({ text: 'other device' });
    });

    it('answers the file for an eTag it had before this device wrote it again', async () => {
      const { adapter } = make();
      const first = await adapter.write('done.md', 'a', null);
      const second = await adapter.write('done.md', 'b', first.etag);
      expect(await ric(adapter)('done.md', known(first))).toEqual({ text: 'b', ...known(second) });
    });

    it('answers null for a missing file', async () => {
      const { adapter } = make();
      expect(await ric(adapter)('tasks.md', { etag: '"gone"' })).toBeNull();
    });

    it('throws OfflineError while offline', async () => {
      const { adapter, offline } = make();
      const w = await adapter.write('tasks.md', 'a', null);
      offline(true);
      await expect(ric(adapter)('tasks.md', known(w))).rejects.toBeInstanceOf(OfflineError);
    });
  });
}

/** The `landed` contract, for the adapters with a version history (#161). */
export function landedContract(make: () => ContractHarness): void {
  describe('StorageAdapter landed contract', () => {
    const landed = (adapter: StorageAdapter) => {
      expect(adapter.landed).toBeTypeOf('function');
      return adapter.landed!.bind(adapter);
    };
    /** A base no version holds: the whole kept history is looked at. */
    const NO_BASE = '';
    /** Writes `texts` one after another, as this device. */
    async function writeAll(adapter: StorageAdapter, name: string, texts: string[]): Promise<void> {
      let etag: string | null = null;
      for (const t of texts) etag = (await adapter.write(name, t, etag)).etag;
    }

    it('finds a text the file held before, and the current one', async () => {
      const { adapter } = make();
      await writeAll(adapter, 'tasks.md', ['a', 'b', 'c']);
      expect(await landed(adapter)('tasks.md', ['b'], NO_BASE)).toBe('b');
      expect(await landed(adapter)('tasks.md', ['c'], NO_BASE)).toBe('c');
    });

    it('answers the one held most recently when several were there', async () => {
      const { adapter } = make();
      await writeAll(adapter, 'tasks.md', ['a', 'b', 'c']);
      expect(await landed(adapter)('tasks.md', ['c', 'a'], NO_BASE)).toBe('c');
      expect(await landed(adapter)('tasks.md', ['a', 'b'], NO_BASE)).toBe('b');
    });

    it('finds a text another device then wrote over', async () => {
      const { adapter, external } = make();
      await writeAll(adapter, 'tasks.md', ['a', 'mine']);
      await external('tasks.md', 'theirs');
      expect(await landed(adapter)('tasks.md', ['mine'], NO_BASE)).toBe('mine');
    });

    it('answers null for texts the file never held, and for a missing file', async () => {
      const { adapter } = make();
      await writeAll(adapter, 'tasks.md', ['a', 'b']);
      expect(await landed(adapter)('tasks.md', ['x', 'ab'], NO_BASE)).toBeNull();
      expect(await landed(adapter)('done.md', ['a'], NO_BASE)).toBeNull();
    });

    it('looks only at versions newer than the latest one holding the base', async () => {
      const { adapter } = make();
      await writeAll(adapter, 'tasks.md', ['a', 'b', 'c', 'b', 'd']);
      expect(await landed(adapter)('tasks.md', ['a'], 'b')).toBeNull(); // older than the base
      expect(await landed(adapter)('tasks.md', ['c'], 'b')).toBeNull(); // older than the latest "b"
      expect(await landed(adapter)('tasks.md', ['d', 'a'], 'b')).toBe('d');
      expect(await landed(adapter)('tasks.md', ['b'], 'b')).toBe('b');
    });

    it('throws OfflineError while offline', async () => {
      const { adapter, offline } = make();
      await writeAll(adapter, 'tasks.md', ['a']);
      offline(true);
      await expect(landed(adapter)('tasks.md', ['a'], NO_BASE)).rejects.toBeInstanceOf(OfflineError);
    });
  });
}

export interface BinaryHarness {
  store: BinaryStore;
  offline(on: boolean): void;
}

/** Every byte value, a JPEG's start among them, so a store that treats the bytes as text fails. */
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 256 }, (_, i) => i), 0x0d, 0x0a, 0xff, 0xd9]);
const bytesOf = async (b: Blob | null): Promise<number[] | null> => (b ? [...new Uint8Array(await b.arrayBuffer())] : null);

export function binaryContract(make: () => BinaryHarness): void {
  describe('BinaryStore contract', () => {
    it('returns null when reading a missing file', async () => {
      const { store } = make();
      expect(await store.readBytes('climbing.jpg')).toBeNull();
    });

    it('creates a file and reads back the same bytes', async () => {
      const { store } = make();
      await store.createBytes('climbing.jpg', new Blob([BYTES], { type: 'image/jpeg' }));
      expect(await bytesOf(await store.readBytes('climbing.jpg'))).toEqual([...BYTES]);
    });

    it('refuses to create a file that is there, and keeps it', async () => {
      const { store } = make();
      await store.createBytes('climbing.jpg', new Blob([BYTES], { type: 'image/jpeg' }));
      await expect(store.createBytes('climbing.jpg', new Blob([new Uint8Array([1, 2, 3])]))).rejects.toBeInstanceOf(PreconditionFailedError);
      expect(await bytesOf(await store.readBytes('climbing.jpg'))).toEqual([...BYTES]);
    });

    it('throws OfflineError for read and create while offline', async () => {
      const { store, offline } = make();
      offline(true);
      await expect(store.readBytes('climbing.jpg')).rejects.toBeInstanceOf(OfflineError);
      await expect(store.createBytes('climbing.jpg', new Blob([BYTES]))).rejects.toBeInstanceOf(OfflineError);
      offline(false);
      expect(await store.readBytes('climbing.jpg')).toBeNull();
    });
  });
}
