import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { folderFile, folderWrite, installFolderPicker, openApp } from './helpers';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const TODAY_TASKS = '# Tasks\n- [ ] On OneDrive 📅 2026-10-16\n';

const signInWith = (page: Page) =>
  page.evaluate(() => (window as unknown as { __taskappAuth: { signInWith: (string | null)[] } }).__taskappAuth.signInWith);
const savedChoice = (page: Page) => page.evaluate(() => localStorage.getItem('omark-tasks:storage'));
const rememberChoice = (page: Page, choice: string) =>
  page.addInitScript((c) => localStorage.setItem('omark-tasks:storage', c), choice);

test('a new device shows the choices this browser supports', async ({ page, isMobile }) => {
  await openApp(page, { auth: 'signed-out', providers: ['microsoft', 'google'] });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('omark tasks');
  await expect(page.getByText('Your tasks live in three plain Markdown files. Choose where to keep them.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my OneDrive' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my Google Drive' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', 'https://demo.omark.app/tasks');
  if (isMobile) {
    await expect(page.getByRole('button', { name: 'Use a folder on this computer' })).toHaveCount(0);
    await expect(page.getByText('A folder on this computer works in Chrome or Edge on a computer.')).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Use a folder on this computer' })).toBeVisible();
  }
  expect(await savedChoice(page)).toBeNull();
});

test('Google Drive is offered only where the helper has it', async ({ page }) => {
  await openApp(page, { auth: 'signed-out' });
  await expect(page.getByRole('button', { name: 'Use my OneDrive' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my Google Drive' })).toHaveCount(0);
});

test('picking an account signs in with it, and that choice is offered first next time', async ({ page }) => {
  await openApp(page, { auth: 'signed-out', providers: ['microsoft', 'google'] });
  await page.getByRole('button', { name: 'Use my Google Drive' }).click();
  await expect.poll(() => signInWith(page)).toEqual(['google']);
  expect(await savedChoice(page)).toBe('google');

  // The sign-in did not happen (the stub stays signed out): the screen offers Google Drive first.
  await page.reload();
  await expect(page.getByText('Sign in to open your tasks in Google Drive, or choose another place.')).toBeVisible();
  await expect(page.getByTestId('first-run-choices').getByRole('button').first()).toHaveText('Use my Google Drive');
  await page.getByRole('button', { name: 'Use my OneDrive' }).click();
  await expect.poll(() => signInWith(page)).toEqual(['microsoft']);
  expect(await savedChoice(page)).toBe('microsoft');
});

test('a signed-in device opens its storage without the first-run screen, and remembers it', async ({ page }) => {
  // A fake build without a stubbed account is signed in with Microsoft.
  await openApp(page, { files: { 'tasks.md': TODAY_TASKS } });
  await expect(row(page, 'On OneDrive')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Use my OneDrive' })).toHaveCount(0);
  expect(await savedChoice(page)).toBe('microsoft');
});

test('a remembered choice that is not signed in asks before opening anything', async ({ page }) => {
  // Signed in with Google (whose drive holds the files), but this device chose OneDrive.
  await rememberChoice(page, 'microsoft');
  await openApp(page, { auth: 'google', providers: ['microsoft', 'google'], files: { 'tasks.md': TODAY_TASKS } });
  await expect(page.getByText('Sign in to open your tasks in OneDrive, or choose another place.')).toBeVisible();
  await expect(page.getByTestId('first-run-choices').getByRole('button').first()).toHaveText('Use my OneDrive');
  await expect(row(page, 'On OneDrive')).toHaveCount(0);
});

test.describe('on a computer', () => {
  test.skip(({ isMobile }) => isMobile, 'folders need the File System Access API (desktop Chrome and Edge)');

  test('Use a folder opens the folder picked, and the next start opens it again', async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { auth: 'signed-out' });
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] In the folder 📅 2026-10-16\n');
    await page.getByRole('button', { name: 'Use a folder on this computer' }).click();
    await expect(row(page, 'In the folder')).toHaveCount(1);
    expect(await savedChoice(page)).toBe('folder');
    await page.reload();
    await expect(row(page, 'In the folder')).toHaveCount(1);
  });

  test('Settings switches from OneDrive to a folder and back, copying and deleting nothing', async ({ page }) => {
    await installFolderPicker(page);
    await openApp(page, { files: { 'tasks.md': TODAY_TASKS } });
    await expect(row(page, 'On OneDrive')).toHaveCount(1);
    await folderWrite(page, 'tasks.md', '# Tasks\n- [ ] In the folder 📅 2026-10-16\n');

    await page.goto('/#settings');
    const card = page.getByTestId('settings-section-storage');
    await expect(card).toContainText('Your tasks are in OneDrive.');
    await card.getByRole('button', { name: 'Use a folder on this computer' }).click();
    // The page reloads where it was, on Settings.
    await expect(card).toContainText('Your tasks are in the folder Tasks.');
    await page.goto('/');
    await expect(row(page, 'In the folder')).toHaveCount(1);
    await expect(row(page, 'On OneDrive')).toHaveCount(0);
    expect(await folderFile(page, 'tasks.md')).not.toContain('On OneDrive');

    await page.goto('/#settings');
    await card.getByRole('button', { name: 'Use OneDrive' }).click();
    await expect(card).toContainText('Your tasks are in OneDrive.');
    await page.goto('/');
    await expect(row(page, 'On OneDrive')).toHaveCount(1);
    expect(await savedChoice(page)).toBe('microsoft');
    expect(await folderFile(page, 'tasks.md')).toContain('In the folder');
  });
});

test.describe('an edit not saved yet', () => {
  test.skip(({ isMobile }) => isMobile, 'switches to a folder (desktop Chrome and Edge)');

  test('waits on this device through a switch to a folder and back, after asking', async ({ page }) => {
    await installFolderPicker(page);
    // The cache survives reloads, as in the real app; the fake OneDrive is seeded afresh on each load.
    await page.addInitScript(() => {
      (window as unknown as { __TASKAPP_FAKE_DURABLE__: boolean }).__TASKAPP_FAKE_DURABLE__ = true;
    });
    await openApp(page, { files: { 'tasks.md': TODAY_TASKS } });
    await expect(row(page, 'On OneDrive')).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { __taskappFake: { setOffline(o: boolean): void } }).__taskappFake.setOffline(true));
    await page.getByTestId('add-input').fill('Waiting edit');
    await page.getByTestId('add-input').press('Enter');
    await expect(page.getByTestId('sync-banner')).toContainText("Can't reach OneDrive");

    const asked: string[] = [];
    page.once('dialog', (d) => {
      asked.push(d.message());
      void d.accept();
    });
    // The hash, not a page load: a load would bring the fake OneDrive back online.
    await page.evaluate(() => (location.hash = 'settings'));
    const card = page.getByTestId('settings-section-storage');
    await card.getByRole('button', { name: 'Use a folder on this computer' }).click();
    await expect(card).toContainText('Your tasks are in the folder Tasks.');
    expect(asked).toEqual([
      "You have changes that aren't saved to OneDrive yet. They stay on this device and are saved when you switch back. Switch anyway?",
    ]);
    expect(await folderFile(page, 'tasks.md')).not.toContain('Waiting edit');

    await card.getByRole('button', { name: 'Use OneDrive' }).click();
    await expect(card).toContainText('Your tasks are in OneDrive.');
    // The folder picked before is offered by name, and opens without the picker.
    await expect(card.getByRole('button', { name: 'Use the folder Tasks' })).toBeVisible();
    // Back to the list by hash: a load would seed the fake OneDrive afresh, without the edit it now holds.
    await page.evaluate(() => (location.hash = ''));
    await expect(row(page, 'Waiting edit')).toHaveCount(1);
    await expect(row(page, 'On OneDrive')).toHaveCount(1);
  });
});

test('Settings offers the storages this browser supports', async ({ page, isMobile }) => {
  await openApp(page, { auth: 'expired', providers: ['microsoft', 'google'] });
  await page.goto('/#settings');
  const card = page.getByTestId('settings-section-storage');
  await expect(card).toContainText('Your tasks are in OneDrive.');
  await expect(card.getByRole('button', { name: 'Use OneDrive' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Use Google Drive' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Use a folder on this computer' })).toHaveCount(isMobile ? 0 : 1);
  await card.getByRole('button', { name: 'Use Google Drive' }).click();
  await expect.poll(() => signInWith(page)).toEqual(['google']);
  expect(await savedChoice(page)).toBe('google');
});
