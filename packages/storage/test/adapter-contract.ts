import { describe, expect, it } from 'vitest';
import { OfflineError, PreconditionFailedError } from '../src/errors.ts';
import type { StorageAdapter } from '../src/adapter.ts';

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
