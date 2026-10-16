import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@taskapp/core',
    // DST assertions in dates.test.ts only mean something in a DST zone.
    env: { TZ: 'Europe/Warsaw' },
  },
});
