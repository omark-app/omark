import { defineConfig, devices } from '@playwright/test';
import { e2ePort } from '../tasks/e2e/port';

// 2000 above Tasks' port (the site takes +1000), so all three previews can run side by side.
const port = e2ePort(process.cwd(), process.env) + 2000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub's Linux runners have 4 vCPUs; Playwright's default would use 2.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  // No service worker: no spec needs precaching, and none must see a mid-test takeover.
  use: { baseURL: `http://localhost:${port}`, serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'iphone', use: { ...devices['iPhone 15'], colorScheme: 'light' } },
  ],
  webServer: {
    env: { VITE_STORAGE: 'fake', BUILD_NUMBER: '7' },
    command: `vite build && vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
