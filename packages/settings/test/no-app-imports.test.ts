import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(import.meta.dirname, '../src');

describe('the settings package is app-neutral', () => {
  it('imports no app or storage package', () => {
    const files = readdirSync(src, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(join(f.parentPath, f.name), 'utf8');
      for (const word of ['@omark/tasks-core', '@omark/storage', 'apps/tasks']) {
        expect(text.includes(word), `${f.name} mentions ${word}`).toBe(false);
      }
    }
  });
});
