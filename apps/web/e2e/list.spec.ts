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
  const counts = { today: '2', tomorrow: '0', week: '0', next: '2', later: '1', someday: '1' };
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

test('the buckets are Today, Tomorrow, This week, Next week, Later, Someday; no Overdue (#26)', async ({ page }) => {
  // The date buckets in the tasks pane; Important, not urgent is in the side pane (#38).
  const heads = page.locator('.tasks [data-testid^="bucket-head-"]');
  await expect(heads).toHaveCount(6);
  const keys = ['today', 'tomorrow', 'week', 'next', 'later', 'someday'];
  for (const [i, k] of keys.entries()) await expect(heads.nth(i)).toHaveAttribute('data-testid', `bucket-head-${k}`);
  await expect(page.getByTestId('bucket-overdue')).toHaveCount(0);
  await expect(page.getByTestId('bucket-tomorrow')).toContainText('Sat');
});

test('rows, meta labels and notes marker; Today holds the overdue task above today’s', async ({ page }) => {
  const today = page.getByTestId('bucket-today').getByTestId('task-row');
  await expect(today).toHaveCount(2);
  await expect(today.nth(0)).toContainText('Old thing');
  const old = today.nth(0).getByTestId('task-meta');
  await expect(old).toHaveText('3 Oct');
  await expect(old).toHaveClass(/over/);
  await expect(today.nth(1)).toContainText('Call the dentist');
  await expect(today.nth(1)).toContainText('≡');
  const next = page.getByTestId('bucket-next').getByTestId('task-row');
  await expect(next.filter({ hasText: 'Water the plants' }).getByTestId('task-meta')).toHaveText('↻ Mon');
  await page.getByTestId('bucket-head-later').click();
  await expect(page.getByTestId('bucket-later').getByTestId('task-meta')).toHaveText('12 Nov');
});

test('an empty bucket shows its header folded, until the user unfolds it', async ({ page }) => {
  const head = page.getByTestId('bucket-head-week');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('bucket-count-week')).toHaveText('0');
  await expect(page.getByTestId('bucket-week')).not.toContainText('Nothing else this week.');
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('bucket-week')).toContainText('Nothing else this week.');
});

test('Important, not urgent, stats, status, legends, hints', async ({ page }) => {
  await expect(page.getByTestId('bucket-important').getByTestId('task-row')).toHaveText([/Walk before the first coffee/, /One tab at a time/]);
  await expect(page.getByTestId('bucket-count-important')).toHaveText('2');
  const stats = page.getByTestId('stats');
  await expect(stats).toContainText('Today 0 (–)');
  await expect(stats).toContainText('7d 0 (–)');
  await expect(stats).toContainText('All 0');
  await expect(page.getByTestId('status')).toHaveText('saved');
  await expect(page.locator('.legend')).toHaveText(['tasks', 'not urgent']);
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
