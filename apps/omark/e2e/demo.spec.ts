import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { demoPort } from './port';

// The demo world (roadmap U.6, one app spec section 9): the demo build (VITE_STORAGE=demo), served by
// playwright.config.ts's second web server. Each test has a fresh browser context, so it starts on an empty
// IndexedDB and the world is seeded for today.
const DEMO = `http://localhost:${demoPort(process.cwd(), process.env)}`;
test.use({ baseURL: DEMO });

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Parts' });
const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const card = (page: Page, name: string) => page.getByTestId('area-card').filter({ has: page.getByRole('heading', { name }) });
const time = (page: Page) => page.locator('.time-part');

async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(tabs(page)).toBeVisible();
}

async function toTab(page: Page, name: 'Tasks' | 'Time' | 'Goals'): Promise<void> {
  await tabs(page).getByRole('link', { name }).click();
}

/** Time's first sync on the made-up calendar is done. */
async function synced(page: Page): Promise<void> {
  await expect(time(page).getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
}

/** A text file in a demo folder's IndexedDB (`omark-demo:<folder>`); null if missing. */
function demoFile(page: Page, folder: string, name: string): Promise<string | null> {
  return page.evaluate(
    ([f, n]) =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open(`omark-demo:${f}`);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('files').objectStore('files').get(n);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            resolve((get.result as { text: string } | undefined)?.text ?? null);
          };
        };
      }),
    [folder, name] as const,
  );
}

async function addTask(page: Page, isMobile: boolean, title: string): Promise<void> {
  if (isMobile) {
    await page.getByTestId('fab').tap();
    await page.getByTestId('sheet').getByLabel('New task').fill(title);
    await page.getByTestId('sheet').getByRole('button', { name: 'Add', exact: true }).tap();
  } else {
    await page.getByTestId('add-input').fill(title);
    await page.getByTestId('add-input').press('Enter');
  }
  await expect(row(page, title)).toHaveCount(1);
}

test('opens at once on Tasks with Maya\'s tasks: no welcome, no sign-in, the three tabs and the demo footer', async ({ page }) => {
  await open(page);
  await expect(tabs(page).getByRole('link')).toHaveText(['Tasks', 'Time', 'Goals']);
  await expect(row(page, 'Send Nova the payments flow')).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('saved');
  await expect(page.getByRole('button', { name: 'Use Omark' })).toHaveCount(0);
  await expect(page.getByTestId('real-use')).toHaveAttribute('href', 'https://example.test/real');
  await expect(page.getByTestId('reset-demo')).toBeVisible();
});

test('Time shows the NOVA hours, the COURS fix and the Calendar view in colour', async ({ page }) => {
  await open(page, '/time');
  await synced(page);
  await expect(time(page).locator('[data-testid="project-hours"][data-code="NOVA"]')).toBeVisible();
  const views = time(page).getByRole('navigation', { name: 'Views' });
  await views.getByRole('link', { name: /^Fix list/ }).click();
  await expect(time(page).locator('[data-testid="unknown"][data-code="COURS"]')).toBeVisible();
  await views.getByRole('link', { name: 'Calendar' }).click();
  const week = time(page).getByTestId('week');
  await expect(week.getByTestId('event').first()).toBeVisible();
  // Colouring is on with edit access: known codes turn green and the typo red.
  await expect(week.locator('[data-colour="green"]').first()).toBeVisible({ timeout: 20_000 });
  // The typo is a few work days back: this week or the one before, by the day of the week.
  const typo = week.getByTestId('event').filter({ hasText: 'COURS; Recording' });
  if ((await typo.count()) === 0) await time(page).getByRole('button', { name: 'Previous week' }).click();
  await expect(typo).toHaveAttribute('data-colour', 'red', { timeout: 20_000 });
  await expect(page.getByTestId('demo-line')).toContainText('DEMO');
});

test('Goals shows the four areas, the two pictures and Home needing an update', async ({ page }) => {
  await open(page, '/goals');
  await expect(page.getByTestId('area-card')).toHaveCount(4);
  for (const name of ['Health', 'Family & friends', 'Work', 'Home']) await expect(card(page, name)).toBeVisible();
  await expect(card(page, 'Home').getByTestId('needs-update')).toBeVisible();
  await expect(card(page, 'Work').getByTestId('needs-update')).toHaveCount(0);
  for (const name of ['Health', 'Home']) {
    const picture = card(page, name).getByTestId('area-picture');
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByTestId('demo-line')).toContainText('DEMO');
  await expect(page.getByTestId('real-use')).toHaveAttribute('href', 'https://example.test/real');
});

test('Settings keeps the files in this browser: no Change, no sign-in, no Sign out', async ({ page }) => {
  await open(page, '/settings');
  const omark = page.getByTestId('settings-section-omark');
  await expect(omark).toContainText('this browser');
  await expect(omark).toContainText('The demo needs no sign-in.');
  await expect(omark).toContainText('made-up calendar');
  await expect(omark.getByRole('button', { name: 'Change' })).toHaveCount(0);
  await expect(omark.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await expect(omark.getByRole('button', { name: 'Connect Google Calendar' })).toHaveCount(0);
  await expect(omark.getByTestId('settings-reset-demo')).toBeVisible();
});

test('an edit survives a reload, the pictures too; Reset demo asks, then brings the world back', async ({ page, isMobile }) => {
  await open(page);
  await expect(row(page, 'Send Nova the payments flow')).toBeVisible();
  await addTask(page, isMobile, 'Water the plants');
  await expect.poll(() => demoFile(page, 'tasks', 'tasks.md')).toContain('- [ ] Water the plants');
  await toTab(page, 'Goals');
  await page.getByRole('button', { name: 'Add area' }).click();
  await page.locator('form.sheet').getByLabel('Name').fill('Garden');
  await page.locator('form.sheet').getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => demoFile(page, 'goals', 'goals.md')).toContain('## Garden #garden');
  await page.reload();
  await expect(page.getByTestId('area-card')).toHaveCount(5);
  // The pictures are still there after the reload (WebKit keeps Blobs in IndexedDB).
  await expect.poll(() => card(page, 'Health').getByTestId('area-picture').evaluate((img: HTMLImageElement) => img.naturalWidth > 0)).toBe(true);
  await toTab(page, 'Tasks');
  await expect(row(page, 'Water the plants')).toBeVisible();
  await toTab(page, 'Goals');

  // A no keeps everything.
  page.once('dialog', (d) => void d.dismiss());
  await page.getByTestId('demo-line').getByTestId('reset-demo').click();
  await toTab(page, 'Tasks');
  await expect(row(page, 'Water the plants')).toBeVisible();

  // Tasks' own Reset demo resets every part, after the reload it asks for.
  page.once('dialog', (d) => void d.accept());
  await Promise.all([page.waitForEvent('load'), page.locator('[data-testid="reset-demo"]:visible').click()]);
  await expect(row(page, 'Send Nova the payments flow')).toBeVisible();
  await expect(row(page, 'Water the plants')).toHaveCount(0);
  expect(await demoFile(page, 'tasks', 'tasks.md')).not.toContain('Water the plants');
  await toTab(page, 'Goals');
  await expect(page.getByTestId('area-card')).toHaveCount(4);
  expect(await demoFile(page, 'goals', 'goals.md')).not.toContain('Garden');
});

test('no request leaves the site while going through every part and view', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(DEMO) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url);
  });
  await open(page);
  await expect(row(page, 'Send Nova the payments flow')).toBeVisible();
  await toTab(page, 'Time');
  await synced(page);
  const views = time(page).getByRole('navigation', { name: 'Views' });
  for (const name of ['Charts', /^Fix list/, 'Projects', 'Report', 'Calendar', 'Settings', 'Hours']) {
    await views.getByRole('link', { name }).click();
  }
  await expect(time(page).getByTestId('hours')).toBeVisible();
  await toTab(page, 'Goals');
  await expect(page.getByTestId('area-card')).toHaveCount(4);
  await page.goto('/settings');
  await expect(page.getByTestId('settings-section-omark')).toBeVisible();
  expect(outside).toEqual([]);
});

test("Time's charts colour each project, not black", async ({ page }) => {
  await open(page, '/time');
  await synced(page);
  await time(page).getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Charts' }).click();
  const bars = time(page).locator('svg rect');
  await expect(bars.first()).toBeVisible();
  const fills = await bars.evaluateAll((rects) => rects.map((r) => getComputedStyle(r).fill));
  expect(fills.length).toBeGreaterThan(0);
  expect(fills.filter((f) => f === 'rgb(0, 0, 0)')).toEqual([]);
});

// Charts mounts before the first sync when it is reloaded; it still opens on a range with hours, early in a month too.
test("Time's charts show hours after a reload on Charts", async ({ page }) => {
  await open(page, '/time');
  await synced(page);
  await time(page).getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Charts' }).click();
  await page.reload();
  await synced(page);
  await expect(time(page).getByTestId('chart-projects').locator('svg rect').first()).toBeVisible();
});

test('only the demo build has the demo world and its pictures', async () => {
  test.skip(test.info().project.name !== 'desktop', 'a check of the build folders: once is enough');
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
  const has = (dir: string, text: string) => files(dir).some((f) => /\.(js|html)$/.test(f) && readFileSync(f, 'utf8').includes(text));
  // dist: the fake build of the first web server, a non-demo build.
  expect(existsSync('dist-demo/demo/health.jpg') && existsSync('dist-demo/demo/home.jpg')).toBe(true);
  expect(has('dist-demo', 'Nova Bank')).toBe(true);
  expect(files('dist').filter((f) => f.endsWith('.jpg'))).toEqual([]);
  expect(has('dist', 'Nova Bank')).toBe(false);
  expect(has('dist', 'omark-demo:root')).toBe(false);
});
