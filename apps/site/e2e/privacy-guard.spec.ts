import { test, expect } from '@playwright/test';
import { PAGES, expectNoSideScroll } from './pages';

for (const path of PAGES) {
  test.describe(path, () => {
    test('stays on its own origin, sets no cookies, ships no script', async ({ page, context }) => {
      const origins = new Set<string>();
      page.on('request', (request) => {
        if (!request.url().startsWith('data:')) origins.add(new URL(request.url()).origin);
      });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const own = new URL(page.url()).origin;
      expect([...origins]).toEqual([own]);
      expect(await context.cookies()).toEqual([]);
      await expect(page.locator('script')).toHaveCount(0);
    });

    test('has no sideways scroll at the project width or at 320 px', async ({ page }) => {
      await page.goto(path);
      await expectNoSideScroll(page);
      await page.setViewportSize({ width: 320, height: 800 });
      await expectNoSideScroll(page);
    });
  });
}

test.describe('dark mode', () => {
  test('changes the page background', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(dark).not.toBe(light);
  });

  test('picks the dark Tasks screenshot', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ colorScheme: 'dark', baseURL });
    const page = await context.newPage();
    await page.goto('/');
    const src = await page.locator('picture img').first().evaluate((img: HTMLImageElement) => img.currentSrc);
    expect(src).toContain('tasks-dark');
    await context.close();
  });
});
