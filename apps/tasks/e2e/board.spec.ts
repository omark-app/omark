import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, fitsNotes, LONG_NOTE, openApp } from './helpers';
import { poll } from './poll';

const TASKS = `# Tasks
- [ ] Walk before the first coffee ⏫
- [ ] Call the dentist 📅 2026-10-16
- [ ] Send the invoice 📅 2026-10-17
- [ ] Plan the trip 📅 2026-10-21
- [ ] Book the venue 📅 2026-12-01
- [ ] Learn Polish sign language
`;

/**
 * The board of Sun 18 Oct: Today with one overdue task and five due today, four tomorrow, This week over,
 * two next week, Later and Someday folded. Packed, Tomorrow gets a column to itself and the weeks stack;
 * with Tomorrow done it is the default.
 */
const BUSY = `# Tasks
- [ ] Renew the passport 📅 2026-10-14
${[1, 2, 3, 4, 5].map((n) => `- [ ] Errand ${n} 📅 2026-10-18`).join('\n')}
${[1, 2, 3, 4].map((n) => `- [ ] Call ${n} 📅 2026-10-19`).join('\n')}
- [ ] Plan the trip 📅 2026-10-21
- [ ] Book the venue 📅 2026-10-22
- [ ] Repaint the fence 📅 2026-12-01
- [ ] Learn Polish sign language
`;

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
/** The bucket keys in each board column, left to right. */
const columns = (page: Page) =>
  page.getByTestId('board-col').evaluateAll((cols) =>
    cols.map((c) => [...c.querySelectorAll<HTMLElement>('[data-bucket]')].map((b) => b.dataset.bucket)),
  );
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
    await expect(page.getByTestId('rail')).toContainText('omark tasks · Fri 16 Oct');
    await expect(page.getByTestId('stats')).toBeVisible();
    await expect(page.getByTestId('rail').getByTestId('bucket-important').getByTestId('task-row')).toHaveText([/Walk before the first coffee/]);
    await expect(page.getByTestId('hints')).toBeVisible();
    await expect(page.getByTestId('status')).toBeVisible();
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toHaveCount(0);
  });

  test('narrowing the window below 720 px shows the list, and widening it brings the board back', async ({ page }) => {
    await start(page, { 'config.yaml': 'defaultView: board\n' });
    await expect(page.getByTestId('board')).toBeVisible();
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(page.getByTestId('board')).toHaveCount(0);
    await expect(page.getByTestId('bucket-today')).toBeVisible();
    await expect(page.getByTestId('fab')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('fab')).toHaveCount(0);
  });

  test('four columns in the default layout, the dated buckets open and Later and Someday folded', async ({ page }) => {
    await start(page, { 'config.yaml': 'foldedOnOpen: [today, later, someday]\n' });
    await page.keyboard.press('v');
    const cols = page.getByTestId('board-col');
    await expect(cols).toHaveCount(4);
    await expect(cols.nth(0).getByTestId('bucket-today')).toBeVisible();
    await expect(cols.nth(1).getByTestId('bucket-tomorrow')).toBeVisible();
    await expect(cols.nth(1).getByTestId('bucket-week')).toBeVisible();
    await expect(cols.nth(2).getByTestId('bucket-next')).toBeVisible();
    await expect(cols.nth(3).getByTestId('bucket-later')).toBeVisible();
    await expect(cols.nth(3).getByTestId('bucket-someday')).toBeVisible();
    await expect(page.getByTestId('bucket-overdue')).toHaveCount(0);
    for (const key of ['today', 'tomorrow', 'next']) {
      await expect(page.getByTestId(`bucket-head-${key}`)).toHaveAttribute('aria-expanded', 'true');
    }
    // This week is empty (only Sunday is left after tomorrow), so it starts folded.
    for (const key of ['week', 'later', 'someday']) {
      await expect(page.getByTestId(`bucket-head-${key}`)).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(row(page, 'Book the venue')).toHaveCount(0);
    await page.getByTestId('bucket-head-later').click();
    await expect(row(page, 'Book the venue')).toBeVisible();
    await page.getByTestId('bucket-head-today').click();
    await expect(row(page, 'Call the dentist')).toHaveCount(0);
  });

  test('an empty bucket shows only its header, folded', async ({ page }) => {
    await start(page, { 'config.yaml': 'defaultView: board\n' });
    await row(page, 'Send the invoice').getByTestId('task-check').click();
    await expect(page.getByTestId('bucket-head-tomorrow')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('bucket-count-tomorrow')).toHaveText('0');
    await expect(page.getByTestId('bucket-tomorrow')).not.toContainText('Nothing due tomorrow.');
  });

  test('the board packs its columns when it opens and keeps them while you work', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': BUSY, 'config.yaml': 'defaultView: board\n' }, now: '2026-10-18T09:00:00' });
    await expect(page.getByTestId('board')).toBeVisible();
    const packed = [['today'], ['tomorrow'], ['week', 'next'], ['later', 'someday']];
    expect(await columns(page)).toEqual(packed);
    // Today holds the overdue task above today's (#26).
    await expect(page.getByTestId('bucket-today').getByTestId('task-row').first()).toContainText('Renew the passport');

    // Completing Tomorrow's tasks (and others) leaves every bucket in its column.
    await row(page, 'Renew the passport').getByTestId('task-check').click();
    for (const n of [1, 2, 3, 4]) await row(page, `Call ${n}`).getByTestId('task-check').click();
    await page.getByTestId('bucket-head-someday').click();
    await expect(page.getByTestId('bucket-count-tomorrow')).toHaveText('0');
    expect(await columns(page)).toEqual(packed);

    // A reload opens on the saved files and packs again: Tomorrow is empty, the default layout.
    await poll(() => driveFile(page, 'tasks.md')).not.toContain('Call 4');
    const saved = await driveFile(page, 'tasks.md');
    await page.evaluate((t) => sessionStorage.setItem('e2e-tasks', t), saved);
    await page.addInitScript(() => {
      const t = sessionStorage.getItem('e2e-tasks');
      if (t) (window as unknown as { __TASKAPP_SEED__: unknown }).__TASKAPP_SEED__ = { 'tasks.md': t, 'config.yaml': 'defaultView: board\n' };
    });
    await page.reload();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(row(page, 'Errand 2')).toBeVisible();
    expect(await columns(page)).toEqual([['today'], ['tomorrow', 'week'], ['next'], ['later', 'someday']]);
  });

  test('a task dragged onto Tomorrow is dated tomorrow', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': BUSY, 'config.yaml': 'defaultView: board\n' }, now: '2026-10-18T09:00:00' });
    await row(page, 'Plan the trip').dragTo(page.getByTestId('bucket-head-tomorrow'));
    await expect(page.getByTestId('bucket-tomorrow').getByTestId('task-row').filter({ hasText: 'Plan the trip' })).toHaveCount(1);
    await expect(page.getByTestId('bucket-count-tomorrow')).toHaveText('5');
    await poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Plan the trip 📅 2026-10-19');
  });

  test('selecting a task replaces Important, not urgent with the detail; Esc brings it back (#38)', async ({ page }) => {
    await start(page);
    await page.keyboard.press('v');
    await expect(page.getByTestId('detail')).toHaveCount(0);
    await row(page, 'Call the dentist').click();
    await expect(page.getByTestId('detail')).toBeVisible();
    await expect(page.getByTestId('rail').getByTestId('detail-title')).toHaveValue('Call the dentist');
    const group = page.getByTestId('rail').getByTestId('bucket-important');
    await expect(group).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('detail')).toHaveCount(0);
    await expect(group.getByTestId('task-row')).toHaveCount(1);
  });

  test('long notes grow the detail; the page scrolls to reach the hints, not the rail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    const note = `\n    - ${LONG_NOTE}`;
    await start(page, { 'tasks.md': TASKS.replace('📅 2026-10-16', `📅 2026-10-16${note}${note}${note}`) });
    await page.keyboard.press('v');
    await row(page, 'Call the dentist').click();
    const notes = page.getByTestId('rail').getByTestId('detail-notes');
    await expect(notes).toBeVisible();
    expect(await fitsNotes(notes)).toBe(true);
    expect(await page.getByTestId('rail').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByTestId('hints')).toBeInViewport();
  });

  test('on a board taller than the window the rail stays in view while a low row is selected and edited', async ({ page }) => {
    const errands = Array.from({ length: 40 }, (_, n) => `- [ ] Errand ${n + 1} 📅 2026-10-16`).join('\n');
    await start(page, { 'tasks.md': `# Tasks\n${errands}\n`, 'config.yaml': 'defaultView: board\n' });
    await row(page, 'Errand 40').scrollIntoViewIfNeeded();
    await row(page, 'Errand 40').click();
    await expect(page.getByTestId('detail-title')).toHaveValue('Errand 40');
    await expect(page.getByTestId('detail')).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('detail-title')).toBeFocused();
    await expect(page.getByTestId('detail-title')).toBeInViewport();
    await expect(row(page, 'Errand 40')).toBeInViewport();
  });

  test('the rail fits its width with a task open, so it never scrolls sideways', async ({ page }) => {
    await start(page, { 'tasks.md': TASKS.replace('📅 2026-10-16', `📅 2026-10-16\n    - ${LONG_NOTE}`) });
    await page.keyboard.press('v');
    await row(page, 'Call the dentist').click();
    await expect(page.getByTestId('detail')).toBeVisible();
    for (const id of ['rail', 'detail', 'hints', 'status']) {
      const fits = await page.getByTestId(id).evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(fits, `${id} is wider than the rail`).toBe(true);
    }
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
