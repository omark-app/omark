import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, openApp } from './helpers';

/** Habit rows (#44): violet rows with a count, the tags, and one tick per period. Today is Fri 2026-10-16. */

const RULE = '🌱 🔁 every day';
const line = (title: string, date: string) => `# Tasks\n- [ ] ${title} ${RULE} 📅 ${date}\n`;
const ticks = (title: string, ...days: string[]) => days.map((d) => `- [x] ${title} ${RULE} ✅ 2026-10-${d}\n`).join('');

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const rowsOf = (page: Page, bucket: string) => page.getByTestId(`bucket-${bucket}`).getByTestId('task-row');

test('add a habit, tick it, see 1/66', async ({ page, isMobile }) => {
  // The phone's add sheet gets its habit toggle later; there the habit comes from the file.
  await openApp(page, { files: { 'tasks.md': isMobile ? line('Meditate 10 min', '2026-10-16') : '# Tasks\n' } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  if (!isMobile) {
    await page.getByTestId('add-input').click();
    await page.keyboard.type('Meditate 10 min hab');
    await page.keyboard.press('Enter');
  }
  const habit = rowsOf(page, 'today').filter({ hasText: 'Meditate 10 min' });
  await expect(habit).toHaveAttribute('data-habit', 'true');
  await expect(habit.getByTestId('habit-count')).toHaveText('0/66');
  await expect(habit).not.toContainText('↻');
  await expect(habit.getByTestId('habit-tag')).toHaveCount(0);

  await habit.getByTestId('task-check').click();
  const next = rowsOf(page, 'tomorrow').filter({ hasText: 'Meditate 10 min' });
  await expect(next.getByTestId('habit-count')).toHaveText('1/66');
  await expect(next).toContainText('Sat');
  await expect.poll(() => driveFile(page, 'done.md')).toBe('- [x] Meditate 10 min 🌱 🔁 every day ✅ 2026-10-16\n');
});

test('a seeded history with a miss shows last chance', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '13', '14') } });
  const habit = row(page, 'Meditate');
  await expect(habit.getByTestId('habit-count')).toHaveText('2/66');
  await expect(habit.getByTestId('habit-tag')).toHaveText('last chance');
  await expect(habit).not.toHaveClass(/over/);
});

test('two misses in a row show restarted · best 2', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '11', '12') } });
  const habit = row(page, 'Meditate');
  await expect(habit.getByTestId('habit-count')).toHaveText('0/66');
  await expect(habit.getByTestId('habit-tag')).toHaveText('restarted · best 2');
});

test('ticking twice says Already done today and writes once', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16') } });
  await row(page, 'Meditate').getByTestId('task-check').click();
  await expect(rowsOf(page, 'tomorrow').filter({ hasText: 'Meditate' })).toHaveCount(1);
  await rowsOf(page, 'tomorrow').filter({ hasText: 'Meditate' }).getByTestId('task-check').click();
  await expect(page.getByTestId('toast')).toContainText('Already done today');
  await expect.poll(() => driveFile(page, 'done.md')).toBe(ticks('Meditate', '16'));
});
