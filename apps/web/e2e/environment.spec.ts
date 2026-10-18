import { test, expect } from '@playwright/test';

// Chromium can map the staging host name to the local preview server; WebKit can't, so the iPhone check
// is done by hand on tasks-staging.alipka.com.
test.skip(({ browserName }) => browserName !== 'chromium', 'needs --host-resolver-rules');
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP tasks-staging.alipka.com localhost, MAP pr-1.taskapp-staging.pages.dev localhost'] } });

const STAGING = 'http://tasks-staging.alipka.com:4173/';
const PREVIEW = 'http://pr-1.taskapp-staging.pages.dev:4173/';

test('staging host gets the staging name, colour, manifest and label', async ({ page, request }) => {
  await page.goto(STAGING);
  await expect(page).toHaveTitle('TaskApp Staging');
  await expect(page.getByTestId('env-label')).toHaveText('STAGING');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F6E7C8');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'TaskApp Staging');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href!, 'http://localhost:4173/').toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('TaskApp Staging');
  expect(manifest.theme_color).toBe('#F6E7C8');
  expect(manifest.display).toBe('standalone');
});

test('a PR preview is labelled and starts with sample tasks', async ({ page }) => {
  await page.goto(PREVIEW);
  await expect(page).toHaveTitle('TaskApp');
  await expect(page.getByTestId('env-label')).toHaveText('PREVIEW');
  await expect(page.getByTestId('task-row').first()).toBeVisible();
  await expect(page.getByTestId('always-line').first()).toBeVisible();
});

test('localhost has no environment label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('build')).toBeVisible();
  await expect(page.getByTestId('env-label')).toHaveCount(0);
});
