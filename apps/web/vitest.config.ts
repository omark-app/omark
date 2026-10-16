import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Compiles `.svelte.ts` rune modules; the `browser` condition loads Svelte's client runtime, so
  // `$state` and `$derived` are reactive in tests as they are in the app. The plugin is typed for the
  // app's Vite 8 while Vitest 3 is typed against Vite 7, hence the cast; it runs fine under both.
  plugins: svelte() as unknown as Plugin[],
  resolve: { conditions: ['browser'] },
  test: { name: 'web', include: ['src/**/*.test.ts'], passWithNoTests: true },
});
