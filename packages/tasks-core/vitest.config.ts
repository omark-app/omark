import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@omark/tasks-core',
    // DST assertions in dates.test.ts only mean something in a DST zone.
    env: { TZ: 'Europe/Warsaw' },
  },
});
