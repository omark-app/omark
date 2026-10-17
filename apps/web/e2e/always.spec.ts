import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, externalWrite, openApp, SPEC_TASKS } from './helpers';

const lines = (page: Page) => page.getByTestId('always-line');
const alwaysOnDrive = async (page: Page) => {
  const text = await driveFile(page, 'tasks.md');
  return text.split('# Tasks')[0]!;
};

async function start(page: Page) {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test('clicking a line edits it; Enter saves into tasks.md', async ({ page }) => {
  await start(page);
  await lines(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' slowly');
  await page.keyboard.press('Enter');
  await expect(lines(page).first()).not.toBeFocused();
  await expect(lines(page).first()).toHaveText('Walk before the first coffee slowly');
  await expect(page.getByTestId('toast')).toContainText('Saved');
  await expect.poll(() => alwaysOnDrive(page)).toContain('- Walk before the first coffee slowly\n- One tab at a time');
});

test('blur saves too', async ({ page }) => {
  await start(page);
  await lines(page).nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.getByTestId('always-add').focus();
  await expect.poll(() => alwaysOnDrive(page)).toContain('- One tab at a time!');
});

test('+ Add a line focuses a new empty line; typing then Enter adds it', async ({ page }) => {
  await start(page);
  await page.getByTestId('always-add').click();
  await expect(lines(page)).toHaveCount(3);
  await expect(lines(page).nth(2)).toBeFocused();
  await page.keyboard.type('Drink water');
  await page.keyboard.press('Enter');
  await expect(lines(page)).toHaveCount(3);
  await expect(lines(page).nth(2)).toHaveText('Drink water');
  await expect.poll(() => alwaysOnDrive(page)).toContain('- One tab at a time\n- Drink water\n');
});

test('an empty new line disappears on blur', async ({ page }) => {
  await start(page);
  await page.getByTestId('always-add').click();
  await expect(lines(page)).toHaveCount(3);
  await page.keyboard.press('Enter');
  await expect(lines(page)).toHaveCount(2);
});

test('emptying a line and blurring removes it', async ({ page }) => {
  await start(page);
  await lines(page).first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(lines(page)).toHaveCount(1);
  await expect.poll(() => alwaysOnDrive(page)).toBe('# Always\n- One tab at a time\n\n');
});

test('keys typed in a line are text, not commands', async ({ page }) => {
  await start(page);
  const rowsBefore = await page.getByTestId('task-row').allTextContents();
  const counts = () => Promise.all(['today', 'week', 'next', 'later', 'someday'].map((k) => page.getByTestId(`bucket-count-${k}`).textContent()));
  const countsBefore = await counts();
  await page.getByTestId('task-row').first().click();
  const selected = page.locator('[data-testid="task-row"][aria-selected="true"], [data-testid="task-row"].sel');
  const selectedBefore = await selected.allTextContents();
  await lines(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' xj');
  await expect(lines(page).first()).toHaveText('Walk before the first coffee xj');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toContainText('Saved');
  await expect.poll(() => driveFile(page, 'done.md')).toBe('');
  expect(await page.getByTestId('task-row').allTextContents()).toEqual(rowsBefore);
  expect(await counts()).toEqual(countsBefore);
  expect(await selected.allTextContents()).toEqual(selectedBefore);
});

test('paste inserts plain text and Enter never adds a line break', async ({ page }) => {
  await start(page);
  await lines(page).first().click();
  await page.keyboard.press('End');
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const data = new DataTransfer();
    data.setData('text/plain', ' a\nb');
    data.setData('text/html', '<b>bold</b>');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Enter');
  await expect(lines(page).first()).toHaveText('Walk before the first coffee a b');
  await expect(lines(page).first().locator('b, br')).toHaveCount(0);
});

test('a line being edited is committed when the app is hidden', async ({ page }) => {
  await start(page);
  await lines(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' hidden');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => alwaysOnDrive(page), { timeout: 700, intervals: [50] }).toContain('- Walk before the first coffee hidden');
});

test('a remote refresh does not wipe the line being typed', async ({ page }) => {
  await start(page);
  await lines(page).nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' mine');
  await externalWrite(page, 'tasks.md', SPEC_TASKS.replace('# Always\n', '# Always\n- Stretch\n'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(lines(page)).toHaveCount(3);
  await expect(lines(page).nth(2)).toBeFocused();
  await expect(lines(page).nth(2)).toHaveText('One tab at a time mine');
  await page.keyboard.press('Enter');
  await expect(lines(page)).toHaveText(['Stretch', 'Walk before the first coffee', 'One tab at a time mine']);
  await expect.poll(() => alwaysOnDrive(page)).toBe(
    '# Always\n- Stretch\n- Walk before the first coffee\n- One tab at a time mine\n\n',
  );
});

test('a remote delete of the line above keeps the edit and its later typing', async ({ page }) => {
  await start(page);
  await lines(page).nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' mine');
  await externalWrite(page, 'tasks.md', SPEC_TASKS.replace('- Walk before the first coffee\n', ''));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(lines(page)).toHaveCount(1);
  await expect(lines(page).first()).toBeFocused();
  await page.keyboard.type(' more');
  await page.keyboard.press('Enter');
  await expect.poll(() => alwaysOnDrive(page)).toBe('# Always\n- One tab at a time mine more\n\n');
});

test('editing the second of two identical lines leaves the first alone', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': '# Always\n- Same\n- Same\n\n# Tasks\n' } });
  await lines(page).nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await externalWrite(page, 'tasks.md', '# Always\n- Top\n- Same\n- Same\n\n# Tasks\n');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.keyboard.press('Enter');
  await expect.poll(() => alwaysOnDrive(page)).toBe('# Always\n- Top\n- Same\n- Same!\n\n');
});

test('ALWAYS lines are in no bucket count or stat', async ({ page }) => {
  await start(page);
  await page.getByTestId('always-add').click();
  await page.keyboard.type('Extra');
  await page.keyboard.press('Enter');
  await expect(lines(page)).toHaveCount(3);
  const total = ['today', 'week', 'next', 'later', 'someday'];
  let sum = 0;
  for (const k of total) sum += Number(await page.getByTestId(`bucket-count-${k}`).textContent());
  expect(sum).toBe(4);
  await expect(page.getByTestId('stats').first()).toContainText('All 0');
});
