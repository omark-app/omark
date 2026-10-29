import { defineConfig, devices } from '@playwright/test';
import { e2ePort } from './e2e/port';

// apps/tasks' own e2e specs, run against this app's fake build: Tasks moves in unchanged (one app spec,
// section 12). A Tasks seed opens the shell with Tasks alone. TASKS_IN_SHELL_SKIP lists the specs that test
// what the shell now owns (storage choice, sign-in, demo, hosts); see doc/plans/U.3-omark-shell.md.
const port = e2ePort(process.cwd(), process.env) + 1;

export const TASKS_IN_SHELL_SKIP = [
  'demo.spec.ts',
  'environment.spec.ts',
  'first-run.spec.ts',
  'google-drive.spec.ts',
  'icons.spec.ts',
  'local-folder.spec.ts',
];

/**
 * Tests in the other specs that check what the shell owns now: Tasks' own sign-in screens and stubs (the shell
 * signs in; its e2e covers that from U.4), and the page's title and manifest ("Omark", not "Omark Tasks").
 */
export const TASKS_IN_SHELL_SKIP_TESTS = [
  /with no signed-in account the sign-in screen shows/,
  /a failed token refresh shows a sign-in banner/,
  /signing in again with edits only in memory asks first/,
  /a sign-in library that never finishes starting/,
  /a start-up failure shows the error with a way to try again/,
  /page title is Omark Tasks/,
  /manifest is served with name and standalone display/,
];

export default defineConfig({
  testDir: '../tasks/e2e',
  testIgnore: TASKS_IN_SHELL_SKIP,
  grepInvert: TASKS_IN_SHELL_SKIP_TESTS,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}`, serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'iphone', use: { ...devices['iPhone 15'], colorScheme: 'light' } },
  ],
  webServer: {
    env: { VITE_STORAGE: 'fake', BUILD_NUMBER: '7' },
    command: `vite build --outDir dist-tasks && vite preview --outDir dist-tasks --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
