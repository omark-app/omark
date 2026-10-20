import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, openApp, SPEC_TASKS } from './helpers';

test.skip(({ isMobile }) => isMobile, 'keyboard commands are a desktop feature');

const TASKS = `${SPEC_TASKS}- [ ] Old thing 📅 2026-10-03\n`;
const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const selected = (page: Page) => page.locator('[data-testid="task-row"].sel');

async function start(page: Page, now?: string) {
  await openApp(page, { files: { 'tasks.md': TASKS }, now });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test('slash focuses the add input; Enter adds to Today and keeps focus', async ({ page }) => {
  await start(page);
  const input = page.getByTestId('add-input');
  await expect(input).toHaveAttribute('placeholder', 'Add a task to Today');
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await page.keyboard.type('Buy milk');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('bucket-today').getByTestId('task-row').filter({ hasText: 'Buy milk' })).toHaveCount(1);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('toast')).toContainText('Added to Today');
});

test('shortcut letters type in the add input and change nothing; Escape blurs; Ctrl+Z is text undo', async ({ page }) => {
  await start(page);
  const input = page.getByTestId('add-input');
  await page.keyboard.press('n');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await page.keyboard.type('jxzt');
  await expect(input).toHaveValue('jxzt');
  await expect(selected(page)).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
});

test('j and k move the selection through visible rows', async ({ page }) => {
  await start(page);
  await page.keyboard.press('j');
  await expect(selected(page)).toContainText('Old thing');
  await page.keyboard.press('j');
  await expect(selected(page)).toContainText('Call the dentist');
  await page.keyboard.press('k');
  await expect(selected(page)).toContainText('Old thing');
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveCount(0);
});

test('clicking a row selects it', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await expect(selected(page)).toContainText('Send the invoice');
});

test('move, complete, delete and undo with single letters', async ({ page }) => {
  await start(page);
  await row(page, 'Call the dentist').click();

  await page.keyboard.press('e');
  await expect(page.getByTestId('toast')).toContainText('Moved to Next week · Sun');
  await expect(page.getByTestId('bucket-next').getByTestId('task-row').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
  await expect(selected(page)).toContainText('Call the dentist');

  await page.keyboard.press('s');
  await expect(page.getByTestId('toast')).toContainText('Moved to Someday');
  // Someday is folded, so the selection moves to a neighbour.
  await expect(selected(page)).toHaveCount(1);
  await expect(selected(page)).not.toContainText('Call the dentist');

  await page.keyboard.press('z');
  await expect(selected(page)).toHaveCount(1);
  await row(page, 'Call the dentist').click();
  await page.keyboard.press('t');
  await expect(page.getByTestId('bucket-today').getByTestId('task-row').filter({ hasText: 'Call the dentist' })).toHaveCount(1);

  await page.keyboard.press('x');
  await expect(page.getByTestId('toast')).toContainText('Done · Call the dentist');
  await expect.poll(() => driveFile(page, 'done.md')).toContain('Call the dentist');

  await row(page, 'Old thing').click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('toast')).toContainText('Deleted · Old thing');
  await expect(row(page, 'Old thing')).toHaveCount(0);
  await page.keyboard.press('z');
  await expect(row(page, 'Old thing')).toHaveCount(1);
});

test('on a Sunday w lands the task in Today', async ({ page }) => {
  await start(page, '2026-10-18T09:00:00');
  await row(page, 'Send the invoice').click();
  await page.keyboard.press('w');
  await expect(page.getByTestId('toast')).toContainText('Moved to Today');
  await expect(page.getByTestId('bucket-today').getByTestId('task-row').filter({ hasText: 'Send the invoice' })).toHaveCount(1);
});

test('on a Saturday w lands the task in Tomorrow (#26)', async ({ page }) => {
  await start(page, '2026-10-17T09:00:00');
  await row(page, 'Send the invoice').click();
  await page.keyboard.press('w');
  await expect(page.getByTestId('toast')).toContainText('Moved to Tomorrow · Sun');
  await expect(page.getByTestId('bucket-tomorrow').getByTestId('task-row').filter({ hasText: 'Send the invoice' })).toHaveCount(1);
});
