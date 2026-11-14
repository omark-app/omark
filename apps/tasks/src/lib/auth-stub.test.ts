import { FakeOneDrive } from '@omark/storage';
import type { StorageAdapter } from '@omark/storage';
import { describe, expect, it } from 'vitest';
import { tokenGated } from './auth-stub.ts';

describe('tokenGated', () => {
  it('gets a token before readIfChanged, and passes the answer on (#158)', async () => {
    const drive = new FakeOneDrive({ 'tasks.md': 'a' });
    const log: string[] = [];
    const gated = tokenGated(drive, async () => {
      log.push('token');
      return 't';
    });
    const { etag } = (await drive.read('tasks.md'))!;
    expect(await gated.readIfChanged?.('tasks.md', { etag })).toBe('unchanged');
    expect(log).toEqual(['token']);
  });

  it('has no readIfChanged when the drive has none', () => {
    const drive: StorageAdapter = { read: async () => null, write: async () => ({ etag: '"x"' }) };
    expect(tokenGated(drive, async () => 't').readIfChanged).toBeUndefined();
  });
});
