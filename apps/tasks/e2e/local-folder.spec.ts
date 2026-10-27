import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './helpers';
import type { FileName } from './helpers';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const FOLDER_BUTTON = 'Use a folder on this computer';
// Tasks are dated today (openApp's clock), so they show in the open Today bucket.

/**
 * Stands in for the folder picker with a real directory handle from Chrome's origin-private file system
 * (`Tasks`), which IndexedDB can keep across reloads like a picked folder's. The permission prompt of a
 * later visit is simulated: while localStorage has `e2e-folder-permission`, the handle reports it, and
 * `requestPermission` grants access and clears it.
 */
async function installFolderPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Tasks', { create: true });
    const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => localStorage.getItem('e2e-folder-permission') ?? 'granted';
    proto.requestPermission = async () => {
      localStorage.removeItem('e2e-folder-permission');
      return 'granted';
    };
  });
}

/** The file's text in the picked folder, or null if it does not exist. */
function folderFile(page: Page, name: FileName): Promise<string | null> {
  return page.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tasks', { create: true });
    try {
      return await (await (await dir.getFileHandle(n)).getFile()).text();
    } catch {
      return null;
    }
  }, name);
}

/** Writes a file in the picked folder as another program (an editor, a sync client) would. */
async function folderWrite(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    async ([n, t]) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Tasks', { create: true });
      const stream = await (await dir.getFileHandle(n!, { create: true })).createWritable();
      await stream.write(t!);
      await stream.close();
    },
    [name, text],
  );
}

const refocus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

test.describe('a folder on this computer', () => {
  test.skip(({ isMobile }) => isMobile, 'the File System Access API is for desktop Chrome and Edge');

  test('picking a folder opens its files, and edits are saved there', async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { auth: 'signed-out' });
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] Call the dentist 📅 2026-10-16\n');
    await page.getByRole('button', { name: FOLDER_BUTTON }).click();

    await expect(row(page, 'Call the dentist')).toHaveCount(1);
    // Missing files are created in the folder.
    for (const name of ['done.md', 'config.yaml'] as const) await expect.poll(() => folderFile(page, name)).not.toBeNull();

    await page.getByTestId('add-input').fill('Water the plants');
    await page.getByTestId('add-input').press('Enter');
    await expect.poll(() => folderFile(page, 'tasks.md')).toContain('Water the plants');

    await row(page, 'Call the dentist').click();
    await page.keyboard.press('x');
    await expect(page.getByTestId('toast')).toContainText('Done · Call the dentist');
    await expect.poll(() => folderFile(page, 'done.md')).toContain('Call the dentist');
    await expect.poll(() => folderFile(page, 'tasks.md')).not.toContain('Call the dentist');
  });

  test('an edit made outside while the app is open is merged', async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { auth: 'signed-out' });
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] One 📅 2026-10-16\n');
    await page.getByRole('button', { name: FOLDER_BUTTON }).click();
    await expect(row(page, 'One')).toHaveCount(1);

    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] One 📅 2026-10-16\n- [ ] From Obsidian 📅 2026-10-16\n');
    await page.getByTestId('add-input').fill('From the app');
    await page.getByTestId('add-input').press('Enter');
    await refocus(page);

    await expect(row(page, 'From Obsidian')).toHaveCount(1);
    await expect(row(page, 'From the app')).toHaveCount(1);
    await expect.poll(() => folderFile(page, 'tasks.md')).toContain('From Obsidian');
    await expect.poll(() => folderFile(page, 'tasks.md')).toContain('From the app');
  });

  test('a later visit that needs permission shows the saved copy, and Allow access reaches the folder', async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { auth: 'signed-out' });
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] One 📅 2026-10-16\n');
    await page.getByRole('button', { name: FOLDER_BUTTON }).click();
    await expect(row(page, 'One')).toHaveCount(1);
    await expect.poll(() => folderFile(page, 'done.md')).toBe('');

    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] One 📅 2026-10-16\n- [ ] Written while closed 📅 2026-10-16\n');
    await page.evaluate(() => localStorage.setItem('e2e-folder-permission', 'prompt'));
    await page.reload();

    await expect(row(page, 'One')).toHaveCount(1);
    const banner = page.getByTestId('sync-banner');
    await expect(banner).toContainText('Allow access again to reach the folder Tasks');
    await expect(row(page, 'Written while closed')).toHaveCount(0);
    // An edit made meanwhile waits in the offline copy and reaches the folder once access is allowed.
    await page.getByTestId('add-input').fill('While waiting');
    await page.getByTestId('add-input').press('Enter');
    await banner.getByRole('button', { name: 'Allow access' }).click();
    await expect(row(page, 'Written while closed')).toHaveCount(1);
    await expect(banner).toHaveCount(0);
    await expect.poll(() => folderFile(page, 'tasks.md')).toContain('While waiting');
    await expect.poll(() => folderFile(page, 'tasks.md')).toContain('Written while closed');
  });

  test('a folder that has gone away is picked again, and its tasks are written there', async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { auth: 'signed-out' });
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] One 📅 2026-10-16\n');
    await page.getByRole('button', { name: FOLDER_BUTTON }).click();
    await expect(row(page, 'One')).toHaveCount(1);
    await expect.poll(() => folderFile(page, 'done.md')).toBe('');

    // The folder is moved away: the open handle now finds nothing.
    await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry('Tasks', { recursive: true }));
    await refocus(page);
    await expect(page.getByTestId('sync-banner')).toContainText("Can't reach the folder Tasks");
    await expect(row(page, 'One')).toHaveCount(1);

    // Picking it again (here an empty folder of the same name) writes the offline copy there.
    await page.getByTestId('folder-again').getByRole('button', { name: 'Pick the folder again' }).click();
    await expect(row(page, 'One')).toHaveCount(1);
    await expect.poll(() => folderFile(page, 'tasks.md')).toContain('One');
    await expect(page.getByTestId('sync-banner')).toHaveCount(0);
  });

  test("a sync client's conflict copy is named and not merged", async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { auth: 'signed-out' });
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] One 📅 2026-10-16\n');
    await folderWrite(page, 'tasks (1).md', '# Tasks\n- [ ] From the copy 📅 2026-10-16\n');
    await page.getByRole('button', { name: FOLDER_BUTTON }).click();

    await expect(row(page, 'One')).toHaveCount(1);
    await expect(page.getByTestId('folder-note')).toContainText('tasks (1).md');
    await expect(row(page, 'From the copy')).toHaveCount(0);
  });
});

test('where folders are not supported, the sign-in screen does not offer one', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'desktop Chrome has the API; the iPhone project is WebKit, which has not');
  await openApp(page, { auth: 'signed-out' });
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(page.getByRole('button', { name: FOLDER_BUTTON })).toHaveCount(0);
  await expect(page.getByText('A folder on this computer works in Chrome or Edge on a computer.')).toBeVisible();
});
