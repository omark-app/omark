import { test, expect } from '@playwright/test';
import { PAGES, expectNoSideScroll } from './pages';

// Hosts a page may link to. Add one only when a page genuinely needs it.
const ALLOWED_HOSTS = [
  'omark.app',
  'demo.omark.app',
  'app.omark.app',
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

  test(`favicon on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
    const response = await page.request.get('/favicon.svg');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
  });

  test(`Omark logo on ${path}`, async ({ page }) => {
    await page.goto(path);
    const logo = page.locator('.site-header img.brand-icon');
    await expect(logo).toHaveAttribute('src', '/img/icon-omark.svg');
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
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
  // Exact code texts, so a scope that is a prefix of another (calendar.events.owned) can fail on its own.
  const codes = (await page.locator('main code').allTextContents()).map((t) => t.trim());
  for (const scope of [
    'Files.ReadWrite.AppFolder',
    'offline_access',
    'drive.file',
    'openid',
    'calendar.calendarlist.readonly',
    'calendar.events.owned.readonly',
    'calendar.events.owned',
  ]) {
    expect(codes, scope).toContain(scope);
  }
  const google = page.locator('section#google');
  await expect(google).toContainText(
    "Omark's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
  );
  await expect(google.locator('a[href="https://developers.google.com/terms/api-services-user-data-policy"]')).not.toHaveCount(0);
  // The policy Google's reviewers cite for Drive and Calendar data.
  await expect(google.locator('a[href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy"]')).toHaveCount(1);
  await expect(google).toContainText('the storage you picked (your Google Drive, OneDrive or a folder on your device), and nowhere else');
  await expectNoSideScroll(page);
});

test('privacy describes the one app and its folders', async ({ page }) => {
  await page.goto('/privacy/');
  const codes = (await page.locator('main code').allTextContents()).map((t) => t.trim());
  for (const folder of ['OneDrive/Apps/Omark', 'My Drive/Omark']) expect(codes, folder).toContain(folder);
  const main = page.locator('main');
  for (const old of ['Omark Tasks', 'Omark Time']) {
    await expect(main).not.toContainText(`My Drive/${old}`);
    await expect(main).not.toContainText(`OneDrive/Apps/${old}`);
  }
  expect(codes).toContain('Omark Staging');
});

// Google's review asked whether Google user data reaches any AI service (2026-11). It doesn't, and the policy says so.
test('privacy says Omark has no AI and sends nothing to AI services', async ({ page }) => {
  await page.goto('/privacy/');
  const ai = page.locator('section#ai');
  await expect(ai.locator('h2')).toHaveText('AI');
  await expect(ai).toContainText('Omark has no AI or machine learning features');
  await expect(ai).toContainText('never sends your data, including data from Google APIs, to an AI or machine learning service');
  await expect(ai).toContainText('to train, improve or run AI or machine learning models');
  await expect(page.locator('section#summary')).toContainText('No AI');
});

test('privacy says no data on our servers and one sign-in cookie', async ({ page }) => {
  await page.goto('/privacy/');
  const main = page.locator('main');
  await expect(main).toContainText("We don't store your data on our servers");
  await expect(main).toContainText('sign-in cookie');
});

test('privacy and terms show a date', async ({ page }) => {
  for (const [path, date] of [['/privacy/', '2026-11-02'], ['/terms/', '2026-10-26']] as const) {
    await page.goto(path);
    await expect(page.locator('time[datetime]'), path).toHaveCount(1);
    await expect(page.locator('time[datetime]')).toHaveAttribute('datetime', date);
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
