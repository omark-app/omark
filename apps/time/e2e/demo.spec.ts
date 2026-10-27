import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The demo build (playwright.config.ts's second server). The seed is two weeks around today, so the browser
// clock is fixed: Tuesday 27 October 2026, in Warsaw.
test.use({ baseURL: `http://localhost:${process.env.TIME_DEMO_PORT}`, timezoneId: 'Europe/Warsaw' });

const NOW = new Date('2026-10-27T12:00:00+01:00');

async function openDemo(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(page.getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
}

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name, exact: false }).first().click();

test('the demo opens on Hours with no sign-in, and says DEMO', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toContainText('DEMO');
  await expect(page.getByRole('link', { name: 'Use it for real' })).toHaveAttribute('href', 'https://example.test/real');
  await page.getByRole('button', { name: 'Last week' }).click();
  await expect(page.getByTestId('project-hours').first()).toBeVisible();
  await expect(page.getByTestId('total-done')).not.toHaveText('0 h');
});

test('the fix list has the red event and an overlap; the calendar shows it red, then green once it is a project', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Fix list');
  await expect(page.getByTestId('unknown').and(page.locator('[data-code="ACMEE"]'))).toBeVisible();
  await expect(page.getByTestId('overlap').first()).toBeVisible();

  // The seed's sixth work day (Monday the 26th) has the typo; the fifth (Friday the 23rd) is last week.
  await nav(page, 'Calendar');
  const typo = page.getByTestId('event').filter({ hasText: 'ACMEE; Coding; typo' });
  await expect(typo).toHaveAttribute('data-colour', 'red');
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByTestId('event').filter({ hasText: 'ACME; Coding; Checkout page' })).toHaveAttribute('data-colour', 'green');

  await nav(page, 'Fix list');
  await page.getByRole('button', { name: 'Add ACMEE as a project' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('project').and(page.locator('[data-code="ACMEE"]'))).toBeVisible();
  await nav(page, 'Calendar');
  await expect(page.getByTestId('event').filter({ hasText: 'ACMEE; Coding; typo' })).toHaveAttribute('data-colour', 'green');
});

test('Reset demo brings the seed back after an edit and a reload', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Projects');
  await page.getByTestId('project').and(page.locator('[data-code="ACME"]')).getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByTestId('archived').and(page.locator('[data-code="ACME"]'))).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('archived').and(page.locator('[data-code="ACME"]'))).toBeVisible();
  page.once('dialog', (d) => d.accept());
  // Reset reloads the page: wait for the new one, not the old one's status.
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Reset demo' }).click()]);
  await expect(page.getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
  await nav(page, 'Projects');
  await expect(page.getByTestId('project').and(page.locator('[data-code="ACME"]'))).toBeVisible();
});

test('every request goes to the demo origin, and none to /api/', async ({ page, baseURL }) => {
  const demo = new URL(baseURL!).origin;
  const stray: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['http:', 'https:'].includes(u.protocol)) return;
    if (u.origin !== demo || u.pathname.startsWith('/api/')) stray.push(r.url());
  });
  await openDemo(page);
  for (const view of ['Charts', 'Fix list', 'Projects', 'Report', 'Calendar', 'Settings', 'Hours']) {
    await nav(page, view);
    await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: view, exact: false }).first()).toHaveAttribute('aria-current', 'page');
  }
  await page.reload();
  await expect(page.getByTestId('status')).toContainText('Synced', { timeout: 20_000 });
  expect(stray).toEqual([]);
});

test('the demo bundle has no Google and no sign-in path', async ({ request }) => {
  // The entry scripts, plus every JS file the service worker precaches (all the JS the build ships), plus the
  // service worker itself, as in apps/tasks' demo spec.
  const html = await (await request.get('/')).text();
  const entries = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]!);
  expect(entries.length).toBeGreaterThan(0);
  const sw = await (await request.get('/sw.js')).text();
  const precached = [...sw.matchAll(/url:\s*"([^"]+\.js)"/g)].map((m) => `/${m[1]!}`);
  expect(precached.length).toBeGreaterThan(0);
  for (const src of new Set([...entries, ...precached, '/sw.js'])) {
    const res = await request.get(src);
    // A missing file would come back as the app's index.html and pass unread.
    expect(res.headers()['content-type'], `${src} is JavaScript`).toContain('javascript');
    const js = await res.text();
    expect(js.includes('googleapis.com'), `${src} contains googleapis.com`).toBe(false);
    expect(js.includes('api/auth'), `${src} contains api/auth`).toBe(false);
  }
});
