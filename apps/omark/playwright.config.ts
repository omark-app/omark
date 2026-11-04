import { defineConfig, devices } from '@playwright/test';
import { demoPort, e2ePort } from './e2e/port';

const port = e2ePort(process.cwd(), process.env);
const demo = demoPort(process.cwd(), process.env);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub's Linux runners have 4 vCPUs; Playwright's default would use 2.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
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
    // The demo build for e2e/demo.spec.ts (U.6), in its own folder so the two builds never write the same files.
    {
      env: { VITE_STORAGE: 'demo', VITE_REAL_USE_URL: 'https://example.test/real', BUILD_NUMBER: '7' },
      command: `vite build --outDir dist-demo && vite preview --outDir dist-demo --port ${demo} --strictPort`,
      url: `http://localhost:${demo}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
