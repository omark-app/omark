import { defineConfig, devices } from '@playwright/test';
import { e2ePort } from '../tasks/e2e/port';

// 1000 above Tasks' port, so both previews can run side by side.
const port = e2ePort(process.cwd(), process.env) + 1000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'iphone', use: { ...devices['iPhone 15'], colorScheme: 'light' } },
  ],
  webServer: {
    command: `vite build && vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
