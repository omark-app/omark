import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { poll } from './poll';

// The one Settings page (roadmap U.5, one app spec section 8): the Omark card (storage, parts, sign-ins, sign-out)
// and a section per part that is on, each writing its own config.yaml.

type Folder = 'root' | 'tasks' | 'time' | 'goals';
type Seed = Partial<Record<Folder, Record<string, string>>>;

const CALENDARS = [{ id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true }];
const PROJECTS = 'code,description,client,rate,currency,archived\nACME,Acme,,,,\n';

async function open(page: Page, opts: { seed?: Seed; path?: string; calendar?: boolean } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00Z'));
  await page.addInitScript(
    ([seed, calendars, calendar]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__OMARK_SEED__ = seed;
      w.__OMARK_TIME_SEED__ = { calendars, events: [] };
      if (calendar) w.__OMARK_CALENDAR__ = true;
    },
    [opts.seed ?? {}, CALENDARS, opts.calendar ?? false] as const,
  );
  await page.goto(opts.path ?? '/');
}

const peek = (page: Page, folder: Folder, name: string) =>
  page.evaluate(
    ([f, n]) => (window as unknown as { __omarkFake: Record<string, { peek(n: string): string | null }> }).__omarkFake[f]!.peek(n),
    [folder, name] as const,
  );
const sessions = (page: Page) =>
  page.evaluate(() => Object.fromEntries((window as unknown as { __omarkSessions: Map<string, string[]> }).__omarkSessions));
const omark = (page: Page) => page.getByTestId('settings-section-omark');
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Parts' });

test("Tasks' gear and , open the one Settings page, with the Omark card first", async ({ page, isMobile }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  if (isMobile) await page.getByTestId('open-settings').first().click();
  else await page.keyboard.press(',');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(omark(page)).toContainText('OneDrive');
  await expect(omark(page).getByRole('checkbox', { name: /Tasks/ })).toBeChecked();
  await expect(omark(page).getByRole('checkbox', { name: /Tasks/ })).toBeDisabled();
  // Tasks' own settings are on the same page.
  await expect(page.getByTestId('settings-section-general')).toBeVisible();
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
});

test('turning Time on and off from Settings shows and hides its tab, and writes the suite file', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } }, path: '/settings' });
  await omark(page).getByRole('checkbox', { name: /Time/ }).check();
  await expect(tabs(page).getByRole('link')).toHaveText(['Tasks', 'Time']);
  await expect(page).toHaveURL(/\/settings$/);
  await poll(() => peek(page, 'root', 'config.yaml')).toBe('parts: [tasks, time]\n');
  await omark(page).getByRole('checkbox', { name: /Time/ }).uncheck();
  await expect(tabs(page)).toHaveCount(0);
  await poll(() => peek(page, 'root', 'config.yaml')).toBe('parts: [tasks]\n');
});

test("a Tasks setting and a Time setting changed on the page land in their own files", async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n', 'projects.csv': PROJECTS } }, path: '/time', calendar: true });
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.time-part').getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Settings', exact: false }).first().click();
  await page.getByRole('link', { name: 'All Omark settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByTestId('settings-section-general').getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
  await poll(() => peek(page, 'tasks', 'config.yaml')).toContain('theme: dark');
  const time = page.getByTestId('settings-section-time');
  await time.getByLabel('Hours an all-day event counts for').fill('6');
  await time.getByLabel('Hours an all-day event counts for').blur();
  await poll(() => peek(page, 'time', 'config.yaml')).toContain('all_day_hours: 6');
  expect(await peek(page, 'tasks', 'config.yaml')).not.toContain('all_day');
  // Back goes back to Time, where Settings was opened from.
  await page.getByTestId('settings-back').click();
  await expect(page).toHaveURL(/\/time/);
  await expect(page.locator('.time-part').getByTestId('status')).toBeVisible();
});

test('Google Calendar connects and disconnects from the Omark card next to OneDrive', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' } }, path: '/settings' });
  await omark(page).getByRole('button', { name: 'Connect Google Calendar' }).click();
  await poll(() => sessions(page)).toEqual({ microsoft: [], googlecal: [] });
  await omark(page).getByRole('button', { name: 'Disconnect' }).click();
  await poll(() => sessions(page)).toEqual({ microsoft: [] });
  await expect(omark(page).getByRole('button', { name: 'Connect Google Calendar' })).toBeVisible();
});

test('sign out ends every sign-in and goes back to the welcome screen', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } }, path: '/settings' });
  page.once('dialog', (d) => void d.accept());
  await omark(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Use Omark' })).toBeVisible();
  expect(await sessions(page)).toEqual({});
});

test('a part turned on offline shows at once and reaches the folder when it is back', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } }, path: '/settings' });
  const root = (on: boolean) =>
    page.evaluate((o) => (window as unknown as { __omarkFake: { root: { setOffline(o: boolean): void } } }).__omarkFake.root.setOffline(o), on);
  await root(true);
  await omark(page).getByRole('checkbox', { name: /Goals/ }).check();
  await expect(tabs(page).getByRole('link')).toHaveText(['Tasks', 'Goals']);
  await expect(omark(page).getByRole('status')).toContainText('Saved on this device');
  expect(await peek(page, 'root', 'config.yaml')).toBe('parts: [tasks]\n');
  await root(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await poll(() => peek(page, 'root', 'config.yaml')).toBe('parts: [tasks, goals]\n');
  await expect(omark(page).getByRole('status')).toHaveCount(0);
});
