import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'site',
    include: ['test/**/*.test.ts'],
    // No passWithNoTests here: run through `--root ../..` a project's option is ignored, so the `test`
    // script passes `--passWithNoTests` instead (needed until the site has unit tests).
  },
});
