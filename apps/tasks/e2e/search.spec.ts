import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './helpers';

const TASKS = `# Tasks
- [ ] One tab at a time ⏫
- [ ] Badanie zwłóknienia wątroby 📅 2026-10-20
    - wyniki u dr Nowak
- [ ] Call the dentist 📅 2026-10-14
    - ask about zirconia
- [ ] Zirconia crown price 📅 2026-11-30
- [ ] Learn Polish sign language
`;
const DONE = `- [x] Old zirconia quote ✅ 2026-09-02
    - from the Kraków clinic
- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-12
`;

const panel = (page: Page) => page.getByTestId('search');
const input = (page: Page) => page.getByTestId('search-input');
const results = (page: Page) => page.getByTestId('search-result');

async function start(page: Page) {
  await openApp(page, { files: { 'tasks.md': TASKS, 'done.md': DONE } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the keyboard flow is a desktop feature');

  test('f opens search; diacritics fold both ways; arrows and Enter open the detail; Esc goes back', async ({ page }) => {
    await start(page);
    await page.keyboard.press('f');
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('');
    await page.keyboard.type('ZWLOKNIENIA');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page)).toContainText('Badanie zwłóknienia wątroby');
    await expect(results(page)).toContainText('Tue');
    await expect(results(page).locator('mark')).toHaveText('zwłóknienia');

    await input(page).fill('zirconia');
    // Title matches before the note-only one, whose note line shows.
    await expect(results(page)).toHaveText([/^Zirconia crown price/, /^Call the dentist.*ask about zirconia/]);
    await expect(results(page).nth(1)).toContainText('Wed');
    await page.keyboard.press('ArrowDown');
    await expect(results(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('detail-title')).toHaveValue('Call the dentist');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('detail')).toHaveCount(0);
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('zirconia');
    await expect(results(page)).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
  });

  test('Ctrl+K opens search and Esc gives focus back; f types in fields', async ({ page }) => {
    await start(page);
    await page.getByTestId('task-row').filter({ hasText: 'Call the dentist' }).click();
    await page.getByTestId('detail-due').focus();
    await page.keyboard.press('Control+k');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('detail-due')).toBeFocused();

    await page.getByTestId('detail-title').focus();
    await page.keyboard.press('End');
    await page.keyboard.type('f');
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('detail-title')).toHaveValue('Call the dentistf');
  });

  test('completed matches on request, struck through, open read-only and come back', async ({ page }) => {
    await start(page);
    await page.keyboard.press('f');
    await page.keyboard.type('zirconia');
    await expect(page.getByTestId('search-more')).toHaveText('Also search 1 completed');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const done = results(page).nth(2);
    await expect(done).toContainText('Old zirconia quote');
    await expect(done).toContainText('✅ 2 Sep');
    await expect(done.locator('.title')).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('search-more')).toHaveCount(0);

    await done.click();
    const sheet = page.getByTestId('sheet');
    await expect(sheet.getByTestId('done-title')).toHaveText('Old zirconia quote');
    await expect(sheet).toContainText('Completed Wed 2 Sep');
    await expect(sheet).toContainText('from the Kraków clinic');
    await expect(sheet.getByRole('button', { name: 'Reopen' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(input(page)).toHaveValue('zirconia');
    await expect(results(page)).toHaveCount(3);

    // A word only in a completed task's note finds it.
    await input(page).fill('krakow');
    await expect(results(page)).toHaveCount(1);
    await expect(results(page)).toContainText('from the Kraków clinic');
  });

  test('works on the week board, and a click opens the result in the rail', async ({ page }) => {
    await start(page);
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toBeVisible();
    await page.keyboard.press('f');
    await page.keyboard.type('nowak');
    await expect(results(page)).toContainText('wyniki u dr Nowak');
    await results(page).first().click();
    await expect(page.getByTestId('rail').getByTestId('detail-title')).toHaveValue('Badanie zwłóknienia wątroby');
    await page.getByTestId('rail').getByRole('button', { name: 'esc' }).click();
    await expect(input(page)).toHaveValue('nowak');
    await page.getByTestId('search-close').click();
    await expect(panel(page)).toHaveCount(0);
  });

  test('selecting another task while a result is open leaves search', async ({ page }) => {
    await start(page);
    await page.keyboard.press('f');
    await page.keyboard.type('polish');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('detail-title')).toHaveValue('Learn Polish sign language');
    await page.getByTestId('task-row').filter({ hasText: 'Call the dentist' }).click();
    await expect(page.getByTestId('detail-title')).toHaveValue('Call the dentist');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the full-screen search runs on the iphone project');

  test('🔍 opens full-screen search; a tap opens the edit sheet; closing it comes back', async ({ page }) => {
    await start(page);
    await page.getByTestId('search-open').tap();
    const box = await page.getByTestId('search').locator('[role="dialog"]').boundingBox();
    const view = page.viewportSize()!;
    expect(box).toEqual({ x: 0, y: 0, width: view.width, height: view.height });
    await input(page).fill('watroby');
    await expect(results(page)).toHaveCount(1);
    await results(page).tap();
    const sheet = page.getByTestId('sheet');
    await expect(sheet.getByLabel('Task title')).toHaveValue('Badanie zwłóknienia wątroby');
    await sheet.getByRole('button', { name: 'Save' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(input(page)).toHaveValue('watroby');
    await expect(results(page)).toHaveCount(1);
    await page.getByTestId('search-close').tap();
    await expect(page.getByTestId('search')).toHaveCount(0);
  });

  test('a completed match opens read-only', async ({ page }) => {
    await start(page);
    await page.getByTestId('search-open').tap();
    await input(page).fill('plants');
    await page.getByTestId('search-more').tap();
    await results(page).tap();
    const sheet = page.getByTestId('sheet');
    await expect(sheet.getByTestId('done-title')).toHaveText('Water the plants');
    await expect(sheet).toContainText('↻ every Mon');
    await sheet.getByRole('button', { name: 'Close' }).tap();
    await expect(input(page)).toHaveValue('plants');
  });
});
