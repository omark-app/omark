import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../src/cache.ts';
import { FakeOneDrive } from '../src/fake-onedrive.ts';

const APP_WORDS = /tasks\.md|done\.md|config\.yaml|taskapp|@omark\/tasks-core/i;

/** The files in `src` that name an app's files, cookies, databases or packages. `X-TaskApp-Auth` is renamed in 3.7. */
function offenders(src: string): string[] {
  const names = readdirSync(src);
  expect(names.length).toBeGreaterThan(0);
  return names.filter((n) => APP_WORDS.test(readFileSync(join(src, n), 'utf8').replaceAll('X-TaskApp-Auth', '')));
}

/** An app package as a dependency (tests may use one as a devDependency). */
function expectNoAppDependency(src: string): void {
  const pkg = JSON.parse(readFileSync(join(src, '../package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
  for (const section of ['dependencies', 'peerDependencies']) {
    expect(Object.keys(pkg[section] ?? {})).not.toContain('@omark/tasks-core');
  }
}

describe('shared storage is app-neutral', () => {
  it("names no app's files, databases or packages", () => {
    const src = join(import.meta.dirname, '../src');
    expect(offenders(src)).toEqual([]);
    // Only file-sync.test.ts uses tasks-core's real merge, as a devDependency.
    expectNoAppDependency(src);
  });

  it("the sign-in helper names no app's files, cookies, databases or packages", () => {
    const src = join(import.meta.dirname, '../../signin/src');
    expect(offenders(src)).toEqual([]);
    expectNoAppDependency(src);
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
