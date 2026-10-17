import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { E2E_FOLDER, E2E_PORT, STATE_PATH } from './e2e-real/state';

// Real OneDrive, by hand only (`pnpm e2e:real:login` once, then `pnpm e2e:real`). Never part of `pnpm e2e` or CI.
// The origin is http://localhost:5173, one of the redirect URIs already registered in Entra.
const origin = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './e2e-real',
  workers: 1,
  reporter: 'list',
  use: { baseURL: origin, serviceWorkers: 'block', ...devices['Desktop Chrome'] },
  projects: [
    { name: 'login', testMatch: 'login.spec.ts', use: { headless: false } },
    {
      name: 'smoke',
      testMatch: 'onedrive.spec.ts',
      use: existsSync(STATE_PATH) ? { storageState: STATE_PATH } : {},
    },
  ],
  webServer: {
    // The client ID comes from VITE_MSAL_CLIENT_ID in the environment or apps/web/.env.local.
    env: { VITE_STORAGE: 'onedrive', VITE_ONEDRIVE_FOLDER: E2E_FOLDER },
    command: `vite build --outDir dist-real && vite preview --outDir dist-real --port ${E2E_PORT} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
