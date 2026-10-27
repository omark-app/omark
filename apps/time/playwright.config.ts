import { defineConfig, devices } from '@playwright/test';
import { e2ePort } from '../tasks/e2e/port';

// 2000 above Tasks' port (the site takes +1000), so all three previews can run side by side; the demo build the
// one after (e2e/demo.spec.ts reads it from TIME_DEMO_PORT).
const port = e2ePort(process.cwd(), process.env) + 2000;
const demo = port + 1;
process.env.TIME_DEMO_PORT = String(demo);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // No service worker: no spec needs precaching, and none must see a mid-test takeover.
  use: { baseURL: `http://localhost:${port}`, serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'iphone', use: { ...devices['iPhone 15'], colorScheme: 'light' } },
  ],
  webServer: [
    {
      env: { VITE_STORAGE: 'fake', BUILD_NUMBER: '7' },
      command: `vite build && vite preview --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The demo build, in its own folder so the two builds never write the same files.
    {
      env: { VITE_STORAGE: 'demo', VITE_REAL_USE_URL: 'https://example.test/real', BUILD_NUMBER: '7' },
      command: `vite build --outDir dist-demo && vite preview --outDir dist-demo --port ${demo} --strictPort`,
      url: `http://localhost:${demo}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
