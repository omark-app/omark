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

  test('the rail has no empty block without habits', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': '# Tasks\n- [ ] Plain task 📅 2026-10-16\n' } });
    await page.keyboard.press('v');
    await expect(page.getByTestId('board')).toBeVisible();
    const blocks = page.getByTestId('rail').locator('.rblock');
    await expect(blocks).toHaveCount(1);
    await expect(blocks.first()).toContainText('Important');
  });

  test('the rail group is a single box', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}` } });
    await page.keyboard.press('v');
    await expect(page.getByTestId('rail').locator('.rblock')).toHaveCount(1);
  });

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

/** The habit block in the detail (desktop) and the edit sheet (phone) (#44). */

const block = (page: Page) => page.getByTestId('habit-block');
const doneOn = (title: string, dates: string[]) => dates.map((d) => `- [x] ${title} ${RULE} ✅ ${d}\n`).join('');
/** Every date from `from` to `to`, both included. */
const days = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

/** Opens the task: the detail on desktop, the edit sheet on the phone. */
async function openTask(page: Page, isMobile: boolean, title: string) {
  if (isMobile) await row(page, title).first().tap();
  else await row(page, title).first().click();
  await expect(block(page)).toBeVisible();
}

test('the detail shows 12 of 66, the warning and 28 squares', async ({ page, isMobile }) => {
  // The mockup's pattern: attempt 1 counts 9, two misses restart it, then attempt 2 counts 12 with a miss
  // on 7 Oct and yesterday.
  const done = doneOn('Meditate', [...days('2026-09-15', '2026-09-23'), ...days('2026-10-02', '2026-10-06'), ...days('2026-10-08', '2026-10-14')]);
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': done } });
  await openTask(page, isMobile, 'Meditate');
  await expect(block(page)).toContainText('12 of 66');
  await expect(block(page)).toContainText('formed ~ 8 Dec if no misses');
  await expect(block(page).getByTestId('habit-warning')).toHaveText('Missed yesterday. Miss today and the count restarts at 0.');
  const squares = block(page).getByTestId('habit-period');
  await expect(squares).toHaveCount(28);
  await expect(squares.first()).toHaveAttribute('data-mark', 'done');
  await expect(squares.nth(6)).toHaveAttribute('data-mark', 'restart');
  await expect(squares.nth(7)).toHaveAttribute('data-mark', 'idle');
  await expect(squares.nth(7)).toHaveAttribute('title', 'no attempt running');
  await expect(squares.last()).toHaveAttribute('data-mark', 'today');
  await expect(block(page)).toContainText('Misses in a row1 of 1 allowed');
  await expect(block(page)).toContainText('Misses this attempt2 of 6 allowed');
  await expect(block(page)).toContainText('Attempt2 · best 9 (attempt 1)');
  await expect(block(page)).toContainText('Counting since2 Oct');
  await expect(block(page).getByTestId('habit-goal')).toHaveText('66 (default)');
});

test('a restarted habit says when the next attempt starts', async ({ page, isMobile }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '11', '12') } });
  await openTask(page, isMobile, 'Meditate');
  await expect(block(page).getByTestId('habit-warning')).toHaveText('Restarted · best 2. The next tick starts attempt 2.');
});

test('Drop habit writes the dropped line and History lists it', async ({ page, isMobile }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '14', '15') } });
  await openTask(page, isMobile, 'Meditate');
  await block(page).getByRole('button', { name: 'Drop habit' }).click();
  await expect(page.getByTestId('toast')).toContainText('Dropped habit · Meditate');
  await expect(row(page, 'Meditate')).toHaveCount(0);
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe('# Tasks\n');
  await expect.poll(() => driveFile(page, 'done.md')).toBe(`${ticks('Meditate', '14', '15')}- [-] Meditate 🌱 ❌ 2026-10-16\n`);
  await group(page).getByTestId('habits-history').click();
  await expect(history(page)).toContainText('Dropped 1');
  await expect(history(page)).toContainText('best 2 · 1 attempt · dropped 16 Oct');
});

test('Not a habit removes only 🌱', async ({ page, isMobile }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '15') } });
  await openTask(page, isMobile, 'Meditate');
  await block(page).getByRole('button', { name: /^Not a habit/ }).click();
  await expect(page.getByTestId('toast')).toContainText('No longer a habit');
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe('# Tasks\n- [ ] Meditate 🔁 every day 📅 2026-10-16\n');
  await expect(block(page)).toHaveCount(0);
  await expect(row(page, 'Meditate')).toHaveAttribute('data-habit', 'false');
});

test('Goal 30 writes 🌱 30', async ({ page, isMobile }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16') } });
  await openTask(page, isMobile, 'Meditate');
  await block(page).getByTestId('habit-goal').click();
  const field = block(page).getByLabel('Goal');
  await expect(field).toBeFocused();
  await field.fill('30');
  await field.press('Enter');
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe('# Tasks\n- [ ] Meditate 🌱 30 🔁 every day 📅 2026-10-16\n');
  await expect(block(page).getByTestId('habit-goal')).toHaveText('30');
  await expect(block(page)).toContainText('0 of 30');
  // Empty goes back to the configured goal.
  await block(page).getByTestId('habit-goal').click();
  await block(page).getByLabel('Goal').fill('');
  await block(page).getByLabel('Goal').press('Enter');
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe(line('Meditate', '2026-10-16'));
  await expect(block(page).getByTestId('habit-goal')).toHaveText('66 (default)');
});

test('goal 3 forms on the third tick, Keep as task puts it back', async ({ page }) => {
  await openApp(page, {
    files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '14', '15'), 'config.yaml': 'habits:\n  goal: 3\n' },
  });
  await row(page, 'Meditate').getByTestId('task-check').click();
  await expect(page.getByTestId('toast')).toContainText('Habit formed: Meditate · 3 in 3 days · moved to History');
  await expect(row(page, 'Meditate')).toHaveCount(0);
  await expect.poll(() => driveFile(page, 'done.md')).toBe(`${ticks('Meditate', '14', '15', '16')}- [x] Meditate 🌱 🏆 2026-10-16\n`);
  await page.getByTestId('toast-action').click();
  await expect(row(page, 'Meditate')).toHaveAttribute('data-habit', 'false');
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe('# Tasks\n- [ ] Meditate 🔁 every day 📅 2026-10-17\n');
  await expect.poll(() => driveFile(page, 'done.md')).toContain('- [x] Meditate 🌱 🏆 2026-10-16\n');
});

test('renaming asks first', async ({ page, isMobile }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '15') } });
  const asked: string[] = [];
  page.on('dialog', (d) => void asked.push(d.message()));
  await openTask(page, isMobile, 'Meditate');
  const title = isMobile ? page.getByTestId('sheet').getByLabel('Task title') : page.getByTestId('detail-title');
  const save = () => (isMobile ? page.getByTestId('sheet').getByRole('button', { name: 'Save', exact: true }).tap() : title.press('Enter'));

  await title.fill('Meditate 15 min');
  // Typing alone never renames: the debounced save (1 s) waits for Enter, blur or close.
  await page.waitForTimeout(1500);
  expect(asked).toEqual([]);
  page.once('dialog', (d) => void d.dismiss());
  await save();
  await expect.poll(() => asked).toEqual(['Renaming restarts Meditate at 0. Rename?']);
  if (!isMobile) await expect(title).toHaveValue('Meditate');
  expect(await driveFile(page, 'tasks.md')).toBe(line('Meditate', '2026-10-16'));

  if (isMobile) await openTask(page, isMobile, 'Meditate');
  await title.fill('Meditate 15 min');
  page.once('dialog', (d) => void d.accept());
  await save();
  await expect.poll(() => driveFile(page, 'tasks.md')).toBe(line('Meditate 15 min', '2026-10-16'));
  await expect(row(page, 'Meditate 15 min')).toHaveCount(1);
});

test('the board rail opens a habit from the Habits group', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the board is a desktop view');
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16') } });
  await page.keyboard.press('v');
  await expect(page.getByTestId('board')).toBeVisible();
  await page.getByTestId('rail').getByTestId('habit-item').click();
  await expect(page.getByTestId('rail').getByTestId('detail-title')).toHaveValue('Meditate');
  await expect(page.getByTestId('rail').getByTestId('habit-block')).toBeVisible();
});

/** The ways to make a habit: h, the hab word, the add-sheet toggle, the move sheet, the repeat picker (#44). */

const PLAIN = (title: string, date = '2026-10-16') => `- [ ] ${title} 📅 ${date}\n`;
const REPEATING = (title: string, date = '2026-10-16') => `- [ ] ${title} 🔁 every day 📅 ${date}\n`;
const sheet = (page: Page) => page.getByTestId('sheet');
const three = ['A', 'B', 'C'].map((t) => habit(`Habit ${t}`, '2026-10-16')).join('');

/** A horizontal touch swipe across `target` (the phone's row swipe). */
async function swipe(target: ReturnType<Page['locator']>, dx: number) {
  await target.evaluate((el, dx) => {
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const at = (type: string, cx: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y }));
    at('pointerdown', x);
    for (let i = 1; i <= 6; i++) at('pointermove', x + (dx * i) / 6);
    at('pointerup', x + dx);
  }, dx);
}

test.describe('keys', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard commands are a desktop feature');

  test('h toggles a habit on a repeating task and off again', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${REPEATING('Meditate')}` } });
    await row(page, 'Meditate').click();
    await page.keyboard.press('h');
    await expect(page.getByTestId('toast')).toContainText('Now a habit');
    await expect(row(page, 'Meditate').first()).toHaveAttribute('data-habit', 'true');
    await expect.poll(() => driveFile(page, 'tasks.md')).toBe(`# Tasks\n${habit('Meditate', '2026-10-16')}`);
    await page.keyboard.press('h');
    await expect(page.getByTestId('toast')).toContainText('No longer a habit');
    await expect(row(page, 'Meditate').first()).toHaveAttribute('data-habit', 'false');
    await expect.poll(() => driveFile(page, 'tasks.md')).toBe(`# Tasks\n${REPEATING('Meditate')}`);
  });

  test('h on a task with no rule opens the repeat picker without when done, and saving makes a habit', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${PLAIN('Stretch')}` } });
    await row(page, 'Stretch').click();
    await page.keyboard.press('h');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('radio', { name: 'Every day', exact: true })).toBeChecked();
    await expect(sheet(page).getByLabel('No repeat')).toHaveCount(0);
    await expect(sheet(page)).not.toContainText('after I complete it');
    await sheet(page).getByLabel('Weekdays').check();
    await sheet(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('toast')).toContainText('Now a habit');
    await expect(row(page, 'Stretch').first()).toHaveAttribute('data-habit', 'true');
    await expect.poll(() => driveFile(page, 'tasks.md')).toBe('# Tasks\n- [ ] Stretch 🌱 🔁 every weekday 📅 2026-10-16\n');
  });

  test('h on a fourth habit is refused with the message', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${three}${REPEATING('Stretch')}` } });
    await row(page, 'Stretch').click();
    await page.keyboard.press('h');
    await expect(page.getByTestId('toast')).toContainText('3 habits in progress already. Finish or drop one first');
    await expect(row(page, 'Stretch').first()).toHaveAttribute('data-habit', 'false');
    expect(await driveFile(page, 'tasks.md')).toBe(`# Tasks\n${three}${REPEATING('Stretch')}`);
  });

  test('typing hab at the limit adds an ordinary repeating task', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${three}` } });
    await page.getByTestId('add-input').click();
    await page.keyboard.type('Stretch hab');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('toast')).toContainText('Stretch added as a repeating task');
    await expect(row(page, 'Stretch').first()).toHaveAttribute('data-habit', 'false');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Stretch 🔁 every day 📅 2026-10-16\n');
  });

  test('hab with no date word lands in Today and shows violet', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': '# Tasks\n', 'config.yaml': 'newTaskBucket: someday\n' } });
    await page.getByTestId('add-input').click();
    await page.keyboard.type('Stretch hab');
    await expect(page.getByTestId('add').getByTestId('shortcut-word')).toHaveClass(/hab/);
    await page.keyboard.press('Enter');
    await expect(rowsOf(page, 'today').filter({ hasText: 'Stretch' })).toHaveAttribute('data-habit', 'true');
  });

  test("a habit's repeat picker has no when done", async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}` } });
    await row(page, 'Meditate').click();
    await page.keyboard.press('r');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).not.toContainText('after I complete it');
    await expect(sheet(page).getByLabel('No repeat')).toBeVisible();
    await expect(sheet(page).getByRole('radio', { name: 'Every day', exact: true })).toBeChecked();
  });

  test('the hints list h', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': '# Tasks\n' } });
    await expect(page.getByTestId('hints')).toContainText('i important');
    await expect(page.getByTestId('hints')).toContainText('h habit');
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the sheets are the phone layout');

  test('the add-sheet Habit toggle and the move-sheet entry work', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${PLAIN('Stretch')}` } });
    await page.getByTestId('fab').tap();
    await sheet(page).getByLabel('New task').fill('Read');
    const toggle = sheet(page).getByRole('button', { name: 'Habit', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await sheet(page).getByRole('button', { name: 'Add', exact: true }).tap();
    await expect(row(page, 'Read').first()).toHaveAttribute('data-habit', 'true');
    await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Read 🌱 🔁 every day 📅 2026-10-16\n');

    // The move sheet: a plain task has no rule, so the entry opens the habit repeat picker.
    await swipe(row(page, 'Stretch'), -120);
    await sheet(page).getByRole('button', { name: /^Make it a habit/ }).tap();
    await expect(sheet(page).getByRole('radio', { name: 'Every day', exact: true })).toBeChecked();
    await expect(sheet(page).getByLabel('No repeat')).toHaveCount(0);
    await sheet(page).getByRole('button', { name: 'Save' }).tap();
    await expect(row(page, 'Stretch').first()).toHaveAttribute('data-habit', 'true');

    await swipe(row(page, 'Stretch'), -120);
    await sheet(page).getByRole('button', { name: /^Not a habit/ }).tap();
    await expect(row(page, 'Stretch').first()).toHaveAttribute('data-habit', 'false');
  });

  test('the Habit toggle at the limit says why and stays off', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${three}` } });
    await page.getByTestId('fab').tap();
    const toggle = sheet(page).getByRole('button', { name: 'Habit', exact: true });
    await toggle.tap();
    await expect(page.getByTestId('toast')).toContainText('3 habits in progress already');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('the edit sheet offers Make it a habit on a repeating task', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${REPEATING('Stretch')}` } });
    await row(page, 'Stretch').first().tap();
    await sheet(page).getByRole('button', { name: /^Make it a habit/ }).tap();
    await expect(row(page, 'Stretch').first()).toHaveAttribute('data-habit', 'true');
  });
});

test('stats count a habit tick', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}` } });
  await expect(page.getByTestId('stats')).toContainText(/Today\s*0/);
  await row(page, 'Meditate').getByTestId('task-check').click();
  await expect(page.getByTestId('stats')).toContainText(/Today\s*1/);
});

/** Carried fixes from the reviews of the habit UI. */

test('the History in-progress line has a space after the dot', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '13', '14') } });
  await group(page).getByTestId('habits-history').click();
  await expect(history(page)).toContainText(/last chance · \d+ of \d+/);
});

test('the Habits state line says just one more miss restarts when none was missed in a row', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the state line is the desktop list');
  const done = ticks('Meditate', '01', '03', '05', '07', '09', '11', '13', '14', '15');
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': done } });
  await expect(group(page).getByTestId('habit-state')).toHaveText(/^one more miss restarts · misses/);
});

test('the Goal field rejects 1e2, 0x5 and +5', async ({ page, isMobile }) => {
  await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16') } });
  await openTask(page, isMobile, 'Meditate');
  for (const bad of ['1e2', '0x5', '+5']) {
    await block(page).getByTestId('habit-goal').click();
    const field = block(page).getByLabel('Goal');
    await field.fill(bad);
    await field.press('Enter');
    await expect(block(page).getByTestId('habit-goal')).toHaveText('66 (default)');
  }
  expect(await driveFile(page, 'tasks.md')).toBe(line('Meditate', '2026-10-16'));
});

test.describe('desktop detail', () => {
  test.skip(({ isMobile }) => isMobile, 'the detail is a desktop pane');

  test('the window losing focus does not ask to rename a habit', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': line('Meditate', '2026-10-16'), 'done.md': ticks('Meditate', '15') } });
    const asked: string[] = [];
    page.on('dialog', (d) => { asked.push(d.message()); void d.dismiss(); });
    await openTask(page, false, 'Meditate');
    const title = page.getByTestId('detail-title');
    await title.fill('Meditate 15 min');
    // A tab switch blurs the field with no other element taking the focus, and the document is not focused.
    await title.evaluate((el) => {
      document.hasFocus = () => false;
      (el as HTMLElement).blur();
    });
    await page.waitForTimeout(300);
    expect(asked).toEqual([]);
    await expect(title).toHaveValue('Meditate 15 min');
  });
});

test.describe('phone header', () => {
  test.skip(({ isMobile }) => !isMobile, 'the cards are the phone layout');

  test('Habits N of M and History sit on their own row above the cards', async ({ page }) => {
    await openApp(page, { files: { 'tasks.md': `# Tasks\n${habit('Meditate', '2026-10-16')}${habit('Read', '2026-10-16')}` } });
    const head = await group(page).locator('.head').boundingBox();
    const cards = await group(page).getByTestId('habit-cards').boundingBox();
    const link = await group(page).getByTestId('habits-history').boundingBox();
    const vw = page.viewportSize()!.width;
    expect(head!.y + head!.height).toBeLessThanOrEqual(cards!.y);
    expect(head!.width).toBeGreaterThan(vw * 0.8);
    expect(link!.x + link!.width).toBeGreaterThan(vw * 0.8);
  });
});
