import { expect, test } from '@playwright/test';
import { driveFile, editEvent, firstRun, openTime, reload, rowIds } from './helpers';
import { poll } from './poll';

test('a calendar change shows up in the files after Sync now', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  await editEvent(page, 'lunch', { title: 'ACME; Meetings; lunch with the client' });
  await editEvent(page, 'old', { title: 'Dentist' });
  await page.getByRole('button', { name: 'Sync now' }).click();
  await poll(() => rowIds(page)).toEqual(['typo', 'lunch', 'new']);
  expect(await driveFile(page, 'events-2026.csv')).toContain('Meetings,lunch with the client');
});

test('a change made while the app was closed shows up on the next open', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  await editEvent(page, 'old', { title: 'ACME; Coding; renamed' });
  await reload(page);
  await poll(async () => driveFile(page, 'events-2026.csv')).toContain('renamed');
});

test('rebuild gives the same files', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  const before = await driveFile(page, 'events-2026.csv');
  await page.getByRole('button', { name: 'Rebuild' }).click();
  await expect(page.getByTestId('status')).toContainText('Synced');
  expect(await driveFile(page, 'events-2026.csv')).toBe(before);
});

test('a new project in projects.csv makes its events known', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  await expect(page.getByTestId('status')).toContainText('1 to fix');
  await page.evaluate(() =>
    window.__omarkTime!.drive.externalWrite('projects.csv', 'code,description,client,rate,currency,archived\nACME,Acme,,,,\nACMEE,Typo,,,,\n'),
  );
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByTestId('status')).toContainText('0 to fix');
});
