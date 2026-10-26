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

/** The Habits group and History (#44). */

const habit = (title: string, date: string, rule = RULE) => `- [ ] ${title} ${rule} 📅 ${date}\n`;
const group = (page: Page) => page.getByTestId('habits-group');
const history = (page: Page) => page.getByTestId('habit-history');

test('the Habits group lists habits with their state line', async ({ page, isMobile }) => {
  await openApp(page, {
    files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}${habit('Read', '2026-10-17')}`, 'done.md': ticks('Meditate', '13', '14') + ticks('Read', '15', '16') },
  });
  await expect(group(page).getByTestId('habits-count')).toHaveText('2 of 3');
  if (isMobile) {
    const card = group(page).getByTestId('habit-card').filter({ hasText: 'Meditate' });
    await expect(card).toContainText('2/66 · last chance');
    await expect(group(page).getByTestId('habit-card').filter({ hasText: 'Read' })).toContainText('2/66 · done ✓');
    await card.click();
    await expect(page.getByTestId('sheet')).toBeVisible();
    return;
  }
  const item = group(page).getByTestId('habit-item').filter({ hasText: 'Meditate' });
  await expect(item).toContainText('2/66');
  await expect(item.getByTestId('habit-state')).toHaveText('missed yesterday · one more miss restarts · misses 1/6');
  await expect(group(page).getByTestId('habit-item').filter({ hasText: 'Read' }).getByTestId('habit-state')).toHaveText(
    /^done today · misses 0\/6 · formed ~ \d+ \w+$/,
  );
  await item.click();
  await expect(row(page, 'Meditate').first()).toHaveClass(/sel/);
});

test('over the limit the header shows 4 of 3 in red', async ({ page }) => {
  const tasks = ['A', 'B', 'C', 'D'].map((t) => habit(`Habit ${t}`, '2026-10-16')).join('');
  await openApp(page, { files: { 'tasks.md': `# Tasks\n${tasks}` } });
  const count = group(page).getByTestId('habits-count');
  await expect(count).toHaveText('4 of 3');
  await expect(count).toHaveClass(/over/);
});

test('the group is hidden with no habits and no history', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': '# Tasks\n- [ ] Plain task 📅 2026-10-16\n' } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await expect(group(page)).toHaveCount(0);
});

test('History lists formed and dropped habits', async ({ page, isMobile }) => {
  const done =
    ticks('Read', '14', '15') + '- [x] Read 🌱 🏆 2026-10-15\n' +
    ticks('Cold shower', '08', '09') + '- [-] Cold shower 🌱 ❌ 2026-10-10\n';
  await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}`, 'done.md': done } });
  const link = group(page).getByTestId('habits-history');
  await expect(link).toHaveText(isMobile ? 'History ›' : '1 formed · 1 dropped ›');
  await link.click();
  await expect(history(page)).toBeVisible();
  await expect(history(page)).toContainText('In progress 1 of 3');
  await expect(history(page)).toContainText('Formed 1');
  await expect(history(page)).toContainText('Dropped 1');
  await expect(history(page)).toContainText('Read');
  await expect(history(page)).toContainText('2 times · 14 Oct → 15 Oct (2 days) · 1 attempt');
  await expect(history(page)).toContainText('Cold shower');
  await expect(history(page)).toContainText('best 2 · 1 attempt · dropped 10 Oct');
  await expect(history(page)).toContainText('Formed and dropped habits live in done.md.');
  await page.keyboard.press('Escape');
  await expect(history(page)).toHaveCount(0);
});

test.describe('desktop board', () => {
  test.skip(({ isMobile }) => isMobile, 'the board is a desktop view');

  test('the board rail shows the group', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}` } });
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('rail').getByTestId('habits-group')).toContainText('Meditate');
  });
});

test.describe('phone cards', () => {
  test.skip(({ isMobile }) => !isMobile, 'the cards are the phone layout');

  test('phone shows habit cards under the stats line', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}` } });
    const cards = group(page).getByTestId('habit-cards');
    await expect(cards).toBeVisible();
    await expect(cards.getByTestId('habit-card')).toContainText('0/66');
    const stats = await page.getByTestId('stats').boundingBox();
    const box = await cards.boundingBox();
    expect(box!.y).toBeGreaterThan(stats!.y);
    await expect(page.getByTestId('habit-item')).toHaveCount(0);
  });
});
