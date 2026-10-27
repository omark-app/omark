import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@omark/calendar',
    // Time zones are always passed in, so the machine's zone must not matter.
    env: { TZ: 'Pacific/Auckland' },
  },
});
