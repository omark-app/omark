import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { driveFile, fitsNotes, LONG_NOTE, openApp, SPEC_TASKS } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'the phone layout and touch gestures run on the iphone project');

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const sheet = (page: Page) => page.getByTestId('sheet');
const option = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });

async function start(page: Page) {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

/**
 * A horizontal touch swipe across `target` by `dx` px, as pointer events from a finger. `thenClick` adds the
 * click a browser may send after the release.
 */
async function swipe(target: Locator, dx: number, { thenClick = false } = {}) {
  await target.evaluate((el, [dx, thenClick]) => {
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const at = (type: string, cx: number) =>
      el.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y }),
      );
    at('pointerdown', x);
    for (let i = 1; i <= 6; i++) at('pointermove', x + (dx * i) / 6);
    at('pointerup', x + dx);
    if (thenClick) (el as HTMLElement).click();
  }, [dx, thenClick] as const);
}

test('stats on top, Important, not urgent at the bottom; no add input, detail or hints', async ({ page }) => {
  await start(page);
  const stats = await page.getByTestId('stats').boundingBox();
  const today = await page.getByTestId('bucket-today').boundingBox();
  const someday = await page.getByTestId('bucket-someday').boundingBox();
  const group = await page.getByTestId('bucket-important').boundingBox();
  expect(stats!.y).toBeGreaterThanOrEqual(16);
  expect(stats!.y + stats!.height).toBeLessThanOrEqual(today!.y);
  expect(group!.y).toBeGreaterThan(someday!.y + someday!.height);
  await expect(page.getByTestId('add-input')).toHaveCount(0);
  await expect(page.getByTestId('detail')).toHaveCount(0);
  await expect(page.getByTestId('hints')).toHaveCount(0);
  // The Important, not urgent pane is set off by a straight rule, not a rounded box edge.
  await expect(page.locator('aside')).toHaveCSS('border-top-left-radius', '0px');
});

test('the + button opens the add sheet; Someday puts the new task in Someday', async ({ page }) => {
  await start(page);
  await page.getByTestId('fab').tap();
  await expect(sheet(page)).toBeVisible();
  for (const name of ['Today', 'This week', 'Next week', 'Someday']) await expect(option(page, name)).toBeVisible();
  await expect(option(page, 'Today')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'Someday')).toHaveAttribute('aria-pressed', 'false');
  await sheet(page).getByLabel('New task').fill('Buy stamps');
  await option(page, 'Someday').tap();
  await expect(option(page, 'Someday')).toHaveAttribute('aria-pressed', 'true');
  await option(page, 'Add').tap();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Added to Someday');
  await expect(page.getByTestId('bucket-count-someday')).toHaveText('2');
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Buy stamps\n');
});

test('a dismissed add sheet keeps its draft until a task is added', async ({ page }) => {
  await start(page);
  await page.getByTestId('fab').tap();
  await sheet(page).getByLabel('New task').fill('Buy stamps');
  await option(page, 'Next week').tap();
  await page.waitForTimeout(450); // past the backdrop guard
  await page.touchscreen.tap(20, 20);
  await expect(sheet(page)).toHaveCount(0);
  await page.getByTestId('fab').tap();
  await expect(sheet(page).getByLabel('New task')).toHaveValue('Buy stamps');
  await expect(option(page, 'Next week')).toHaveAttribute('aria-pressed', 'true');
  await option(page, 'Add').tap();
  await expect(page.getByTestId('toast')).toContainText('Added to Next week');
  await page.getByTestId('fab').tap();
  await expect(sheet(page).getByLabel('New task')).toHaveValue('');
  await expect(option(page, 'Today')).toHaveAttribute('aria-pressed', 'true');
});

test('the + button never covers the end of the list', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const fab = await page.getByTestId('fab').boundingBox();
  const last = await page.getByTestId('bucket-important').getByTestId('task-row').last().boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(fab!.y);
});

test('the round check completes a task without opening the edit sheet', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').getByTestId('task-check').tap();
  await expect(page.getByTestId('toast')).toContainText('Done · Send the invoice');
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await expect(sheet(page)).toHaveCount(0);
});

// Issue #8: a title saved with 🔁 text is a repeating task in the file, so it must repeat on this phone too.
test('a task added with 🔁 text in its title repeats, and the round check reschedules it', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS }, now: '2026-10-18T09:00:00' });
  await page.getByTestId('fab').tap();
  await sheet(page).getByLabel('New task').fill('leki 🔁 every 2 days');
  await option(page, 'Add').tap();
  const leki = row(page, 'leki');
  await expect(leki.locator('.title')).toHaveText('leki');
  await expect(leki.getByTestId('task-meta')).toContainText('↻');
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] leki 🔁 every 2 days 📅 2026-10-18\n');
  await leki.getByTestId('task-check').tap();
  await expect(page.getByTestId('toast')).toContainText('Done · next Tue 20 Oct');
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] leki 🔁 every 2 days 📅 2026-10-20\n');
  expect(await driveFile(page, 'done.md')).toBe('- [x] leki 🔁 every 2 days ✅ 2026-10-18\n');
});

test('a title edited to hold 🔁 text repeats, and the round check reschedules it', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS }, now: '2026-10-18T09:00:00' });
  await row(page, 'Send the invoice').tap();
  await sheet(page).getByLabel('Task title').fill('depresja 🔁 every week on Sunday');
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] depresja 🔁 every week on Sunday 📅 2026-10-19\n');
  const task = row(page, 'depresja');
  await expect(task.locator('.title')).toHaveText('depresja');
  await task.getByTestId('task-check').tap();
  await expect(page.getByTestId('toast')).toContainText('Done · next Sun 25 Oct');
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] depresja 🔁 every week on Sunday 📅 2026-10-25\n');
});

test('repeating tasks written by the Todoist import reschedule when completed on the phone', async ({ page }) => {
  // The bytes tools/todoist-import writes for `every 2 days` and `every sunday`.
  const tasks = '# Tasks\n- [ ] leki 🔁 every 2 days 📅 2026-10-18\n' +
    '- [ ] depresja – check in 🔁 every week on Sunday 📅 2026-10-18\n    - one line a day\n';
  await openApp(page, { files: { 'tasks.md': tasks }, now: '2026-10-18T09:00:00' });
  await row(page, 'leki').getByTestId('task-check').tap();
  await expect(page.getByTestId('toast')).toContainText('Done · next Tue 20 Oct');
  await swipe(row(page, 'depresja'), 120);
  await expect(page.getByTestId('toast')).toContainText('Done · next Sun 25 Oct');
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe(
    '# Tasks\n- [ ] leki 🔁 every 2 days 📅 2026-10-20\n' +
      '- [ ] depresja – check in 🔁 every week on Sunday 📅 2026-10-25\n    - one line a day\n',
  );
});

test('the move and edit sheets open with no option picked and no field focused', async ({ page }) => {
  await start(page);
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName);
  await swipe(row(page, 'Send the invoice'), -120);
  await expect(sheet(page)).toBeVisible();
  await expect.poll(focused).toBe('dialog');
  await page.keyboard.press('Escape');
  await row(page, 'Send the invoice').tap();
  await expect(sheet(page).getByLabel('Task title')).toBeVisible();
  await expect.poll(focused).toBe('dialog');
});

test('tapping a row opens the edit sheet; Save keeps the new notes and shows ≡', async ({ page }) => {
  await start(page);
  const invoice = row(page, 'Send the invoice');
  await expect(invoice.locator('.ni')).toHaveCount(0);
  await invoice.tap();
  await expect(sheet(page).getByLabel('Task title')).toHaveValue('Send the invoice');
  await expect(sheet(page)).toContainText('Mon 19 Oct');
  for (const name of ['Today', 'This week', 'Next week', 'Pick a date…', 'Someday', 'Repeat…', 'Delete', 'Save']) {
    await expect(sheet(page).getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  }
  await sheet(page).getByLabel('Notes').fill('net 30');
  await option(page, 'Save').tap();
  await expect(sheet(page)).toHaveCount(0);
  await expect(invoice).toContainText('≡');
  await expect(page.getByTestId('toast')).toContainText('Saved');
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Send the invoice 📅 2026-10-19\n    - net 30\n');
  await expect(page.locator('.task.sel')).toHaveCount(0);
});

test('long notes grow the edit sheet instead of scrolling inside the notes box', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').tap();
  const notes = sheet(page).getByLabel('Notes');
  await notes.fill(`${LONG_NOTE}\n${LONG_NOTE}\n${LONG_NOTE}`);
  expect(await fitsNotes(notes)).toBe(true);
});

test('text typed in the edit sheet is saved when the page is hidden', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').tap();
  await sheet(page).getByLabel('Task title').fill('Send the final invoice');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Send the final invoice 📅 2026-10-19');
  await expect(sheet(page)).toBeVisible();
});

test('closing the edit sheet without Save still keeps the typed text, with Undo', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').tap();
  await sheet(page).getByLabel('Task title').fill('Send the final invoice');
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(row(page, 'Send the final invoice')).toHaveCount(1);
  await page.getByTestId('toast-undo').tap();
  await expect(row(page, 'Send the invoice')).toHaveCount(1);
});

test('the edit sheet moves the task, keeping typed text', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').tap();
  await sheet(page).getByLabel('Task title').fill('Send the final invoice');
  await sheet(page).getByRole('button', { name: /^Today/ }).tap();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('bucket-today').getByTestId('task-row').filter({ hasText: 'Send the final invoice' })).toHaveCount(1);
});

test('Delete in the edit sheet saves the typed text first, so Undo brings it back', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').tap();
  await sheet(page).getByLabel('Task title').fill('Send the final invoice');
  await option(page, 'Delete').tap();
  await expect(page.getByTestId('toast')).toContainText('Deleted · Send the final invoice');
  await page.getByTestId('toast-undo').tap();
  await expect(row(page, 'Send the final invoice')).toHaveCount(1);
});

test('tapping task-meta opens the date picker directly, with the date field not focused', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').getByTestId('task-meta').tap();
  await expect(sheet(page).getByLabel('Due date')).toBeVisible();
  // A focused date field would open the iOS date wheel over the chips.
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName);
  await expect.poll(focused).toBe('dialog');
  await expect(sheet(page).getByLabel('Task title')).toHaveCount(0);
  await expect(page.getByTestId('sheet')).toHaveCount(1);
});

test('swiping a row right completes it', async ({ page }) => {
  await start(page);
  await swipe(row(page, 'Send the invoice'), 120);
  await expect(page.getByTestId('toast')).toContainText('Done · Send the invoice');
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await expect.poll(() => driveFile(page, 'done.md')).toContain('Send the invoice');
});

test('a short swipe springs back and changes nothing, and its click is not a tap', async ({ page }) => {
  await start(page);
  await swipe(row(page, 'Send the invoice'), 50, { thenClick: true });
  await swipe(row(page, 'Send the invoice'), -50, { thenClick: true });
  await expect(row(page, 'Send the invoice')).toHaveCount(1);
  await expect(row(page, 'Send the invoice')).toHaveCSS('transform', 'none');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('a second finger does not cancel the swipe in progress', async ({ page }) => {
  await start(page);
  await row(page, 'Send the invoice').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const at = (type: string, cx: number, pointerId = 7, isPrimary = true) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary, clientX: cx, clientY: y }));
    at('pointerdown', x);
    at('pointermove', x - 60);
    at('pointerdown', x + 20, 8, false);
    at('pointermove', x - 120);
    at('pointerup', x - 120);
  });
  await expect(sheet(page)).toContainText('Move to…');
});

test('swiping a row left opens the move sheet', async ({ page }) => {
  await start(page);
  await swipe(row(page, 'Send the invoice'), -120);
  await expect(sheet(page)).toContainText('Send the invoice');
  for (const name of ['Today', 'This week', 'Next week', 'Pick a date…', 'Someday', 'Repeat…', 'Delete']) {
    await expect(sheet(page).getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  }
  await expect(sheet(page).getByRole('button', { name: /^Next week ✓/ })).toBeVisible();
  await sheet(page).getByRole('button', { name: /^Someday/ }).tap();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Moved to Someday');
  await expect(page.getByTestId('bucket-count-someday')).toHaveText('2');
});

test('the move sheet opens the date and repeat pickers, and deletes', async ({ page }) => {
  await start(page);
  await swipe(row(page, 'Send the invoice'), -120);
  await sheet(page).getByRole('button', { name: /^Pick a date…/ }).tap();
  await expect(sheet(page).getByLabel('Due date')).toHaveValue('2026-10-19');
  await page.keyboard.press('Escape');

  await swipe(row(page, 'Send the invoice'), -120);
  await sheet(page).getByRole('button', { name: /^Repeat…/ }).tap();
  await expect(sheet(page).getByLabel('No repeat')).toBeChecked();
  await page.keyboard.press('Escape');

  await swipe(row(page, 'Send the invoice'), -120);
  await option(page, 'Delete').tap();
  await expect(sheet(page)).toHaveCount(0);
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Deleted · Send the invoice');
});

test('task rows disable the iOS long-press callout', async ({ page }) => {
  await start(page);
  const callout = await row(page, 'Send the invoice').evaluate(async (el) => {
    if (CSS.supports('-webkit-touch-callout', 'none')) return getComputedStyle(el).getPropertyValue('-webkit-touch-callout');
    // Desktop WebKit drops this iOS-only property when parsing, so look for it in the shipped CSS instead:
    // a rule that matches the row and sets it.
    for (const sheet of document.styleSheets) {
      const css = sheet.href ? await (await fetch(sheet.href)).text() : (sheet.ownerNode?.textContent ?? '');
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const matches = selector!.split(',').some((s) => {
          try {
            return el.matches(s.trim());
          } catch {
            return false;
          }
        });
        if (matches && /-webkit-touch-callout:\s*none/.test(body!)) return 'none';
      }
    }
    return '';
  });
  expect(callout).toBe('none');
});

/** The font size, in px, of each field in the open sheet that brings up the keyboard. */
async function fieldFontSizes(page: Page): Promise<Record<string, number>> {
  return sheet(page).evaluate((el) => {
    const out: Record<string, number> = {};
    for (const f of el.querySelectorAll<HTMLElement>('input:not([type=radio]):not([type=checkbox]), textarea, select')) {
      out[f.getAttribute('aria-label') ?? f.tagName] = parseFloat(getComputedStyle(f).fontSize);
    }
    return out;
  });
}

// iOS Safari zooms the page in when a field under 16px takes focus, and doesn't zoom back out.
test('every field in the phone sheets is at least 16px, so iOS does not zoom in', async ({ page }) => {
  await start(page);
  const sizes: Record<string, number> = {};
  await page.getByTestId('fab').tap();
  Object.assign(sizes, await fieldFontSizes(page));
  await page.keyboard.press('Escape');

  await row(page, 'Send the invoice').tap();
  Object.assign(sizes, await fieldFontSizes(page));
  await page.keyboard.press('Escape');

  await swipe(row(page, 'Send the invoice'), -120);
  await sheet(page).getByRole('button', { name: /^Pick a date…/ }).tap();
  Object.assign(sizes, await fieldFontSizes(page));
  await page.keyboard.press('Escape');

  await swipe(row(page, 'Send the invoice'), -120);
  await sheet(page).getByRole('button', { name: /^Repeat…/ }).tap();
  Object.assign(sizes, await fieldFontSizes(page));

  expect(Object.keys(sizes)).toEqual(expect.arrayContaining(['New task', 'Task title', 'Notes', 'Due date', 'Week interval', 'Interval unit']));
  for (const [name, px] of Object.entries(sizes)) expect(px, name).toBeGreaterThanOrEqual(16);
});

test('the search box is at least 16px, so iOS does not zoom in', async ({ page }) => {
  await start(page);
  const px = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.getByTestId('search-open').tap();
  expect(await px(page.getByTestId('search-input'))).toBeGreaterThanOrEqual(16);
});

test('rows in Important, not urgent take swipes too: right completes, left opens the move sheet (#38)', async ({ page }) => {
  await start(page);
  await row(page, 'One tab at a time').scrollIntoViewIfNeeded();
  await swipe(row(page, 'One tab at a time'), 120);
  await expect(page.getByTestId('toast')).toContainText('Done · One tab at a time');
  await swipe(row(page, 'Walk before the first coffee'), -120);
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole('button', { name: /^Someday/ }).tap();
  await expect(page.getByTestId('toast')).toContainText('Moved to Someday');
  await expect(page.getByTestId('bucket-count-important')).toHaveText('0');
});
