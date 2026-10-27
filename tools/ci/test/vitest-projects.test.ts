import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The root Vitest config lists projects by folder glob, so a new app or package needs no edit there.
// Parallel PRs used to conflict on this one line.
describe('root Vitest projects', () => {
  it('finds apps, packages and tools by glob', () => {
    const config = readFileSync(new URL('../../../vitest.config.ts', import.meta.url), 'utf8');
    const projects = config.match(/projects:\s*\[([^\]]*)\]/)![1]!.match(/'[^']+'/g)!.map((p) => p.slice(1, -1));
    expect(projects).toEqual(['apps/*', 'packages/*', 'tools/*', 'brand']);
  });
});
