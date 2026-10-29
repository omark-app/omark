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
