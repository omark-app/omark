import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp, SPEC_TASKS } from './helpers';

// Service workers are blocked here (playwright.config.ts), so these cover the path without one: save and
// reload. The worker paths (update, take over, unregister) are covered in src/lib/updates.test.ts.

/**
 * Counts page loads in sessionStorage (it survives a reload in the same tab), and answers `/version.json`
 * with `deployed()`: the real file while it returns null.
 */
async function setUp(page: Page, deployed: () => string | null, timing?: { idleMs: number; pollMs: number }) {
  await page.addInitScript((t) => {
    sessionStorage.setItem('e2e:loads', String(Number(sessionStorage.getItem('e2e:loads') ?? '0') + 1));
    if (t) (window as unknown as { __TASKAPP_UPDATE_TIMING__: unknown }).__TASKAPP_UPDATE_TIMING__ = t;
  }, timing);
  await page.route('**/version.json', async (route) => {
    const build = deployed();
    if (build === null) await route.continue();
    else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ build }) });
  });
}

/** How many times the page has loaded in this tab (0 while a reload is under way). */
async function loads(page: Page): Promise<number> {
  try {
    return await page.evaluate(() => Number(sessionStorage.getItem('e2e:loads') ?? '0'));
  } catch {
    return 0; // the page is navigating
  }
}

/** The page asks for the deployed build as when the window regains focus. */
async function focusWindow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('the build serves version.json with its build ID, outside the precache, with cache headers', async ({ page, request }) => {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  const build = await page.getByTestId('build').textContent();
  const version = await request.get('/version.json');
  expect(version.ok()).toBe(true);
  expect(await version.json()).toEqual({ build });
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain('index.html');
  expect(sw).not.toContain('version.json');
  const headers = await (await request.get('/_headers')).text();
  expect(headers).toMatch(/\/sw\.js\s+Cache-Control: no-cache/);
  expect(headers).toMatch(/\/version\.json\s+Cache-Control: no-store/);
});

test('a newer build on open reloads the page once, then the loop guard leaves it to the footer', async ({ page }) => {
  await setUp(page, () => 'newer00');
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('update-available')).toBeVisible();
  expect(await loads(page)).toBe(2);
  await page.waitForTimeout(1000);
  expect(await loads(page)).toBe(2);
  await expect(page.getByTestId('update-available')).toHaveText('New version · tap to update');
});

test('a long-open page waits while a text field is focused, then loads the newer build when idle', async ({ page, isMobile }) => {
  let deployed: string | null = null;
  await setUp(page, () => deployed, { idleMs: 0, pollMs: 100 });
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  // The first check found the same build.
  await focusWindow(page);
  await page.waitForTimeout(500);
  expect(await loads(page)).toBe(1);
  await expect(page.getByTestId('update-available')).toHaveCount(0);

  if (isMobile) await page.getByTestId('fab').tap();
  else await page.getByTestId('add-input').focus();
  deployed = 'newer00';
  await focusWindow(page);
  await expect(page.getByTestId('update-available')).toBeAttached();
  await page.waitForTimeout(1000);
  expect(await loads(page)).toBe(1);

  // Done with the field: the page is idle and nothing is open.
  if (isMobile) await page.keyboard.press('Escape');
  else await page.getByTestId('add-input').blur();
  await expect.poll(() => loads(page)).toBe(2);
  await expect(page.getByTestId('bucket-today')).toBeVisible();
});

test('tapping "New version · tap to update" loads the newer build at once', async ({ page, isMobile }) => {
  let deployed: string | null = null;
  await setUp(page, () => deployed, { idleMs: 60 * 60_000, pollMs: 100 });
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  deployed = 'newer00';
  await focusWindow(page);
  const button = page.getByTestId('update-available');
  await expect(button).toBeVisible();
  await page.waitForTimeout(500);
  expect(await loads(page)).toBe(1);
  if (isMobile) await button.tap();
  else await button.click();
  await expect.poll(() => loads(page)).toBe(2);
  await expect(page.getByTestId('bucket-today')).toBeVisible();
});

test('a return with a draft in the add field keeps the draft: the newer build waits', async ({ page, isMobile }) => {
  let deployed: string | null = null;
  await setUp(page, () => deployed, { idleMs: 0, pollMs: 100 });
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  const field = isMobile ? page.getByTestId('sheet').getByLabel('New task') : page.getByTestId('add-input');
  if (isMobile) await page.getByTestId('fab').tap();
  await field.fill('Buy stamps');
  if (!isMobile) await field.blur(); // the draft stays in the field without focus
  deployed = 'newer00';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('update-available')).toBeAttached();
  await page.waitForTimeout(1000);
  expect(await loads(page)).toBe(1);
  await expect(field).toHaveValue('Buy stamps');
});

test('a long-open desktop page with a task selected loads the newer build when idle', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a tap on a phone opens the edit sheet');
  let deployed: string | null = null;
  await setUp(page, () => deployed, { idleMs: 0, pollMs: 100 });
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await page.getByTestId('task-row').filter({ hasText: 'Send the invoice' }).click();
  await expect(page.getByTestId('task-row').filter({ hasText: 'Send the invoice' })).toHaveClass(/sel/);
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // no field focused
  deployed = 'newer00';
  await focusWindow(page);
  await expect.poll(() => loads(page)).toBe(2);
});
