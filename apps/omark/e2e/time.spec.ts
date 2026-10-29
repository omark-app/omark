import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Omark Time inside the one app (roadmap U.4): its calendar sign-in, asked only once Time is on, and its files
// in `time/` with projects.csv at the top. The fake storage has a folder per part; Time reads its fake calendar.

type Folder = 'root' | 'tasks' | 'time' | 'goals';
type Seed = Partial<Record<Folder, Record<string, string>>>;

const CALENDARS = [{ id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true }];
const event = (id: string, date: string, title = 'ACME; Coding') => ({
  calendarId: 'primary',
  id,
  status: 'confirmed',
  title,
  start: { dateTime: `${date}T09:00:00+01:00` },
  end: { dateTime: `${date}T10:00:00+01:00` },
  response: null,
  colorId: null,
  marker: null,
  recurringEventId: null,
  htmlLink: null,
});
const PROJECTS = 'code,description,client,rate,currency,archived\nACME,Acme,,,,\n';

async function open(page: Page, opts: { seed?: Seed; signedOut?: boolean; path?: string } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00Z'));
  await page.addInitScript(
    ([seed, signedOut, calendars, events]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__OMARK_SEED__ = seed;
      if (signedOut) w.__OMARK_SIGNED_OUT__ = true;
      w.__OMARK_TIME_SEED__ = { calendars, events };
    },
    [opts.seed ?? {}, opts.signedOut ?? false, CALENDARS, [event('one', '2026-10-20'), event('two', '2026-10-21')]] as const,
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
const sessions = (page: Page) =>
  page.evaluate(() => Object.fromEntries((window as unknown as { __omarkSessions: Map<string, string[]> }).__omarkSessions));
const signIns = (page: Page) => page.evaluate(() => (window as unknown as { __omarkSignIns: unknown[] }).__omarkSignIns);
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Parts' });

/** Connects the calendar from the Time tab, picks the primary one and waits for the first sync. */
async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect Google Calendar' }).click();
  await expect(page.getByRole('checkbox', { name: 'Me' })).toBeChecked();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.time-part').getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
}

test('Tasks alone never asks about the calendar or loads Time', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n' } } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await expect(page.getByRole('button', { name: /calendar/i })).toHaveCount(0);
  expect(await signIns(page)).toEqual([]);
  expect(await sessions(page)).toEqual({ microsoft: [] });
  expect(scripts.some((s) => /TimePart|Charts|time/i.test(s.split('/').at(-1)!))).toBe(false);
  // Time's fake calendar is set up only by Time's code.
  expect(await page.evaluate(() => '__omarkTime' in window)).toBe(false);
});

test('turning Time on next to OneDrive: a calendar-only Google sign-in beside Microsoft, files in time/ and projects.csv at the top', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks]\n', 'projects.csv': PROJECTS } }, path: '/time' });
  await page.getByRole('button', { name: 'Turn on Omark Time' }).click();
  await expect(tabs(page).getByRole('link')).toHaveText(['Tasks', 'Time']);
  // Nothing about the calendar was asked until Time showed.
  expect(await signIns(page)).toEqual([]);
  await connect(page);
  expect(await signIns(page)).toEqual([{ provider: 'googlecal', returnTo: '/time' }]);
  expect(await sessions(page)).toEqual({ microsoft: [], googlecal: [] });

  await expect.poll(() => files(page, 'time')).toEqual(expect.arrayContaining(['config.yaml', 'events-2026.csv']));
  expect(await files(page, 'time')).not.toContain('projects.csv');
  expect(await peek(page, 'time', 'config.yaml')).toContain('calendars: [primary]');
  expect(await peek(page, 'time', 'events-2026.csv')).toContain('ACME');
  expect(await peek(page, 'root', 'projects.csv')).toBe(PROJECTS);
  expect(await peek(page, 'root', 'config.yaml')).toBe('parts: [tasks, time]\n');
  // Time's own sign-out and folder picker are the shell's (U.5): not offered here.
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Settings', exact: false }).first().click();
  await expect(page.getByTestId('storage')).toHaveText('In OneDrive');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('on Google Drive the calendar is added to the same Google sign-in', async ({ page }) => {
  await open(page, { signedOut: true, seed: { root: { 'config.yaml': 'parts: [tasks, time]\n' } } });
  await page.getByRole('button', { name: 'Use Omark' }).click();
  await page.getByRole('button', { name: 'Google Drive' }).click();
  await tabs(page).getByRole('link', { name: 'Time' }).click();
  await connect(page);
  expect(await signIns(page)).toEqual([
    { provider: 'google', returnTo: '/' },
    { provider: 'google', add: 'calendar', returnTo: '/time' },
  ]);
  expect(await sessions(page)).toEqual({ google: ['calendar'] });
  await expect.poll(() => files(page, 'time')).toContain('events-2026.csv');
});

test("on a phone, Time's own view bar sits just above the shell's tabs", async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the bars are at the bottom only on a phone');
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n', 'projects.csv': PROJECTS } }, path: '/time' });
  await connect(page);
  const views = (await page.getByRole('navigation', { name: 'Views' }).boundingBox())!;
  const parts = (await tabs(page).boundingBox())!;
  expect(Math.abs(views.y + views.height - parts.y)).toBeLessThanOrEqual(1);
});

test('switching tabs keeps Time where it was', async ({ page }) => {
  await open(page, { seed: { root: { 'config.yaml': 'parts: [tasks, time]\n', 'projects.csv': PROJECTS } }, path: '/time' });
  await connect(page);
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Projects', exact: false }).first().click();
  await expect(page).toHaveURL(/\/time/);
  const projects = page.getByText('Acme').first();
  await expect(projects).toBeVisible();
  await tabs(page).getByRole('link', { name: 'Tasks' }).click();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await tabs(page).getByRole('link', { name: 'Time' }).click();
  await expect(projects).toBeVisible();
  // One calendar sign-in, not one per visit.
  expect(await signIns(page)).toEqual([{ provider: 'googlecal', returnTo: '/time' }]);
});
