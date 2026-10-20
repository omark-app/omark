import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { driveFile, openApp, SPEC_TASKS } from './helpers';

// Issue #19: the Tomorrow choice, shortcut words in a new task's title, and the Important flag.
// The clock is Friday 2026-10-16: tomorrow is Sat 17 Oct, `fri` is Fri 23 Oct (Next week).

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const rowsOf = (page: Page, bucket: string) => page.getByTestId(`bucket-${bucket}`).getByTestId('task-row');
const sheet = (page: Page) => page.getByTestId('sheet');
const option = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const words = (scope: Locator | Page) => scope.getByTestId('shortcut-word');

async function start(page: Page, tasks = SPEC_TASKS) {
  await openApp(page, { files: { 'tasks.md': tasks } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

/** The copy with the bold words (just before the input) is scrolled exactly as the input is. */
async function expectAligned(input: Locator) {
  await expect
    .poll(() => input.evaluate((el: HTMLInputElement) => {
      const m = el.previousElementSibling as HTMLElement;
      return m.scrollLeft - el.scrollLeft;
    }))
    .toBe(0);
}

/** A left swipe on a row, as a finger's pointer events (opens the move sheet). */
async function swipeLeft(target: Locator) {
  await target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const at = (type: string, cx: number) =>
      el.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y }),
      );
    at('pointerdown', x);
    for (let i = 1; i <= 6; i++) at('pointermove', x - (120 * i) / 6);
    at('pointerup', x - 120);
  });
}

test.describe('iPhone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the add sheet and swipes run on the iphone project');

  test('typed shortcut words turn bold, move the chips, and leave the title', async ({ page }) => {
    await start(page);
    await page.getByTestId('fab').tap();
    await expect(option(page, 'Tomorrow')).toBeVisible();
    const field = sheet(page).getByLabel('New task');
    await field.pressSequentially('Call the bank imp tom');
    await expect(words(sheet(page))).toHaveText(['imp', 'tom']);
    // Only the copy with the bold words shows; the input's own text is transparent over it.
    await expect(field).toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
    await expect(option(page, 'Tomorrow')).toHaveAttribute('aria-pressed', 'true');
    await expect(option(page, 'Important')).toHaveAttribute('aria-pressed', 'true');
    await option(page, 'Add').tap();
    await expect(rowsOf(page, 'tomorrow').first()).toHaveText(/^\s*Call the bank/);
    await expect(row(page, 'Call the bank')).toHaveAttribute('data-important', 'true');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Call the bank ⏫ 📅 2026-10-17\n');
  });

  test('a weekday word shows its own date chip', async ({ page }) => {
    await start(page);
    await page.getByTestId('fab').tap();
    await sheet(page).getByLabel('New task').pressSequentially('Send the deck fri');
    await expect(option(page, 'Fri 23 Oct')).toHaveAttribute('aria-pressed', 'true');
    await option(page, 'Add').tap();
    await expect(rowsOf(page, 'next').filter({ hasText: 'Send the deck' })).toHaveCount(1);
  });

  test('Backspace after a bold word keeps it as text; retyping it brings it back', async ({ page }) => {
    await start(page);
    await page.getByTestId('fab').tap();
    const field = sheet(page).getByLabel('New task');
    await field.pressSequentially('Buy sun');
    await expect(words(sheet(page))).toHaveText(['sun']);
    await field.press('Backspace');
    await expect(field).toHaveValue('Buy sun');
    await expect(words(sheet(page))).toHaveCount(0);
    await field.pressSequentially(' ');
    await expect(words(sheet(page))).toHaveCount(0);
    await field.press('Backspace');
    await field.press('Backspace');
    await field.pressSequentially('n');
    await expect(words(sheet(page))).toHaveText(['sun']);
    await field.press('Backspace');
    await field.pressSequentially(' cream');
    await expect(option(page, 'Today')).toHaveAttribute('aria-pressed', 'true');
    await option(page, 'Add').tap();
    await expect(rowsOf(page, 'today').filter({ hasText: 'Buy sun cream' })).toHaveCount(1);
  });

  test('a chip tapped after typing wins over the word', async ({ page }) => {
    await start(page);
    await page.getByTestId('fab').tap();
    await sheet(page).getByLabel('New task').pressSequentially('Plan trip tom');
    await option(page, 'Someday').tap();
    await option(page, 'Add').tap();
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Plan trip\n');
  });

  test('a picked chip gives way to a typed word and does not come back when the word goes', async ({ page }) => {
    await start(page);
    await page.getByTestId('fab').tap();
    const field = sheet(page).getByLabel('New task');
    await field.pressSequentially('Plan');
    await option(page, 'Someday').tap();
    await field.pressSequentially(' tom');
    await expect(option(page, 'Tomorrow')).toHaveAttribute('aria-pressed', 'true');
    await field.fill('Plan');
    await expect(option(page, 'Today')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the bold copy stays lined up with text longer than the field', async ({ page }) => {
    await start(page);
    await page.getByTestId('fab').tap();
    const field = sheet(page).getByLabel('New task');
    await field.pressSequentially('Call the bank imp tom and also ask about the mortgage rates fri');
    await expectAligned(field);
  });

  test('words typed while editing a task apply on Save; words it already had stay text', async ({ page }) => {
    await start(page, `${SPEC_TASKS}- [ ] Call Tom 📅 2026-10-16\n`);
    await row(page, 'Call Tom').tap();
    const title = sheet(page).getByLabel('Task title');
    await expect(words(sheet(page))).toHaveCount(0);
    await title.press('End');
    await title.pressSequentially(' back imp');
    await expect(words(sheet(page))).toHaveText(['imp']);
    await option(page, 'Save').tap();
    await expect(row(page, 'Call Tom back')).toHaveAttribute('data-important', 'true');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Call Tom back ⏫ 📅 2026-10-16\n');
  });

  test('the move sheet has Tomorrow and Mark important', async ({ page }) => {
    await start(page);
    await swipeLeft(row(page, 'Call the dentist'));
    await expect(sheet(page).getByRole('button', { name: /^Tomorrow/ })).toContainText('Sat 17 Oct');
    await sheet(page).getByRole('button', { name: /^Tomorrow/ }).tap();
    await expect(rowsOf(page, 'tomorrow').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
    await swipeLeft(row(page, 'Call the dentist'));
    await sheet(page).getByRole('button', { name: /^Mark important/ }).tap();
    await expect(row(page, 'Call the dentist')).toHaveAttribute('data-important', 'true');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Call the dentist about the crown ⏫ 📅 2026-10-17\n');
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the add input, keys and detail run on the desktop project');

  test('the add input shows bold shortcut words and Enter adds with them', async ({ page }) => {
    await start(page);
    const input = page.getByTestId('add-input');
    await input.click();
    await page.keyboard.type('Send deck to Piotr fri imp');
    await expect(words(page.getByTestId('add'))).toHaveText(['fri', 'imp']);
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(words(page.getByTestId('add'))).toHaveCount(0);
    await expect(rowsOf(page, 'next').first()).toHaveText(/^\s*Send deck to Piotr/);
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Send deck to Piotr ⏫ 📅 2026-10-23\n');
  });

  test('Backspace after a bold word in the add input keeps it as text', async ({ page }) => {
    await start(page);
    await page.getByTestId('add-input').click();
    await page.keyboard.type('Call Tom');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect(rowsOf(page, 'today').filter({ hasText: 'Call Tom' })).toHaveCount(1);
  });

  test('Enter on a title of shortcut words only keeps the text', async ({ page }) => {
    await start(page);
    await page.getByTestId('add-input').click();
    await page.keyboard.type('tom imp');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('add-input')).toHaveValue('tom imp');
  });

  test('the bold copy in the add input stays lined up with long text, also after Home', async ({ page }) => {
    await start(page);
    const input = page.getByTestId('add-input');
    await input.click();
    await page.keyboard.type('Send the deck to Piotr and ask about the term sheet and the board call agenda for next quarter fri imp');
    await expectAligned(input);
    await page.keyboard.press('Home');
    await expectAligned(input);
    await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.scrollLeft)).toBe(0);
  });

  test('m moves the selected task to tomorrow and i flags it', async ({ page }) => {
    await start(page);
    await row(page, 'Call the dentist').click();
    await page.keyboard.press('m');
    await expect(rowsOf(page, 'tomorrow').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
    await page.keyboard.press('i');
    await expect(row(page, 'Call the dentist')).toHaveAttribute('data-important', 'true');
    await expect(page.getByTestId('toast')).toContainText('Marked important');
    await page.keyboard.press('i');
    await expect(row(page, 'Call the dentist')).toHaveAttribute('data-important', 'false');
    await expect(page.getByTestId('hints')).toContainText('tomorrow');
    await expect(page.getByTestId('hints')).toContainText('important');
  });

  test('the detail has a Tomorrow chip and an Important toggle', async ({ page }) => {
    await start(page);
    await row(page, 'Call the dentist').click();
    const d = page.getByTestId('detail');
    await d.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await expect(page.getByTestId('detail-due')).toContainText('Sat 17 Oct');
    const flag = d.getByRole('button', { name: 'Important', exact: true });
    await expect(flag).toHaveAttribute('aria-pressed', 'false');
    await flag.click();
    await expect(flag).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, 'Call the dentist')).toHaveAttribute('data-important', 'true');
  });

  test('words typed in the detail title move the task on Enter and leave the title', async ({ page }) => {
    await start(page);
    await row(page, 'Call the dentist').click();
    const title = page.getByTestId('detail-title');
    await title.click();
    await title.press('End');
    await page.keyboard.type(' tom');
    await expect(words(page.getByTestId('detail'))).toHaveText(['tom']);
    await page.keyboard.press('Enter');
    await expect(rowsOf(page, 'tomorrow').filter({ hasText: 'Call the dentist about the crown' })).toHaveCount(1);
    await expect(title).toHaveValue('Call the dentist about the crown');
    await expect(page.getByTestId('toast')).toContainText('Moved to Tomorrow');
  });

  test('important tasks come first in their bucket, in the list and on the board', async ({ page }) => {
    await start(page, SPEC_TASKS.replace('- [ ] Send the invoice 📅 2026-10-19', '- [ ] Send the invoice ⏫ 📅 2026-10-19'));
    await expect(rowsOf(page, 'next').first()).toHaveText(/^\s*Send the invoice/);
    await expect(rowsOf(page, 'next').first()).toHaveAttribute('data-important', 'true');
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(rowsOf(page, 'next').first()).toHaveText(/^\s*Send the invoice/);
  });
});
