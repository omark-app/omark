import { defineConfig, devices } from '@playwright/test';
import { e2ePort } from './e2e/port';

const port = e2ePort(process.cwd(), process.env);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Service workers are blocked except in offline.spec.ts, so no other spec sees precaching or a mid-test takeover.
  use: { baseURL: `http://localhost:${port}`, serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'iphone', use: { ...devices['iPhone 15'], colorScheme: 'light' } },
  ],
  webServer: {
    env: { VITE_STORAGE: 'fake', VITE_STAGING_HOST: 'staging-tasks.example.test', BUILD_NUMBER: '7' },
    command: `vite build && vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
