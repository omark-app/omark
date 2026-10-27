import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Folder globs, so a new app or package needs no edit here (tools/ci/test/vitest-projects.test.ts).
    // A folder with no vitest.config.ts is skipped.
    projects: ['apps/*', 'packages/*', 'tools/*', 'brand'],
  },
});
