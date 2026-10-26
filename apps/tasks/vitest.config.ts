import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Rune modules (`.svelte.ts`) must compile for Svelte's client runtime, where `$effect` runs and
  // `$derived` tracks; under Vitest's default SSR transform they compile for the server runtime instead.
  // `testTransformMode.web` gives the plugin `ssr: false` for everything these tests import, and the
  // `browser` condition resolves `svelte` to its client build. The plugin is typed for the app's Vite 8
  // while Vitest 3 is typed against Vite 7, hence the cast; it runs fine under both.
  plugins: svelte() as unknown as Plugin[],
  resolve: { conditions: ['browser'] },
  test: {
    name: 'tasks',
    include: ['src/**/*.test.ts'],
    testTransformMode: { web: ['**/*.test.ts'] },
    passWithNoTests: true,
    // msUntilMidnight's DST assertions only mean something in a DST zone (as in packages/tasks-core).
    env: { TZ: 'Europe/Warsaw' },
  },
});
