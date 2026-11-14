import { describe, expect, it } from 'vitest';
import { FakeOneDrive } from '../src/fake-onedrive.ts';
import { adapterContract, binaryContract } from './adapter-contract.ts';

adapterContract(() => {
  const fake = new FakeOneDrive();
  return {
    adapter: fake,
    external: (n, t) => fake.externalWrite(n, t),
    offline: (on) => fake.setOffline(on),
  };
});

binaryContract(() => {
  const fake = new FakeOneDrive();
  return { store: fake, offline: (on) => fake.setOffline(on) };
});

describe('FakeOneDrive', () => {
  it('uses per-file etags v1, v2, ...', async () => {
    const fake = new FakeOneDrive({ 'tasks.md': 'x' });
    expect(await fake.read('tasks.md')).toEqual({ text: 'x', etag: '"v1"' });
    fake.externalWrite('tasks.md', 'y');
    expect((await fake.read('tasks.md'))?.etag).toBe('"v2"');
    expect((await fake.write('tasks.md', 'z', '"v2"')).etag).toBe('"v3"');
    expect(fake.peek('tasks.md')).toBe('z');
    expect(fake.peek('done.md')).toBeNull();
  });
});

describe('FakeOneDrive (e2e hooks)', () => {
  it('goes offline as the sign-in server unreachable when asked (#157)', async () => {
    const fake = new FakeOneDrive({ 'tasks.md': 'a' });
    fake.setOffline(true, 'signin');
    await expect(fake.read('tasks.md')).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'signin' });
    fake.setOffline(true);
    await expect(fake.read('tasks.md')).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'storage' });
  });
});
