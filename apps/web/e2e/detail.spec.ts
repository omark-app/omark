import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, openApp, SPEC_TASKS } from './helpers';

test.skip(({ isMobile }) => isMobile, 'the detail pane is a desktop feature');

const TASKS = `${SPEC_TASKS}- [ ] Old thing 📅 2026-10-03\n`;
const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const legend = (page: Page) => page.locator('aside .legend');

async function start(page: Page) {
  await openApp(page, { files: { 'tasks.md': TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test('clicking a row shows its detail above ALWAYS', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('detail')).toHaveCount(0);
  await row(page, 'Call the dentist').click();
  const d = page.getByTestId('detail');
  await expect(legend(page)).toHaveText('task');
  await expect(d).toContainText('Task · Today');
  await expect(page.getByTestId('detail-title')).toHaveValue('Call the dentist about the crown');
  await expect(page.getByTestId('detail-notes')).toHaveValue('ask about zirconia\nbring the old x-ray');
  await expect(page.getByTestId('detail-due')).toHaveText('Today · Fri 16 Oct');
  for (const c of ['Today', 'This week', 'Next week', 'Someday']) {
    await expect(d.getByRole('button', { name: c, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('detail-repeat')).toHaveText('No repeat');
  await expect(d.getByRole('button', { name: 'Complete' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'Delete' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'esc' })).toBeVisible();
  const detailBox = (await d.boundingBox())!;
  const always = (await page.getByTestId('always-line').first().boundingBox())!;
  expect(always.y).toBeGreaterThan(detailBox.y + detailBox.height - 1);
});

test('Enter edits the title; Enter saves with a Saved toast', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.keyboard.press('Enter');
  const title = page.getByTestId('detail-title');
  await expect(title).toBeFocused();
  await page.keyboard.type(' now');
  await page.keyboard.press('Enter');
  await expect(title).not.toBeFocused();
  await expect(row(page, 'Send the invoice now')).toHaveCount(1);
  await expect(page.getByTestId('toast')).toContainText('Saved');
});

test('Shift+Enter moves to a new note line; Ctrl+Enter in the notes saves', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Enter');
  const notes = page.getByTestId('detail-notes');
  await expect(notes).toBeFocused();
  await page.keyboard.type('check amount');
  await page.keyboard.press('Control+Enter');
  await expect(notes).not.toBeFocused();
  await expect(page.getByTestId('toast')).toContainText('Saved');
  await expect(row(page, 'Send the invoice').locator('.ni')).toHaveCount(1);
});

test('Esc in a field saves and leaves it; Esc again deselects', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('!');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detail-title')).not.toBeFocused();
  await expect(row(page, 'Send the invoice!')).toHaveCount(1);
  await expect(legend(page)).toHaveText('task');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detail')).toHaveCount(0);
  await expect(legend(page)).toHaveText('always');
});

test('double-clicking a row focuses the title', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').dblclick();
  await expect(page.getByTestId('detail-title')).toBeFocused();
});

test('an overdue task has an over Due button', async ({ page }) => {
  await start(page);
  await row(page, 'Old thing').click();
  await expect(page.getByTestId('detail-due')).toHaveClass(/over/);
  await expect(page.getByTestId('detail-due')).toContainText('overdue');
  await row(page, 'Send the invoice').click();
  await expect(page.getByTestId('detail-due')).not.toHaveClass(/over/);
});

test('the Next week chip moves the task and Undo reverts it', async ({ page }) => {
  await start(page);
  await row(page, 'Call the dentist').click();
  await page.getByTestId('detail').getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(page.getByTestId('bucket-next').getByTestId('task-row').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
  await expect(page.getByTestId('toast')).toContainText('Moved to Next week');
  await page.getByTestId('toast-undo').click();
  await expect(page.getByTestId('bucket-today').getByTestId('task-row').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
  await expect(page.getByTestId('toast')).toContainText('Undone');
});

test('Complete and Delete buttons act on the task', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.getByTestId('detail').getByRole('button', { name: 'Complete' }).click();
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await row(page, 'Old thing').click();
  await page.getByTestId('detail').getByRole('button', { name: 'Delete' }).click();
  await expect(row(page, 'Old thing')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Deleted');
});

test('the round check button completes the task without selecting it', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').getByTestId('task-check').click();
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Done');
  await expect(page.getByTestId('detail')).toHaveCount(0);
});

test('Enter on a focused bucket head keeps its native click behaviour', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.getByTestId('bucket-head-today').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('detail-title')).not.toBeFocused();
  await expect(page.getByTestId('bucket-head-today')).toHaveAttribute('aria-expanded', 'false');
});

test('notes save one second after typing stops', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.getByTestId('detail-notes').click();
  await page.keyboard.type('pay by Friday');
  await expect.poll(() => driveFile(page, 'tasks.md'), { timeout: 8000 }).toContain('    - pay by Friday');
});
