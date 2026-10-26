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

test('marks Omark Time as coming', async ({ page }) => {
  const time = page.locator('.card').filter({ has: page.locator('h2', { hasText: 'Omark Time' }) });
  await expect(time).toContainText('Coming');
  await expect(time.locator('a')).toHaveCount(0);
});

test('has the wordmark with an icon slot', async ({ page }) => {
  await expect(page.locator('.brand .brand-icon')).toHaveCount(1);
  await expect(page.locator('.brand .brand-icon')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.brand .wordmark')).toHaveText('Omark');
});
