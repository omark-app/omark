import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { colours, driveFile, event, EVENTS, firstRun, openTime, openView, PROJECTS } from './helpers';

// The seed (helpers): ACME on 1 and 20 October, an unknown ACMEE on 10 October, an untracked Lunch; today is 27 October.

const hoursOf = (page: Page, code: string) => page.getByTestId('project-hours').and(page.locator(`[data-code="${code}"]`));

test.describe('hours', () => {
  test('per project and category, for named and custom ranges', async ({ page }) => {
    await openTime(page);
    await firstRun(page);
    await openView(page, 'Hours');
    await expect(page.getByText('No tracked time in this range.')).toBeVisible();
    await page.getByRole('button', { name: 'Last month' }).click();
    await expect(page.getByTestId('range')).toHaveText('2026-09-01 – 2026-09-30');
    await expect(page.getByText('No tracked time in this range.')).toBeVisible();
    await page.getByRole('button', { name: 'This month' }).click();
    await expect(hoursOf(page, 'ACME')).toContainText('2 h');
    await expect(hoursOf(page, 'ACME')).toContainText('Coding');
    await expect(page.getByTestId('total-done')).toHaveText('2 h');
    await expect(page.getByRole('link', { name: '1 h with unknown codes' })).toBeVisible();
    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByLabel('From', { exact: true }).fill('2026-10-01');
    await page.getByLabel('To', { exact: true }).fill('2026-10-05');
    await expect(page.getByTestId('total-done')).toHaveText('1 h');
    await page.getByLabel('To', { exact: true }).fill('2026-09-01');
    await expect(page.getByRole('alert')).toHaveText('The first day must not be after the last');
    // No numbers for a range that isn't one.
    await expect(page.getByTestId('hours')).toHaveCount(0);
  });
});

test.describe('projects', () => {
  test('the fix list adds an unknown code as a project, and its event turns green', async ({ page }) => {
    await openTime(page, { edit: true });
    await firstRun(page);
    await page.getByRole('checkbox', { name: 'Colour my events' }).check();
    await expect.poll(() => colours(page)).toContain('typo:red');
    await openView(page, 'Fix list');
    await page.getByRole('button', { name: 'Add ACMEE as a project' }).click();
    await expect(page.getByLabel('Code')).toHaveValue('ACMEE');
    await page.getByLabel('Description').fill('The typo client');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('project').and(page.locator('[data-code="ACMEE"]'))).toContainText('The typo client');
    await expect(page.getByTestId('status')).toContainText('0 to fix');
    await expect.poll(() => colours(page)).toContain('typo:green');
    expect(await driveFile(page, 'projects.csv')).toContain('ACMEE,The typo client');
  });

  test('a code is read-only when editing; unknown columns stay', async ({ page }) => {
    await openTime(page, { files: { 'projects.csv': 'code,description,client,rate,currency,archived,notes\nACME,Acme,,,,,keep me\n' } });
    await firstRun(page);
    await openView(page, 'Projects');
    await page.getByTestId('project').getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Code')).toHaveAttribute('readonly', '');
    await page.getByLabel('Rate per hour').fill('120');
    await page.getByLabel('Currency').fill('eur');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('project')).toContainText('120 EUR/h');
    await expect.poll(() => driveFile(page, 'projects.csv')).toContain('ACME,Acme,,120,EUR,,keep me');
  });

  test('archive and unarchive; delete warns and offers to archive instead', async ({ page }) => {
    await openTime(page);
    await firstRun(page);
    await openView(page, 'Projects');
    await page.getByTestId('project').getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByTestId('archived')).toContainText('archived 2026-10-27');
    await expect(page.getByTestId('status')).toContainText('1 to fix'); // ACME is still known
    await page.getByTestId('archived').getByRole('button', { name: 'Unarchive' }).click();
    await expect(page.getByTestId('project')).toContainText('ACME');
    await page.getByTestId('project').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('delete-warning')).toContainText('Its events turn red');
    await page.getByRole('button', { name: 'Archive instead' }).click();
    await expect(page.getByTestId('archived')).toContainText('ACME');
    await page.getByTestId('archived').getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('delete-warning').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('archived')).toHaveCount(0);
    await expect(page.getByTestId('status')).toContainText('3 to fix');
  });
});

test.describe('fix list', () => {
  test('opens the event in Google Calendar, and lists overlapping days', async ({ page }) => {
    const link = 'https://www.google.com/calendar/event?eid=dHlwbw';
    const events = [
      ...EVENTS.map((e) => (e.id === 'typo' ? { ...e, htmlLink: link } : e)),
      event('clash', '2026-10-20', 'ACME; Meetings', { start: { dateTime: '2026-10-20T09:30:00+01:00' } }),
    ];
    await openTime(page, { events });
    await firstRun(page);
    await openView(page, 'Fix list');
    await expect(page.getByRole('link', { name: 'Open in Google Calendar' })).toHaveAttribute('href', link);
    await expect(page.getByTestId('overlap')).toContainText('2026-10-20');
    await expect(page.getByTestId('overlap')).toContainText('Meetings');
  });
});

test.describe('charts and report', () => {
  test('charts draw hours per week by project and by category', async ({ page }) => {
    await openTime(page);
    await firstRun(page);
    await openView(page, 'Charts');
    await expect(page.getByTestId('chart-projects').locator('svg rect')).toHaveCount(2);
    await page.getByTestId('chart-projects').getByText('As a table').click();
    await expect(page.getByTestId('chart-projects').getByTestId('chart-table')).toContainText('ACME');
    await expect(page.getByTestId('chart-categories')).toContainText('Coding');
  });

  test('a report downloads as Markdown and CSV', async ({ page }) => {
    await openTime(page, { files: { 'projects.csv': `${PROJECTS.trimEnd()}\n`.replace('ACME,Acme,,,,', 'ACME,Acme,Acme Corp,100,EUR,') } });
    await firstRun(page);
    await openView(page, 'Report');
    await page.getByRole('button', { name: 'This month' }).click();
    await page.getByLabel('Round each event up to').selectOption('15');
    await expect(page.getByTestId('report-hours')).toHaveText('2 h');
    await expect(page.getByTestId('report')).toContainText('200.00 EUR');
    const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Markdown' }).click()]);
    expect(md.suggestedFilename()).toBe('omark-time-ACME-2026-10-01-to-2026-10-31.md');
    const text = readFileSync((await md.path())!, 'utf8');
    expect(text).toContain('ACME');
    expect(text).toContain('200');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
    const lines = readFileSync((await csv.path())!, 'utf8').trim().split('\n');
    expect(lines[0]).toContain('date');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['2026-10-01', '2026-10-20']);
    // Unticking every project reports on none, not on all.
    await page.getByRole('checkbox', { name: 'ACME' }).uncheck();
    await expect(page.getByText('Pick a project to report on.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download CSV' })).toHaveCount(0);
  });

  test('settings keep unknown keys in config.yaml', async ({ page }) => {
    const config = 'calendars: [primary]\ntrack_from: 2026-01-01\nall_day_hours: 8\nweek_start: monday\ncolour_events: false\nmy_note: keep me # mine\n';
    await openTime(page, { files: { 'projects.csv': PROJECTS, 'config.yaml': config } });
    await firstRun(page);
    await page.getByLabel('Week starts on').selectOption('sunday');
    await expect.poll(() => driveFile(page, 'config.yaml')).toContain('week_start: sunday');
    expect(await driveFile(page, 'config.yaml')).toContain('my_note: keep me # mine');
  });
});

test('no screen makes a request outside the app', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.hostname !== 'localhost') outside.push(r.url());
  });
  await openTime(page);
  await firstRun(page);
  for (const view of ['Hours', 'Charts', 'Fix list', 'Projects', 'Report', 'Settings'] as const) {
    await openView(page, view);
    await expect(page.getByRole('link', { name: view, exact: false }).first()).toHaveAttribute('aria-current', 'page');
  }
  expect(outside).toEqual([]);
});
