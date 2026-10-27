import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // As in apps/tasks: rune modules compile for Svelte's client runtime (the cast bridges Vite 8 and Vitest 3's Vite 7).
  plugins: svelte() as unknown as Plugin[],
  resolve: { conditions: ['browser'] },
  test: {
    name: 'time',
    include: ['src/**/*.test.ts'],
    // The second glob matches checkouts under a dot folder (e.g. .claude/worktrees), which `**` skips.
    testTransformMode: { web: ['**/*.test.ts', '**/.*/**/*.test.ts'] },
    // Time zones are always passed in, so the machine's zone must not matter.
    env: { TZ: 'Pacific/Auckland' },
  },
});
