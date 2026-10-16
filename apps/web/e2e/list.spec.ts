import { test, expect } from '@playwright/test';
import { openApp, SPEC_TASKS } from './helpers';

test.skip(({ isMobile }) => isMobile, 'two-pane layout assertions run on the desktop project');

const TASKS = `${SPEC_TASKS}- [ ] Old thing 📅 2026-10-03\n- [ ] Big trip 📅 2026-11-12\n`;
const FAINT = 'rgb(162, 169, 183)';

test.beforeEach(async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
});

test('bucket counts', async ({ page }) => {
  const counts = { today: '2', week: '0', next: '2', later: '1', someday: '1' };
  for (const [k, n] of Object.entries(counts)) {
    await expect(page.getByTestId(`bucket-count-${k}`)).toHaveText(n);
  }
});

test('later and someday are folded on open, and unfold on click', async ({ page }) => {
  await expect(page.getByTestId('bucket-later').getByTestId('task-row')).toHaveCount(0);
  await expect(page.getByTestId('bucket-someday').getByTestId('task-row')).toHaveCount(0);
  await page.getByTestId('bucket-head-someday').click();
  await expect(page.getByTestId('bucket-someday').getByTestId('task-row')).toHaveCount(1);
});

test('rows, meta labels and notes marker', async ({ page }) => {
  const today = page.getByTestId('bucket-today').getByTestId('task-row');
  await expect(today).toHaveCount(2);
  await expect(today.nth(0)).toContainText('Old thing');
  await expect(today.nth(1)).toContainText('Call the dentist');
  const old = today.nth(0).getByTestId('task-meta');
  await expect(old).toHaveText('3 Oct');
  await expect(old).toHaveClass(/over/);
  await expect(today.nth(1)).toContainText('≡');
  const next = page.getByTestId('bucket-next').getByTestId('task-row');
  await expect(next.filter({ hasText: 'Water the plants' }).getByTestId('task-meta')).toHaveText('↻ Mon');
  await page.getByTestId('bucket-head-later').click();
  await expect(page.getByTestId('bucket-later').getByTestId('task-meta')).toHaveText('12 Nov');
});

test('empty copy, always lines, stats, status, legends, hints', async ({ page }) => {
  await expect(page.getByTestId('bucket-week')).toContainText('Nothing else this week.');
  await expect(page.getByTestId('always-line')).toHaveCount(2);
  const stats = page.getByTestId('stats');
  await expect(stats).toContainText('Today 0 (–)');
  await expect(stats).toContainText('7d 0 (–)');
  await expect(stats).toContainText('All 0');
  await expect(page.getByTestId('status')).toHaveText('saved');
  await expect(page.locator('.legend')).toHaveText(['tasks', 'always']);
  await expect(page.getByTestId('hints')).toBeVisible();
});

test('hover reveals faint today / no date on empty meta', async ({ page }) => {
  const dentist = page.getByTestId('task-row').filter({ hasText: 'Call the dentist' });
  const meta = dentist.getByTestId('task-meta');
  await expect(meta).toHaveCSS('color', 'rgba(0, 0, 0, 0)');
  await dentist.hover();
  await expect(meta).toHaveText('today');
  await expect(meta).toHaveCSS('color', FAINT);

  await page.getByTestId('bucket-head-someday').click();
  const someday = page.getByTestId('bucket-someday').getByTestId('task-row');
  await someday.hover();
  await expect(someday.getByTestId('task-meta')).toHaveText('no date');
  await expect(someday.getByTestId('task-meta')).toHaveCSS('color', FAINT);
});

test('reload resets folds to defaults', async ({ page }) => {
  await page.getByTestId('bucket-head-someday').click();
  await page.getByTestId('bucket-head-today').click();
  await expect(page.getByTestId('bucket-today').getByTestId('task-row')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('bucket-today').getByTestId('task-row')).toHaveCount(2);
  await expect(page.getByTestId('bucket-someday').getByTestId('task-row')).toHaveCount(0);
});
