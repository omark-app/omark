import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { E2E_FOLDER, E2E_PORT, STATE_PATH } from './e2e-real/state';

// Real OneDrive, by hand only (`pnpm e2e:real:login` once, then `pnpm e2e:real`). Never part of `pnpm e2e` or CI.
// The origin is http://localhost:5173; its /api/auth/callback must be a Web redirect URI in Entra.
const origin = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './e2e-real',
  workers: 1,
  reporter: 'list',
  use: { baseURL: origin, serviceWorkers: 'block', ...devices['Desktop Chrome'],
    // Traces, videos and screenshots would capture the Authorization header or task text; keep them off.
    trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'login', testMatch: 'login.spec.ts', use: { headless: false } },
    {
      name: 'smoke',
      testMatch: 'onedrive.spec.ts',
      use: existsSync(STATE_PATH) ? { storageState: STATE_PATH } : {},
    },
  ],
  webServer: {
    // `wrangler pages dev` serves the build together with the sign-in helper (functions/ at the repo root,
    // hence the cwd). The helper's secrets come from .dev.vars at the repo root (git-ignored).
    env: { VITE_STORAGE: 'onedrive', VITE_ONEDRIVE_FOLDER: E2E_FOLDER },
    cwd: '../..',
    command: `pnpm --filter web exec vite build --outDir dist-real && pnpm exec wrangler pages dev apps/web/dist-real --port ${E2E_PORT}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
