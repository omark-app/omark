import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Globs that match nothing yet (storage, web, tools) are simply skipped.
    projects: ['packages/*', 'apps/tasks', 'tools/*'],
  },
});
