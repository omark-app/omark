import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@omark/time-core',
    // The calendar zone is always passed in, so the machine's zone must not matter.
    env: { TZ: 'Pacific/Auckland' },
  },
});
