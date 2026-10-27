import { expect, test } from '@playwright/test';
import { authCalls, driveFile, firstRun, openTime, reload, rowIds } from './helpers';

test('signed out, the app offers Google sign-in', async ({ page }) => {
  await openTime(page, { auth: 'signed-out' });
  await expect(page).toHaveTitle('Omark Time');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  expect(await authCalls(page)).toEqual(['signIn']);
  await expect(page.getByRole('button', { name: 'Google Drive' })).toBeVisible();
});

test('the first run asks for Drive access, then the calendars, and writes the files', async ({ page }) => {
  await openTime(page);
  await expect(page.getByRole('button', { name: 'OneDrive' })).toBeDisabled();
  await firstRun(page);
  expect(await authCalls(page)).toEqual(['addAccess:drive']);
  expect(await driveFile(page, 'config.yaml')).toContain('calendars: [primary]');
  expect(await driveFile(page, 'config.yaml')).toContain('colour_events: false');
  expect(await driveFile(page, 'projects.csv')).toContain('ACME');
  expect(await rowIds(page)).toEqual(['old', 'typo', 'new']);
  await expect(page.getByTestId('rows')).toHaveText('3 rows of tracked time');
  await expect(page.getByTestId('status')).toContainText('1 to fix');
});

test('after the first run, a reload goes straight to the synced home', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  await reload(page);
  await expect(page.getByTestId('status')).toContainText('Synced');
  await expect(page.getByRole('button', { name: 'Google Drive' })).toHaveCount(0);
  expect(await authCalls(page)).toEqual([]);
});

test('a second calendar can be chosen in the first run', async ({ page }) => {
  await openTime(page);
  await page.getByRole('button', { name: 'Google Drive' }).click();
  await page.getByRole('checkbox', { name: 'Work' }).check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('status')).toContainText('Synced');
  expect(await driveFile(page, 'config.yaml')).toContain('calendars: [primary, work@example.com]');
});
