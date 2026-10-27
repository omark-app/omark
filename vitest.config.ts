import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Globs that match nothing yet (packages, apps/tasks, tools) are simply skipped.
    projects: ['packages/*', 'apps/tasks', 'apps/site', 'tools/*'],
  },
});
