import { describe, expect, it } from 'vitest';
import config from '../../../vitest.config.ts';

// The root Vitest config lists projects by folder glob, so a new app or package needs no edit there.
// Parallel PRs used to conflict on this one line.
describe('root Vitest projects', () => {
  it('finds apps, packages and tools by glob', () => {
    expect(config.test?.projects).toEqual(['apps/*', 'packages/*', 'tools/*', 'brand']);
  });
});
