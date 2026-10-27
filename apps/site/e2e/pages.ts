import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Every page the site builds. Links always use the trailing-slash form. */
export const PAGES = ['/', '/privacy/', '/terms/', '/404.html'];

/** The page fits its viewport: nothing makes it scroll sideways. */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll, 'page scrolls sideways').toBeLessThanOrEqual(widths.client);
}
