import { test, expect } from '@playwright/test';
import { driveFile, openApp } from './helpers';
import { poll } from './poll';

test.use({ serviceWorkers: 'allow' });
test.skip(({ isMobile }) => isMobile, 'the offline shell is checked on the desktop project (Chromium service worker)');

test('reloads offline from the precached shell with the cached task, fonts from this origin', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost') external.push(r.url());
  });
  // The fake build keeps its cache in IndexedDB for this spec, and starts offline when the browser is.
  await page.addInitScript(() => {
    (window as unknown as { __TASKAPP_FAKE_DURABLE__: boolean }).__TASKAPP_FAKE_DURABLE__ = true;
  });
  await openApp(page, { files: { 'tasks.md': '# Tasks\n', 'done.md': '', 'config.yaml': '' } });
  await expect(page.getByTestId('status')).toHaveText('saved');
  await page.getByTestId('add-input').fill('Written before the train');
  await page.getByTestId('add-input').press('Enter');
  const row = page.getByTestId('task-row').filter({ hasText: 'Written before the train' });
  await expect(row).toHaveCount(1);
  await poll(() => driveFile(page, 'tasks.md')).toContain('Written before the train');
  await expect(page.getByTestId('status')).toHaveText('saved');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(row).toHaveCount(1);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.getByTestId('sync-banner')).toContainText("Can't reach OneDrive");
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
  });
  expect(fonts.length).toBeGreaterThan(0);
  expect(external).toEqual([]);

  // The sign-in redirect return (query params, odd characters) still gets the app shell.
  await page.goto('/?code=0.AbC/d.e&state=xyz');
  await expect(page.getByTestId('sync-banner')).toBeVisible();
  await expect(row).toHaveCount(1);
});
