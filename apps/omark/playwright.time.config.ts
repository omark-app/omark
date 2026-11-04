import { defineConfig, devices } from '@playwright/test';
import { e2ePort } from './e2e/port';

// apps/time's own e2e specs, run against this app's fake build (roadmap U.6, U.4's deferred step): Time moves in
// unchanged. A Time seed with no shell seed opens the shell with Time alone, on Time's own fake drive and sign-in.
// TIME_IN_SHELL_SKIP lists what the shell owns now (doc/plans/U.6-demo-world.md).
const port = e2ePort(process.cwd(), process.env) + 3;

/** The folder on this computer is picked by the shell's first run (apps/omark/e2e/shell.spec.ts), not Time's. */
export const TIME_IN_SHELL_SKIP = ['local-folder.spec.ts'];

/**
 * Time's own first run, which the shell replaces: its Google sign-in screen and page title (the shell's calendar
 * sign-in is in e2e/time.spec.ts), and its storage step (OneDrive offered but off, the Drive access it asks for).
 * The other tests skip the storage step where the shell has none (`chooseStorage` in apps/time/e2e/helpers.ts).
 */
export const TIME_IN_SHELL_SKIP_TESTS = [
  /signed out, the app offers Google sign-in/,
  /the first run asks for Drive access, then the calendars, and writes the files/,
];

export default defineConfig({
  testDir: '../time/e2e',
  testIgnore: TIME_IN_SHELL_SKIP,
  grepInvert: TIME_IN_SHELL_SKIP_TESTS,
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
  webServer: {
    env: { VITE_STORAGE: 'fake', BUILD_NUMBER: '7' },
    command: `vite build --outDir dist-time && vite preview --outDir dist-time --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
