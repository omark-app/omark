import { expect, test } from '@playwright/test';
import { authCalls, colours, editEvent, event, EVENTS, firstRun, openTime, PROJECTS, reload } from './helpers';

const patchCount = (page: import('@playwright/test').Page) => page.evaluate(() => window.__omarkTime!.calendar.patches.length);

test('with colouring off, nothing is written to the calendar', async ({ page }) => {
  await openTime(page, { edit: true });
  await firstRun(page);
  await editEvent(page, 'old', { title: 'ACMEE; now unknown' });
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByTestId('status')).toContainText('Synced');
  await page.getByRole('button', { name: 'Rebuild' }).click();
  await expect(page.getByTestId('status')).toContainText('Synced');
  await page.evaluate((p) => window.__omarkTime!.drive.externalWrite('projects.csv', `${p}ACMEE,Typo,,,,\n`), PROJECTS);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByTestId('status')).toContainText('0 to fix');
  expect(await patchCount(page)).toBe(0);
  expect(await colours(page)).toEqual([]);
});

test('turning colouring on asks for edit access and colours newest first', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  await page.getByRole('checkbox', { name: 'Colour my events' }).check();
  await expect.poll(() => colours(page)).toEqual(['new:green', 'old:green', 'typo:red']);
  expect(await authCalls(page)).toEqual(['addAccess:drive', 'addAccess:edit']);
  expect(await page.evaluate(() => window.__omarkTime!.calendar.patches.map((p) => p.eventId))).toEqual(['new', 'typo', 'old']);
});

test('colouring carries on after a reload', async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, i) => event(`e${String(i).padStart(2, '0')}`, `2026-10-${String(i + 1).padStart(2, '0')}`));
  await openTime(page, { edit: true, events: many });
  await firstRun(page);
  // The third patch never answers, as if the page were closed while it was in flight.
  await page.evaluate(() => {
    const calendar = window.__omarkTime!.calendar;
    const setColour = calendar.setColour.bind(calendar);
    let n = 0;
    calendar.setColour = (...args) => (++n > 2 ? new Promise(() => {}) : setColour(...args));
  });
  await page.getByRole('checkbox', { name: 'Colour my events' }).check();
  await expect.poll(() => colours(page)).toHaveLength(2);
  await reload(page);
  await expect.poll(() => colours(page)).toHaveLength(12);
  // Only what was left: the two sent before the reload are not sent again.
  expect(await patchCount(page)).toBe(10);
});

test('a device without edit access says so and colours nothing until given it', async ({ page }) => {
  // Another device turned colouring on; this device's sign-in is read-only.
  const config = 'calendars: [primary]\ntrack_from: 2026-01-01\nall_day_hours: 8\nweek_start: monday\ncolour_events: true\n';
  await openTime(page, { files: { 'projects.csv': PROJECTS, 'config.yaml': config } });
  await firstRun(page);
  await expect(page.getByRole('heading', { name: 'Colouring needs edit access' })).toBeVisible();
  expect(await colours(page)).toEqual([]);
  await page.getByRole('button', { name: 'Give edit access' }).click();
  await expect.poll(() => colours(page)).toEqual(['new:green', 'old:green', 'typo:red']);
  await expect(page.getByRole('heading', { name: 'Colouring needs edit access' })).toHaveCount(0);
});

test('turning colouring off offers to clear the colours it set, and leaves the user\'s own', async ({ page }) => {
  await openTime(page, { edit: true, events: [...EVENTS, event('gym', '2026-10-05', 'Gym', { colorId: '5' })] });
  await firstRun(page);
  await page.getByRole('checkbox', { name: 'Colour my events' }).check();
  await expect.poll(() => colours(page)).toEqual(['gym:null', 'new:green', 'old:green', 'typo:red']);
  await page.getByRole('checkbox', { name: 'Colour my events' }).uncheck();
  await expect(page.getByRole('heading', { name: 'Clear the colours Omark Time set?' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear them' }).click();
  await expect.poll(() => colours(page)).toEqual(['gym:null']);
});
