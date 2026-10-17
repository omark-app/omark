import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, openApp, SPEC_TASKS } from './helpers';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const sheet = (page: Page) => page.getByTestId('sheet');

/** Opens the app with Someday unfolded, where the undated task lives. */
async function start(page: Page) {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await page.getByTestId('bucket-head-someday').click();
}

test.describe('desktop keys', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard commands are a desktop feature');

  test('d opens the date picker; Tomorrow sets the date and moves the row to This week', async ({ page }) => {
    await start(page);
    await row(page, 'Learn Polish').click();
    await page.keyboard.press('d');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toContainText('Learn Polish sign language');
    for (const c of ['Today', 'Tomorrow · Sat', 'This week · Sun', 'Next week · Sun', 'Someday']) {
      await expect(sheet(page).getByRole('button', { name: c, exact: true })).toBeVisible();
    }
    await sheet(page).getByRole('button', { name: 'Tomorrow · Sat' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('bucket-week').getByTestId('task-row').filter({ hasText: 'Learn Polish' })).toHaveCount(1);
    await expect(page.getByTestId('toast')).toContainText('Moved to This week · Sat');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('Learn Polish sign language 📅 2026-10-17');
  });

  test('r opens the repeat picker; every week on Mo + Th saves the rule', async ({ page }) => {
    await start(page);
    await row(page, 'Send the invoice').click();
    await page.keyboard.press('r');
    await sheet(page).getByRole('button', { name: 'Th', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(row(page, 'Send the invoice').getByTestId('task-meta')).toHaveText('↻ Mon');
    await expect(page.getByTestId('toast')).toContainText('Repeats every Mon, Thu');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('🔁 every week on Monday, Thursday');
  });

  test('every 2 weeks on Friday saves an interval rule', async ({ page }) => {
    await start(page);
    await row(page, 'Send the invoice').click();
    await page.keyboard.press('r');
    await sheet(page).getByLabel('Week interval').fill('2');
    await sheet(page).getByRole('button', { name: 'Fr', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Mo', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('Repeats every 2 weeks on Fri');
    await expect(page.getByTestId('detail-repeat')).toHaveText('↻ every 2 weeks on Fri');
    // Due Mon 19 Oct moves to that week's Friday.
    await expect
      .poll(() => driveFile(page, 'tasks.md'))
      .toContain('- [ ] Send the invoice 🔁 every 2 weeks on Friday 📅 2026-10-23');
    // Reopening the picker shows the saved interval.
    await page.keyboard.press('r');
    await expect(sheet(page).getByLabel('Week interval')).toHaveValue('2');
    await expect(sheet(page).getByRole('button', { name: 'Fr', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('every 3 months on day 25 and every 3 months save month rules', async ({ page }) => {
    await start(page);
    await row(page, 'Send the invoice').click();
    await page.keyboard.press('r');
    await sheet(page).getByLabel('Month interval').fill('3');
    await sheet(page).getByLabel('Day of the month').fill('25');
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('toast')).toContainText('Repeats every 3 months on the 25th');
    await expect
      .poll(() => driveFile(page, 'tasks.md'))
      .toContain('- [ ] Send the invoice 🔁 every 3 months on the 25th 📅 2026-10-25');

    await page.keyboard.press('r');
    await sheet(page).getByLabel('Repeat interval').fill('3');
    await sheet(page).getByLabel('Interval unit').selectOption('months');
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('toast')).toContainText('Repeats every 3 months');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Send the invoice 🔁 every 3 months 📅 2026-10-25');
  });

  test('Esc closes a sheet without changing anything', async ({ page }) => {
    await start(page);
    const before = await driveFile(page, 'tasks.md');
    await row(page, 'Learn Polish').click();
    await page.keyboard.press('d');
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await page.keyboard.press('r');
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(row(page, 'Learn Polish')).toBeVisible();
    expect(await driveFile(page, 'tasks.md')).toBe(before);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('keys typed inside a sheet do not trigger commands', async ({ page }) => {
    await start(page);
    await row(page, 'Learn Polish').click();
    await page.keyboard.press('d');
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('t');
    await page.keyboard.press('x');
    await page.keyboard.press('Delete');
    await expect(sheet(page)).toBeVisible();
    await expect(row(page, 'Learn Polish')).toHaveCount(1);
    await expect(page.getByTestId('bucket-someday').getByTestId('task-row').filter({ hasText: 'Learn Polish' })).toHaveCount(1);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });
});

test('clicking task-meta opens the picker; a date in Later shows 1 Dec', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').getByTestId('task-meta').click();
  await expect(sheet(page)).toContainText('Send the invoice');
  await sheet(page).getByLabel('Due date').fill('2026-12-01');
  await sheet(page).getByRole('button', { name: 'Set date' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await page.getByTestId('bucket-head-later').click();
  const later = page.getByTestId('bucket-later').getByTestId('task-row').filter({ hasText: 'Send the invoice' });
  await expect(later.getByTestId('task-meta')).toHaveText('1 Dec');
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('Send the invoice 📅 2026-12-01');
});

test('a backdrop click closes the sheet, but not within 400 ms of opening', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').getByTestId('task-meta').click();
  await page.mouse.click(5, 5);
  await expect(sheet(page)).toBeVisible();
  await page.waitForTimeout(500);
  await page.mouse.click(5, 5);
  await expect(sheet(page)).toHaveCount(0);
});

test.describe('desktop detail', () => {
  test.skip(({ isMobile }) => isMobile, 'the detail pane is a desktop feature');

  test('3 days after I complete it writes a when-done rule', async ({ page }) => {
    await start(page);
    await row(page, 'Learn Polish').click();
    await page.getByTestId('detail-repeat').click();
    await sheet(page).getByLabel('days after I complete it').check();
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('toast')).toContainText('Repeats 3 days after done');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('Learn Polish sign language 🔁 every 3 days when done');
  });

  test('the detail Due button opens the date picker with the date field focused', async ({ page }) => {
    await start(page);
    await row(page, 'Learn Polish').click();
    await page.getByTestId('detail-due').click();
    await expect(sheet(page).getByLabel('Due date')).toBeVisible();
    await expect(sheet(page).getByLabel('Due date')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
  });
});
