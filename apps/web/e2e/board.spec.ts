import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './helpers';

const TASKS = `# Always
- Walk before the first coffee

# Tasks
- [ ] Call the dentist 📅 2026-10-16
- [ ] Send the invoice 📅 2026-10-17
- [ ] Plan the trip 📅 2026-10-21
- [ ] Book the venue 📅 2026-12-01
- [ ] Learn Polish sign language
`;

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const selected = (page: Page) => page.locator('[data-testid="task-row"].sel');

async function start(page: Page, files: Record<string, string> = {}) {
  await openApp(page, { files: { 'tasks.md': TASKS, ...files } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test.describe('desktop board', () => {
  test.skip(({ isMobile }) => isMobile, 'the board is a desktop view');

  test('v switches to the board and back', async ({ page }) => {
    await start(page);
    await expect(page.getByTestId('board')).toHaveCount(0);
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('rail')).toContainText('taskapp · Fri 16 Oct');
    await expect(page.getByTestId('stats')).toBeVisible();
    await expect(page.getByTestId('always-line')).toHaveCount(1);
    await expect(page.getByTestId('hints')).toBeVisible();
    await expect(page.getByTestId('status')).toBeVisible();
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toHaveCount(0);
  });

  test('four columns, fold control only on Later and Someday, which start folded', async ({ page }) => {
    await start(page);
    await page.keyboard.press('v');
    const cols = page.getByTestId('board-col');
    await expect(cols).toHaveCount(4);
    await expect(cols.nth(0).getByTestId('bucket-today')).toBeVisible();
    await expect(cols.nth(1).getByTestId('bucket-week')).toBeVisible();
    await expect(cols.nth(2).getByTestId('bucket-next')).toBeVisible();
    await expect(cols.nth(3).getByTestId('bucket-later')).toBeVisible();
    await expect(cols.nth(3).getByTestId('bucket-someday')).toBeVisible();
    for (const key of ['today', 'week', 'next']) {
      await expect(page.getByTestId(`bucket-head-${key}`).getByRole('button')).toHaveCount(0);
    }
    await expect(page.getByTestId('bucket-head-later')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('bucket-head-someday')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Book the venue')).toHaveCount(0);
    await page.getByTestId('bucket-head-later').click();
    await expect(row(page, 'Book the venue')).toBeVisible();
  });

  test('selecting a task replaces Always with the detail; Esc brings it back', async ({ page }) => {
    await start(page);
    await page.keyboard.press('v');
    await expect(page.getByTestId('detail')).toHaveCount(0);
    await row(page, 'Call the dentist').click();
    await expect(page.getByTestId('detail')).toBeVisible();
    await expect(page.getByTestId('rail').getByTestId('detail-title')).toHaveValue('Call the dentist');
    await expect(page.getByTestId('always-line')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('detail')).toHaveCount(0);
    await expect(page.getByTestId('always-line')).toHaveCount(1);
  });

  test('j walks the rows column by column and skips folded buckets', async ({ page }) => {
    await start(page);
    await page.keyboard.press('v');
    await page.keyboard.press('j');
    await expect(selected(page)).toContainText('Call the dentist');
    await page.keyboard.press('j');
    await expect(selected(page)).toContainText('Send the invoice');
    await page.keyboard.press('j');
    await expect(selected(page)).toContainText('Plan the trip');
    await page.keyboard.press('j');
    await expect(selected(page)).toContainText('Plan the trip');
  });

  test('commands work on the board', async ({ page }) => {
    await start(page);
    await page.keyboard.press('v');
    await page.keyboard.press('j');
    await page.keyboard.press('d');
    await expect(page.getByTestId('sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('x');
    await expect(row(page, 'Call the dentist')).toHaveCount(0);
  });

  test('defaultView: board opens on the board', async ({ page }) => {
    await start(page, { 'config.yaml': 'defaultView: board\n' });
    await expect(page.getByTestId('board')).toBeVisible();
  });

  test('at 1000 px the columns wrap two per row', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await start(page, { 'config.yaml': 'defaultView: board\n' });
    const boxes = await page.getByTestId('board-col').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(boxes[1]!.top).toBe(boxes[0]!.top);
    expect(boxes[2]!.top).toBeGreaterThan(boxes[0]!.bottom - 1);
    expect(boxes[3]!.top).toBe(boxes[2]!.top);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('v does nothing and the list stays', async ({ page }) => {
    await start(page, { 'config.yaml': 'defaultView: board\n' });
    await expect(page.getByTestId('board')).toHaveCount(0);
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toHaveCount(0);
    await expect(page.getByTestId('bucket-today')).toBeVisible();
  });
});
