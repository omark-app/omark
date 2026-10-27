import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { authCalls, openTime, openView, reload } from './helpers';

/**
 * Stands in for the folder picker with a real directory handle from Chrome's origin-private file system
 * (`Hours`), which IndexedDB keeps across reloads like a picked folder's (as in apps/tasks' local-folder spec).
 * While localStorage has `e2e-folder-permission`, the handle reports it, and `requestPermission` grants access.
 */
async function installFolderPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Hours', { create: true });
    const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => localStorage.getItem('e2e-folder-permission') ?? 'granted';
    proto.requestPermission = async () => {
      localStorage.removeItem('e2e-folder-permission');
      return 'granted';
    };
  });
}

function folderFile(page: Page, name: string): Promise<string | null> {
  return page.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Hours', { create: true });
    try {
      return await (await (await dir.getFileHandle(n)).getFile()).text();
    } catch {
      return null;
    }
  }, name);
}

test.describe('a folder on this computer', () => {
  test.skip(({ isMobile }) => isMobile, 'the File System Access API is for desktop Chrome and Edge');

  test('picking a folder keeps the files there, with no Drive access asked', async ({ page }) => {
    await installFolderPicker(page);
    await openTime(page);
    await page.getByRole('button', { name: 'A folder on this computer' }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('status')).toContainText('Synced');
    await openView(page, 'Settings');
    await expect(page.getByTestId('storage')).toHaveText('In the folder Hours');
    expect(await folderFile(page, 'config.yaml')).toContain('calendars: [primary]');
    expect(await folderFile(page, 'events-2026.csv')).toContain(',old');
    expect(await authCalls(page)).toEqual([]);
  });

  test('a later visit that needs permission again asks with a click, then syncs', async ({ page }) => {
    await installFolderPicker(page);
    await openTime(page);
    await page.getByRole('button', { name: 'A folder on this computer' }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('status')).toContainText('Synced');
    await openView(page, 'Settings');
    await page.evaluate(() => localStorage.setItem('e2e-folder-permission', 'prompt'));
    await reload(page);
    await expect(page.getByTestId('status')).toContainText('Allow access to the folder Hours');
    // The copy on this device still shows.
    await expect(page.getByTestId('rows')).toHaveText('3 rows of tracked time');
    await page.getByRole('button', { name: 'Allow access' }).click();
    await expect(page.getByTestId('status')).toContainText('Synced');
  });
});

test('a phone is not offered a folder', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  await openTime(page);
  await expect(page.getByRole('button', { name: 'Google Drive' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'A folder on this computer' })).toHaveCount(0);
});
