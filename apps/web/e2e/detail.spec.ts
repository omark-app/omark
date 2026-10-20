import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, fitsNotes, LONG_NOTE, openApp, SPEC_TASKS } from './helpers';

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
  await expect.poll(() => driveFile(page, 'tasks.md'), { timeout: 1500, intervals: [100] }).toContain('    - pay by Friday');
});

test('Shift+Enter from the title on a task with notes keeps the notes and adds the new line', async ({ page }) => {
  await start(page);
  await row(page, 'Call the dentist').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('third');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('detail-notes')).toHaveValue('ask about zirconia\nbring the old x-ray\nthird');
  await expect.poll(() => driveFile(page, 'tasks.md'), { timeout: 3000 }).toContain('    - bring the old x-ray\n    - third');
});

test('typed notes are saved when the app is hidden before the debounce fires', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.getByTestId('detail-notes').click();
  await page.keyboard.type('hidden save');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => driveFile(page, 'tasks.md'), { timeout: 700, intervals: [50] }).toContain('    - hidden save');
});

test('typed title is saved when the selection changes', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.getByTestId('detail-title').click();
  await page.keyboard.type(' x');
  await row(page, 'Old thing').click({ position: { x: 150, y: 5 } });
  await expect(row(page, 'Send the invoice x')).toHaveCount(1);
});

test('the This week chip is hidden on a Sunday', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': TASKS }, now: '2026-10-18T09:00:00' });
  await row(page, 'Send the invoice').click();
  const d = page.getByTestId('detail');
  await expect(d.getByRole('button', { name: 'Next week', exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: 'This week', exact: true })).toHaveCount(0);
});

test('the notes box grows to fit long notes instead of scrolling inside', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': `${SPEC_TASKS}- [ ] Buy fishing gear 📅 2026-10-16\n    - ${LONG_NOTE}\n    - ${LONG_NOTE}\n` } });
  await row(page, 'Buy fishing gear').click();
  const notes = page.getByTestId('detail-notes');
  await expect(notes).toHaveValue(`${LONG_NOTE}\n${LONG_NOTE}`);
  expect(await fitsNotes(notes)).toBe(true);
  await notes.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(` ${LONG_NOTE}`);
  expect(await fitsNotes(notes)).toBe(true);
});

const LONG_TITLE = 'pluca zwloknienia post covid sportslab i es pulmonolog i aat call';

test('a long title wraps onto more lines instead of being cut off, with the bold copy wrapped the same', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': `${SPEC_TASKS}- [ ] ${LONG_TITLE} 📅 2026-10-16\n` } });
  await row(page, 'pluca zwloknienia').click();
  const title = page.getByTestId('detail-title');
  await expect(title).toHaveValue(LONG_TITLE);
  const box = () =>
    title.evaluate((el) => {
      const cs = getComputedStyle(el);
      const line = el.previousElementSibling!.firstElementChild!.getBoundingClientRect().height;
      const inner = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return { lines: Math.round(inner / parseFloat(cs.lineHeight)), wide: el.scrollWidth > el.clientWidth, tall: el.scrollHeight > el.clientHeight + 1, line, inner };
    });
  const before = await box();
  expect(before.wide).toBe(false);
  expect(before.tall).toBe(false);
  expect(before.lines).toBeGreaterThan(1);
  expect(Math.abs(before.line - before.inner)).toBeLessThan(1);
  await title.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' tomorrow');
  await expect(page.getByTestId('shortcut-word')).toHaveText('tomorrow');
  const after = await box();
  expect(after.tall).toBe(false);
  expect(Math.abs(after.line - after.inner)).toBeLessThan(1);
});

test('a line break pasted into the title becomes a space, so the title stays one line', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').click();
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(' to Ana\nby email');
  await expect(page.getByTestId('detail-title')).toHaveValue('Send the invoice to Ana by email');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Send the invoice to Ana by email')).toHaveCount(1);
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Send the invoice to Ana by email 📅 2026-10-19');
});

test('pasting lines into the title keeps the caret after them, and Ctrl+Z takes the paste back', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  await row(page, 'Send the invoice').click();
  const title = page.getByTestId('detail-title');
  await title.click();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.evaluate(() => navigator.clipboard.writeText('A\nB\r\nC'));
  await page.keyboard.press('Control+V');
  await expect(title).toHaveValue('SendA B C the invoice');
  await page.keyboard.type('Z');
  await expect(title).toHaveValue('SendA B CZ the invoice');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await expect(title).toHaveValue('Send the invoice');
});
