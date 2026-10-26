import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../src/cache.ts';
import { FakeOneDrive } from '../src/fake-onedrive.ts';

const SRC = join(import.meta.dirname, '../src');
const APP_WORDS = /tasks\.md|done\.md|config\.yaml|taskapp|@omark\/tasks-core/i;

describe('shared storage is app-neutral', () => {
  it("names no app's files, databases or packages", () => {
    // auth.ts is cleaned up in Task 3; remove this exception then.
    const names = readdirSync(SRC).filter((n) => n !== 'auth.ts');
    expect(names.length).toBeGreaterThan(0);
    const offenders = names.filter((n) => APP_WORDS.test(readFileSync(join(SRC, n), 'utf8').replaceAll('X-TaskApp-Auth', '')));
    expect(offenders).toEqual([]);

    // Only file-sync.test.ts uses tasks-core's real merge, as a devDependency.
    const pkg = JSON.parse(readFileSync(join(SRC, '../package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    for (const section of ['dependencies', 'peerDependencies']) {
      expect(Object.keys(pkg[section] ?? {})).not.toContain('@omark/tasks-core');
    }
  });

  it('stores any file name', async () => {
    const text = 'a,b\n';
    const fake = new FakeOneDrive({ 'events-2026.csv': text });
    expect((await fake.read('events-2026.csv'))?.text).toBe(text);
    const cache = new MemoryCache();
    await cache.put('events-2026.csv', { base: text, baseEtag: null, local: text, dirty: false });
    expect((await cache.get('events-2026.csv'))?.local).toBe(text);
  });
});
