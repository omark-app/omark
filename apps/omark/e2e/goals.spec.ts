import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Omark Goals inside the one app (roadmap G.2, Goals spec 8 and 13), on the fake storage: goals.md in goals/,
// projects.csv at the top, Tasks' files read for links and activity.

type Folder = 'root' | 'tasks' | 'time' | 'goals';
type Seed = Partial<Record<Folder, Record<string, string>>>;

const PROJECTS = 'code,description,client,rate,currency,archived\nCLIMB,Climbing trips,,,,\n';
const PARTS = 'parts: [goals, tasks]\n';

async function open(page: Page, seed: Seed = {}) {
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00'));
  await page.addInitScript((s) => {
    (window as unknown as Record<string, unknown>).__OMARK_SEED__ = s;
  }, { ...seed, root: { 'config.yaml': PARTS, ...seed.root } });
  await page.goto('/goals');
  await expect(page.getByTestId('goals-board')).toBeVisible();
}

const peek = (page: Page, folder: Folder, name: string) =>
  page.evaluate(
    ([f, n]) => (window as unknown as { __omarkFake: Record<string, { peek(n: string): string | null }> }).__omarkFake[f]!.peek(n),
    [folder, name] as const,
  );
const card = (page: Page, name: string) => page.getByTestId('area-card').filter({ hasText: name });
const sheet = (page: Page) => page.locator('form.sheet');

async function addArea(page: Page, name: string, vision = '') {
  await page.getByRole('button', { name: /^Add (area|your first area)$/ }).click();
  await sheet(page).getByLabel('Name').fill(name);
  if (vision) await sheet(page).getByLabel('Vision').fill(vision);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(card(page, name)).toBeVisible();
}

async function addGoal(page: Page, area: string, text: string, due: string) {
  await card(page, area).getByRole('button', { name: 'Add goal' }).click();
  await sheet(page).getByLabel('Goal').fill(text);
  await sheet(page).getByLabel('Target date').fill(due);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
}

test('the first run shows placeholders, writes nothing, and the first area replaces them', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('placeholders')).toBeVisible();
  expect(await peek(page, 'goals', 'goals.md')).toBeNull();
  await addArea(page, 'Health', 'Strong at 60.');
  await expect(page.getByTestId('placeholders')).toHaveCount(0);
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toBe('## Health #health\n\nStrong at 60.\n');
});

test('add, edit and delete an area and a goal; tick a goal and find it under Achieved', async ({ page }) => {
  await open(page);
  await addArea(page, 'Health');
  await addGoal(page, 'Health', 'Run a half marathon', '2027-05-01');
  await expect(card(page, 'Health').getByTestId('goal-row')).toContainText('by May 2027');
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toContain('- [ ] Run a half marathon 📅 2027-05-01 ➕ 2026-10-29');

  await card(page, 'Health').getByTestId('goal-row').click();
  await sheet(page).getByLabel('Achieved').check();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Health').getByTestId('achieved')).toContainText('Achieved (1)');
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toContain('- [x] Run a half marathon 📅 2027-05-01 ➕ 2026-10-29 ✅ 2026-10-29');

  await card(page, 'Health').getByRole('button', { name: 'Edit Health' }).click();
  await sheet(page).getByLabel('Name').fill('Body');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toContain('## Body #health');

  page.on('dialog', (d) => void d.accept());
  await card(page, 'Body').getByTestId('achieved').locator('summary').click();
  await card(page, 'Body').getByTestId('goal-row').click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toBe('## Body #health\n');
  await card(page, 'Body').getByRole('button', { name: 'Edit Body' }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('area-card')).toHaveCount(0);
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toBe('');
});

test('a project created from the goal form goes to projects.csv, and the goal carries its code', async ({ page }) => {
  await open(page, { root: { 'projects.csv': PROJECTS } });
  await addArea(page, 'Work');
  await card(page, 'Work').getByRole('button', { name: 'Add goal' }).click();
  await sheet(page).getByLabel('Goal').fill('Launch my course');
  await sheet(page).getByLabel('Project').selectOption('__new__');
  await sheet(page).getByLabel('Code').fill('climb');
  await sheet(page).getByLabel('Description').fill('Taken');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByRole('alert')).toBeVisible();
  await sheet(page).getByLabel('Code').fill('COURSE');
  await sheet(page).getByLabel('Description').fill('My design course');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => peek(page, 'root', 'projects.csv')).toBe(`${PROJECTS}COURSE,My design course,,,,\n`);
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toContain('- [ ] Launch my course #COURSE ➕ 2026-10-29');
  await expect(card(page, 'Work').getByTestId('goal-facts')).toContainText('0 open tasks');
});

test('a stale area shows Needs update; ticking a habit tagged with it in Tasks clears it', async ({ page }) => {
  await open(page, {
    goals: { 'goals.md': '## Home #home\n- [ ] Move closer to the sea ➕ 2026-01-10\n' },
    tasks: { 'tasks.md': '# Tasks\n\n- [ ] Water the garden #home 🌱 🔁 every day 📅 2026-10-29\n' },
  });
  await expect(card(page, 'Home').getByTestId('needs-update')).toContainText('since 10 January');
  await expect(card(page, 'Home').getByTestId('area-habits')).toContainText('Water the garden #home');
  await page.getByRole('navigation', { name: 'Parts' }).getByRole('link', { name: 'Tasks' }).click();
  await page.getByTestId('task-row').filter({ hasText: 'Water the garden' }).getByTestId('task-check').click();
  await expect.poll(() => peek(page, 'tasks', 'done.md')).toContain('✅ 2026-10-29');
  await page.getByRole('navigation', { name: 'Parts' }).getByRole('link', { name: 'Goals' }).click();
  await expect(card(page, 'Home').getByTestId('needs-update')).toHaveCount(0);
});

test('an area with nothing linked shows the hint, not Needs update', async ({ page }) => {
  await open(page, { goals: { 'goals.md': '## Family #family\n\nTime together.\n' } });
  await expect(card(page, 'Family').getByTestId('area-hint')).toHaveText('Add a goal, or tag a habit with #family');
  await expect(card(page, 'Family').getByTestId('needs-update')).toHaveCount(0);
});

test('Not now: add, edit and delete', async ({ page }) => {
  await open(page, { goals: { 'goals.md': '## Home #home\n' } });
  const notNow = page.getByTestId('not-now');
  await notNow.getByLabel('Add to Not now').fill('A boat');
  await notNow.getByRole('button', { name: 'Add' }).click();
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toBe('## Home #home\n\n## Not now\n\n- A boat\n');
  await notNow.getByRole('button', { name: 'A boat', exact: true }).click();
  await notNow.getByLabel('Not now item').fill('A small boat');
  await notNow.getByLabel('Not now item').press('Enter');
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toContain('- A small boat');
  await notNow.getByRole('button', { name: 'Delete A small boat' }).click();
  await expect.poll(() => peek(page, 'goals', 'goals.md')).not.toContain('boat');
});

test('the vision line is edited in place', async ({ page }) => {
  await open(page, { goals: { 'goals.md': '## Home #home\n' } });
  await page.getByRole('button', { name: 'Add your vision line' }).click();
  await page.getByLabel('Vision line').fill('Calm and strong.');
  await page.getByLabel('Vision line').press('Enter');
  await expect(page.getByTestId('vision-line')).toHaveText('Calm and strong.');
  await expect.poll(() => peek(page, 'goals', 'goals.md')).toBe('# Vision\n\nCalm and strong.\n\n## Home #home\n');
});

test('Needs update after is set on the one Settings page, in goals/config.yaml', async ({ page }) => {
  await open(page, { goals: { 'goals.md': '## Home #home\n- [ ] Move closer to the sea ➕ 2026-01-10\n' } });
  await expect(card(page, 'Home').getByTestId('needs-update')).toBeVisible();
  await page.getByTestId('goals-board').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  const section = page.getByTestId('settings-section-goals');
  await section.getByRole('spinbutton').fill('12');
  await section.getByRole('spinbutton').blur();
  await expect.poll(() => peek(page, 'goals', 'config.yaml')).toBe('stale_after: 12\n');
  await page.getByTestId('settings-back').click();
  await expect(card(page, 'Home').getByTestId('needs-update')).toHaveCount(0);
});

