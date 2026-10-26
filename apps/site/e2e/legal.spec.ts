import { test, expect } from '@playwright/test';
import { PAGES, expectNoSideScroll } from './pages';

// Hosts a page may link to. Add one only when a page genuinely needs it.
const ALLOWED_HOSTS = [
  'omark.app',
  'github.com',
  'developers.google.com',
  'policies.google.com',
  'www.microsoft.com',
  'myaccount.google.com',
  'account.live.com',
  'opensource.org',
  'www.cloudflare.com', // Cloudflare's privacy policy, linked from ours.
];

for (const path of PAGES) {
  test(`footer on ${path}`, async ({ page }) => {
    await page.goto(path);
    const footer = page.locator('footer.site-footer');
    await expect(footer.locator('a[href="/privacy/"]')).toHaveCount(1);
    await expect(footer.locator('a[href="/terms/"]')).toHaveCount(1);
    await expect(footer.locator('a[href="mailto:hello@omark.app"]')).toHaveCount(1);
    await expect(footer.locator('a', { hasText: 'MIT' })).toHaveCount(1);
    await expectNoSideScroll(page);
  });

  test(`no dead links on ${path}`, async ({ page }) => {
    await page.goto(path);
    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      if (href.startsWith('#')) {
        await expect(page.locator(`[id="${href.slice(1)}"]`), `anchor ${href}`).toHaveCount(1);
      } else if (href.startsWith('/')) {
        const response = await page.request.get(href);
        expect(response.status(), href).toBe(200);
      } else if (href.startsWith('mailto:')) {
        expect(href).toBe('mailto:hello@omark.app');
      } else {
        const url = new URL(href);
        expect(url.protocol, href).toBe('https:');
        expect(ALLOWED_HOSTS, href).toContain(url.host);
      }
    }
  });
}

test('privacy lists every scope', async ({ page }) => {
  await page.goto('/privacy/');
  const text = await page.locator('main').innerText();
  for (const scope of [
    'Files.ReadWrite.AppFolder',
    'offline_access',
    'drive.file',
    'openid',
    'calendar.calendarlist.readonly',
    'calendar.events.owned.readonly',
    'calendar.events.owned',
  ]) {
    expect(text, scope).toContain(scope);
  }
  const google = page.locator('section#google');
  await expect(google).toContainText('Limited Use');
  await expect(google.locator('a[href="https://developers.google.com/terms/api-services-user-data-policy"]')).not.toHaveCount(0);
  await expectNoSideScroll(page);
});

test('privacy says no data on our servers and one sign-in cookie', async ({ page }) => {
  await page.goto('/privacy/');
  const main = page.locator('main');
  await expect(main).toContainText("We don't store your data on our servers");
  await expect(main).toContainText('sign-in cookie');
});

test('privacy and terms show a date', async ({ page }) => {
  for (const path of ['/privacy/', '/terms/']) {
    await page.goto(path);
    await expect(page.locator('time[datetime]'), path).toHaveCount(1);
    await expect(page.locator('time[datetime]')).toHaveAttribute('datetime', '2026-10-26');
  }
});

test('terms headings', async ({ page }) => {
  await page.goto('/terms/');
  const titles = (await page.locator('main h2').allTextContents()).map((t) => t.trim());
  for (const title of ['Your data', 'No warranty', 'Limitation of liability', 'Governing law']) {
    expect(titles, title).toContain(title);
  }
  await expectNoSideScroll(page);
});

test('long scope names wrap on a 320 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/privacy/', '/terms/']) {
    await page.goto(path);
    await expectNoSideScroll(page);
  }
});

// Cloudflare Pages serves 404.html with status 404 for any path it can't find.
// Vite preview (appType 'mpa') gives the 404 status but not that page, so the page is checked on its own.
test('404 page', async ({ page }) => {
  expect((await page.request.get('/does-not-exist')).status()).toBe(404);
  await page.goto('/404.html');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main a[href="/"]')).toHaveCount(1);
  await expect(page.locator('footer.site-footer')).toBeVisible();
  await expectNoSideScroll(page);
});
