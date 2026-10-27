import { test, expect } from '@playwright/test';
import { expectNoSideScroll } from './pages';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the sections in order', async ({ page }) => {
  const titles = (await page.locator('main h2').allTextContents()).map((t) => t.trim());
  expect(titles).toEqual(['Omark Tasks', 'Omark Time', 'How to start', 'Where your data lives', 'Principles', 'Open source']);
  await expect(page.locator('h1')).toContainText('plain files');
  await expectNoSideScroll(page);
});

test('links Omark Tasks to its demo, with Open still coming soon', async ({ page }) => {
  const tasks = page.locator('.card').filter({ has: page.locator('h2', { hasText: 'Omark Tasks' }) });
  await expect(tasks.locator('.button.coming')).toHaveCount(1);
  await expect(tasks.locator('.button.coming')).toContainText('Open');
  await expect(tasks.locator('a')).toHaveCount(1);
  await expect(tasks.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', 'https://demo-tasks.omark.app');
});

test('marks Omark Time as coming', async ({ page }) => {
  const time = page.locator('.card').filter({ has: page.locator('h2', { hasText: 'Omark Time' }) });
  await expect(time).toContainText('Coming');
  await expect(time.locator('a')).toHaveCount(0);
});

test('shows the Omark mark and both app icons', async ({ page }) => {
  await expect(page.locator('.brand .brand-icon')).toHaveCount(1);
  await expect(page.locator('.brand .brand-icon')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.brand .wordmark')).toHaveText('Omark');
  const icons = page.locator('img.brand-icon, img.app-icon');
  await expect(icons).toHaveCount(3);
  const srcs = await icons.evaluateAll((imgs) => imgs.map((i) => new URL((i as HTMLImageElement).src).pathname));
  expect(srcs).toEqual(['/img/icon-omark.svg', '/img/icon-tasks.svg', '/img/icon-time.svg']);
  await expect
    .poll(() => icons.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
});

test('serves the Tasks screenshot as a small WebP', async ({ page }) => {
  const shot = page.locator('img.shot');
  await expect(shot).toHaveAttribute('width', '600');
  const { src, natural } = await shot.evaluate((img: HTMLImageElement) => ({ src: img.currentSrc, natural: img.naturalWidth }));
  expect(src).toMatch(/\.webp$/);
  expect(natural).toBe(600);
});
