import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CalendarEvent, CalendarInfo } from '@omark/calendar';
import type { FakeSeed } from '../src/lib/fake.ts';

/** Today in the tests: the browser clock is fixed here. */
export const NOW = '2026-10-27T12:00:00Z';

export const CALENDARS: CalendarInfo[] = [
  { id: 'primary', name: 'Me', primary: true, timeZone: 'Europe/Warsaw', owned: true },
  { id: 'work@example.com', name: 'Work', primary: false, timeZone: 'Europe/Warsaw', owned: true },
];

export const PROJECTS = 'code,description,client,rate,currency,archived\nACME,Acme,,,,\n';

export function event(id: string, date: string, title = 'ACME; Coding', extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
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
    ...extra,
  };
}

/** Three tracked events (one with an unknown code) and an untracked one, oldest to newest. */
export const EVENTS: CalendarEvent[] = [
  event('old', '2026-10-01'),
  event('typo', '2026-10-10', 'ACMEE; Coding'),
  event('lunch', '2026-10-15', 'Lunch'),
  event('new', '2026-10-20'),
];

/** Opens the fake build with the clock fixed at NOW and the fake calendar and drive seeded. */
export async function openTime(page: Page, seed: FakeSeed = {}): Promise<void> {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript((s) => {
    (window as unknown as { __OMARK_TIME_SEED__: FakeSeed }).__OMARK_TIME_SEED__ = s;
  }, { calendars: CALENDARS, events: EVENTS, files: { 'projects.csv': PROJECTS }, ...seed });
  await page.goto('/');
  await page.waitForFunction(() => window.__omarkTime !== undefined);
}

/** Opens a view through the navigation (a side bar on the desktop, a bottom bar on the phone). */
export async function openView(page: Page, name: 'Hours' | 'Charts' | 'Fix list' | 'Projects' | 'Report' | 'Settings'): Promise<void> {
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name, exact: false }).first().click();
}

/**
 * The first run's storage step: Google Drive. Inside the one Omark app (its playwright.time.config.ts) the
 * storage is the app's, so Time starts at the calendars and there is nothing to click. True when Time chose it.
 */
export async function chooseStorage(page: Page): Promise<boolean> {
  const drive = page.getByRole('button', { name: 'Google Drive' });
  await expect(drive.or(page.getByRole('checkbox', { name: 'Me' })).first()).toBeVisible();
  if (!(await drive.isVisible())) return false;
  await drive.click();
  return true;
}

/**
 * Goes through the first run: Google Drive, the primary calendar, Start; waits for the first sync, then opens
 * Settings, where the calendars, colouring, Rebuild and the row count are. True when Time chose its own storage
 * (and so asked for Drive access).
 */
export async function firstRun(page: Page): Promise<boolean> {
  const own = await chooseStorage(page);
  await expect(page.getByRole('checkbox', { name: 'Me' })).toBeChecked();
  await page.getByRole('button', { name: 'Start' }).click();
  // The first sync reads everything and writes three files; WebKit under a full parallel run needs more than 5 s.
  await expect(page.getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
  await openView(page, 'Settings');
  return own;
}

export function driveFile(page: Page, name: string): Promise<string | null> {
  return page.evaluate((n) => window.__omarkTime!.drive.peek(n), name);
}

/** Event ids of a year file's rows, in file order. */
export async function rowIds(page: Page, year = '2026'): Promise<string[]> {
  const text = (await driveFile(page, `events-${year}.csv`)) ?? '';
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(',').at(-1)!);
}

/** Changes the fake calendar as the user would in Google Calendar, and keeps it across reloads. */
export async function editEvent(page: Page, id: string, changes: Partial<CalendarEvent>): Promise<void> {
  await page.evaluate(
    async ([eventId, c]) => {
      window.__omarkTime!.calendar.edit('primary', eventId, c);
      await window.__omarkTime!.persist();
    },
    [id, changes] as const,
  );
}

/** Every colour the fake calendar holds, as `id:marker` for the events that have one. */
export function colours(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window
      .__omarkTime!.calendar.toJSON()
      .events.filter((e) => e.colorId !== null || e.marker !== null)
      .map((e) => `${e.id}:${e.marker}`)
      .sort(),
  );
}

export function authCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => [...window.__omarkTime!.auth.calls]);
}

/** Reloads and waits until the fake build has set up its fake calendar and drive again. */
export async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => window.__omarkTime !== undefined);
}
