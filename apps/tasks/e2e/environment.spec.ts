import { test, expect } from '@playwright/test';

// Chromium can map the staging host name to the local preview server; WebKit can't, so the iPhone check
// is done by hand on the staging host. PR previews (*.pages.dev) can't be tested this way: .dev is
// HTTPS-only in Chrome. Their seed is unit-tested (sample-files.test.ts) and the look shows on each preview.
test.skip(({ browserName }) => browserName !== 'chromium', 'needs --host-resolver-rules');
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP staging-tasks.example.test localhost'] } });

test('staging host gets the staging name, colour, manifest and label', async ({ page, request, baseURL }) => {
  const staging = new URL(baseURL!);
  staging.hostname = 'staging-tasks.example.test';
  await page.goto(staging.toString());
  await expect(page).toHaveTitle('Omark Tasks Staging');
  await expect(page.getByTestId('env-label')).toHaveText('STAGING');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F6E7C8');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Omark Tasks Staging');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href!, baseURL).toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('Omark Tasks Staging');
  expect(manifest.theme_color).toBe('#F6E7C8');
  expect(manifest.display).toBe('standalone');
});

// `request` ignores the host-resolver rule, so the files are fetched from the local server.
test('staging host gets the staging icons', async ({ page, request, baseURL }) => {
  const staging = new URL(baseURL!);
  staging.hostname = 'staging-tasks.example.test';
  await page.goto(staging.toString());
  const hrefs = [
    await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href'),
    await page.locator('link[rel="icon"][sizes="32x32"]').getAttribute('href'),
    await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),
  ];
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(manifestHref!, baseURL).toString())).json();
  const urls = [...hrefs, ...manifest.icons.map((i: { src: string }) => i.src)];
  expect(urls.length).toBe(6);
  for (const url of urls) {
    expect(url).toMatch(/^\/icons\/staging\//);
    expect((await request.get(new URL(url, baseURL).toString())).status(), url).toBe(200);
  }
});

test('localhost has no environment label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('build')).toBeVisible();
  await expect(page.getByTestId('env-label')).toHaveCount(0);
});
