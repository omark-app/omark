import { test, expect } from '@playwright/test';

test('page title is Omark Tasks', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Omark Tasks');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Omark Tasks');
});

test('manifest is served with name and standalone display', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('Omark Tasks');
  expect(manifest.display).toBe('standalone');
});

test('body background is the light palette bg', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(242, 244, 247)');
});
