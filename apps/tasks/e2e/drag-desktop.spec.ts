import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp, SPEC_TASKS } from './helpers';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const sheet = (page: Page) => page.getByTestId('sheet');

test.describe('desktop drag', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse drag is a desktop feature; touch drag is separate');

  test.beforeEach(async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
    await expect(page.getByTestId('bucket-today')).toBeVisible();
  });

  test('dropping a Someday task on the Next week head moves it there', async ({ page }) => {
    await page.getByTestId('bucket-head-someday').click();
    await row(page, 'Learn Polish').dragTo(page.getByTestId('bucket-head-next'));
    await expect(page.getByTestId('toast')).toContainText('Moved to Next week · Sun');
    await expect(page.getByTestId('bucket-next').getByTestId('task-row').filter({ hasText: 'Learn Polish' })).toHaveCount(1);
  });

  test('dropping on a row in the same bucket reorders', async ({ page }) => {
    const next = page.getByTestId('bucket-next').getByTestId('task-row');
    await expect(next.first()).toContainText('Water the plants');
    await row(page, 'Send the invoice').dragTo(row(page, 'Water the plants'));
    await expect(next.first()).toContainText('Send the invoice');
  });

  test('dropping on Later opens the date picker pre-filled; a row drop there sets the order', async ({ page }) => {
    await row(page, 'Call the dentist').dragTo(page.getByTestId('bucket-head-later'));
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByLabel('Due date')).toHaveValue('2026-10-26');
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await sheet(page).getByRole('button', { name: 'Set date' }).click();
    await expect(page.getByTestId('toast')).toContainText('Moved to Later');
    await page.getByTestId('bucket-head-later').click();
    await expect(page.getByTestId('bucket-later').getByTestId('task-row')).toHaveCount(1);

    await row(page, 'Send the invoice').dragTo(row(page, 'Call the dentist'));
    await expect(sheet(page).getByLabel('Due date')).toHaveValue('2026-10-26');
    await sheet(page).getByRole('button', { name: 'Set date' }).click();
    const later = page.getByTestId('bucket-later').getByTestId('task-row');
    await expect(later).toHaveCount(2);
    await expect(later.first()).toContainText('Send the invoice');
  });

  test('a drag does not select the row', async ({ page }) => {
    await row(page, 'Send the invoice').dragTo(page.getByTestId('bucket-head-today'));
    await expect(page.getByTestId('detail')).toHaveCount(0);
  });
});
