import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The one app on its staging host (#142). Staging and production run the same build, so the host picks the
// look. Inside the one app only Tasks' status line changes: it shows STAGING. Tasks' own title, theme colour,
// manifest and icons for staging belong to its standalone build (apps/tasks/src/main.ts), which the one app
// doesn't run, so the page stays "Omark".
//
// Chromium can map the staging host name to the local preview server; WebKit can't, so this runs on desktop
// only. The host is VITE_STAGING_HOST in playwright.config.ts.
test.skip(({ browserName }) => browserName !== 'chromium', 'needs --host-resolver-rules');
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP staging-omark.example.test localhost'] } });

async function open(page: Page, url: string) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__OMARK_SEED__ = { root: { 'config.yaml': 'parts: [tasks]\n' } };
  });
  await page.goto(url);
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test("the staging host shows STAGING in Tasks' status line, and the page stays Omark", async ({ page, request, baseURL }) => {
  const staging = new URL(baseURL!);
  staging.hostname = 'staging-omark.example.test';
  await open(page, staging.toString());
  await expect(page.getByTestId('env-label')).toHaveText('STAGING');

  await expect(page).toHaveTitle('Omark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F2F4F7');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Omark');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  for (const href of await page.locator('link[rel="icon"]').evaluateAll((ls) => ls.map((l) => l.getAttribute('href')))) {
    expect(href).not.toContain('/staging/');
  }
  // Tasks' staging look would point at /manifest-staging.webmanifest. `request` ignores the host-resolver
  // rule, so the manifest is fetched from the local server.
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await (await request.get(new URL('/manifest.webmanifest', baseURL).toString())).json();
  expect(manifest.name).toBe('Omark');
});

test('localhost has no environment label', async ({ page }) => {
  await open(page, '/');
  await expect(page.getByTestId('build')).toBeVisible();
  await expect(page.getByTestId('env-label')).toHaveCount(0);
});
