import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The one Omark app's shell (one app spec, sections 4–7 and 12), on the fake storage: one fake folder per
// part, `root` for the suite config.yaml.

type Folder = 'root' | 'tasks' | 'time' | 'goals';
type Seed = Partial<Record<Folder, Record<string, string>>>;

async function open(page: Page, opts: { seed?: Seed; signedOut?: boolean; path?: string } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-16T09:00:00'));
  await page.addInitScript(
    ([seed, signedOut]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__OMARK_SEED__ = seed;
      if (signedOut) w.__OMARK_SIGNED_OUT__ = true;
    },
    [opts.seed ?? {}, opts.signedOut ?? false] as const,
  );
  await page.goto(opts.path ?? '/');
}

const files = (page: Page, folder: Folder) =>
  page.evaluate((f) => (window as unknown as { __omarkFake: Record<string, { names(): string[] }> }).__omarkFake[f]!.names(), folder);
const peek = (page: Page, folder: Folder, name: string) =>
  page.evaluate(
    ([f, n]) => (window as unknown as { __omarkFake: Record<string, { peek(n: string): string | null }> }).__omarkFake[f]!.peek(n),
    [folder, name] as const,
  );
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Parts' });
const tasksList = (page: Page) => page.getByTestId('bucket-today');

test('first run with Tasks only: no tabs, no calendar question, only config.yaml and tasks/', async ({ page }) => {
  await open(page, { signedOut: true });
  await page.getByRole('button', { name: 'Use Omark' }).click();
  await page.getByRole('button', { name: /OneDrive/ }).click();
  await expect(page.getByRole('checkbox', { name: /Tasks/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Time/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Goals/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(tasksList(page)).toBeVisible();
  // Tasks alone keeps the address Omark Tasks had.
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(tabs(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /calendar/i })).toHaveCount(0);
  await expect.poll(() => files(page, 'root')).toEqual(['config.yaml']);
  expect(await peek(page, 'root', 'config.yaml')).toBe('parts: [tasks]\n');
  await expect.poll(() => files(page, 'tasks')).toContain('tasks.md');
  expect(await files(page, 'time')).toEqual([]);
  expect(await files(page, 'goals')).toEqual([]);
});

test('the first run ticks the part in the address the user came in by', async ({ page }) => {
  await open(page, { signedOut: true, path: '/time' });
  await page.getByRole('button', { name: 'Use Omark' }).click();
  await page.getByRole('button', { name: /OneDrive/ }).click();
  await expect(page.getByRole('checkbox', { name: /Time/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Tasks/ })).not.toBeChecked();
});

test('a second device on a folder that lists parts skips the parts question', async ({ page }) => {
  await open(page, { signedOut: true, seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' } } });
  await page.getByRole('button', { name: 'Use Omark' }).click();
  await page.getByRole('button', { name: /OneDrive/ }).click();
  await expect(tasksList(page)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Tasks/ })).toHaveCount(0);
  await expect(tabs(page).getByRole('link')).toHaveText(['Tasks', 'Time']);
});

test('a part that is off is offered at its address, and turning it on adds a tab', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': '# mine\nparts: [tasks]\n' } }, path: '/goals' });
  await page.getByRole('button', { name: 'Turn on Omark Goals' }).click();
  await expect(tabs(page).getByRole('link')).toHaveText(['Tasks', 'Goals']);
  await expect(page).toHaveURL(/\/goals$/);
  await expect.poll(() => peek(page, 'root', 'config.yaml')).toBe('# mine\nparts: [tasks, goals]\n');
  expect(await files(page, 'goals')).toEqual([]);
});

test('/ opens the first part on, in the order the file gives', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [time, tasks]\n' } } });
  await expect(tabs(page).getByRole('link')).toHaveText(['Time', 'Tasks']);
  await expect(tabs(page).getByRole('link', { name: 'Time' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Omark Time' })).toBeVisible();
  await expect(tasksList(page)).toBeHidden();
});

test('any other path goes to the first part on, keeping the hash', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } }, path: '/elsewhere#settings' });
  await expect(page).toHaveURL(/\/tasks#settings$/);
  await expect(page.getByTestId('settings')).toBeVisible();
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'keys');

  test('Tasks keys rest on another tab', async ({ page }) => {
    await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' } } });
    await expect(tasksList(page)).toBeVisible();
    await page.keyboard.press('Alt+2');
    await expect(page).toHaveURL(/\/time$/);
    await expect(tasksList(page)).toBeHidden();
    await page.keyboard.press('f');
    await tabs(page).getByRole('link', { name: 'Tasks' }).click();
    await expect(tasksList(page)).toBeVisible();
    await expect(page.getByTestId('search')).toBeHidden();
  });

  test('switching parts keeps Tasks as it was: an open search, its scroll, its Settings', async ({ page }) => {
    const many = Array.from({ length: 60 }, (_, i) => `- [ ] Task ${i + 1} 📅 2026-10-16`).join('\n');
    await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' }, tasks: { 'tasks.md': `# Tasks\n${many}\n` } } });
    await expect(tasksList(page)).toBeVisible();
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
    const scrolled = await page.evaluate(() => scrollY);
    await page.keyboard.press('Alt+2');
    await tabs(page).getByRole('link', { name: 'Tasks' }).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrolled);

    await page.keyboard.press('f');
    await expect(page.getByTestId('search')).toBeVisible();
    await page.keyboard.press('Alt+2');
    await expect(page.getByTestId('search')).toBeHidden();
    await tabs(page).getByRole('link', { name: 'Tasks' }).click();
    await expect(page.getByTestId('search')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('search')).toBeHidden();

    await page.keyboard.press(',');
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.keyboard.press('Alt+2');
    await tabs(page).getByRole('link', { name: 'Tasks' }).click();
    await expect(page).toHaveURL(/#settings$/);
    await expect(page.getByTestId('settings')).toBeVisible();
  });

  test('the tab bar sits at the top on desktop', async ({ page }) => {
    await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' } } });
    const box = await tabs(page).boundingBox();
    expect(box!.y).toBeLessThan(100);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('the tab bar sits at the bottom on the phone', async ({ page }) => {
    await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' } } });
    const box = await tabs(page).boundingBox();
    const height = page.viewportSize()!.height;
    expect(box!.y + box!.height).toBeGreaterThan(height - 100);
  });
});

test('a Tasks-only start loads no Time or Goals code', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } } });
  await expect(tasksList(page)).toBeVisible();
  expect(scripts.filter((u) => /TimePart|GoalsPart/.test(u))).toEqual([]);
});
