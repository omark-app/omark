import { test, expect } from '@playwright/test';
import { expectNoSideScroll } from './pages';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the sections in order', async ({ page }) => {
  const titles = (await page.locator('main h2').allTextContents()).map((t) => t.trim());
  expect(titles).toEqual(['Omark Tasks', 'Omark Time', 'Omark Goals', 'How to start', 'Where your data lives', 'Principles', 'Open source']);
  await expect(page.locator('h1')).toContainText('plain files');
  await expectNoSideScroll(page);
});

// Each part opens at its own path in the one app (live since the cutover, 3.6) and in the demo world (Maya).
for (const [name, path] of [['Omark Tasks', 'tasks'], ['Omark Time', 'time'], ['Omark Goals', 'goals']] as const) {
  test(`links ${name} to its part of the app and of the demo`, async ({ page }) => {
    const card = page.locator('.card').filter({ has: page.locator('h2', { hasText: name }) });
    await expect(card.locator('.button.coming')).toHaveCount(0);
    await expect(card.locator('a')).toHaveCount(2);
    await expect(card.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute('href', `https://app.omark.app/${path}`);
    await expect(card.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', `https://demo.omark.app/${path}`);
  });
}

test('shows the Omark mark and the three app icons', async ({ page }) => {
  await expect(page.locator('.brand .brand-icon')).toHaveCount(1);
  await expect(page.locator('.brand .brand-icon')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.brand .wordmark')).toHaveText('Omark');
  const icons = page.locator('img.brand-icon, img.app-icon');
  await expect(icons).toHaveCount(4);
  const srcs = await icons.evaluateAll((imgs) => imgs.map((i) => new URL((i as HTMLImageElement).src).pathname));
  expect(srcs).toEqual(['/img/icon-omark.svg', '/img/icon-tasks.svg', '/img/icon-time.svg', '/img/icon-goals.svg']);
  await expect
    .poll(() => icons.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
});

test('serves the Tasks screenshot as a small WebP', async ({ page }) => {
  const shot = page.locator('img.shot');
  await expect(shot).toHaveAttribute('width', '600');
  const { src, natural } = await shot.evaluate((img: HTMLImageElement) => ({ src: img.currentSrc, natural: img.naturalWidth }));
  expect(src).toMatch(/\.webp$/);
  expect(natural).toBe(600);
});

// The page speaks of AI agents; Google's review read that as Omark sending data to AI (2026-11). Say it doesn't.
test('says Omark itself has no AI', async ({ page }) => {
  await page.goto('/');
  const lead = page.locator('.lead');
  await expect(lead).not.toContainText('for people and their AI agents');
  await expect(lead).toContainText('Omark itself has no AI');
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /for people and their AI agents/);
  await expect(page.locator('#principles a[href="/privacy/#ai"]')).toHaveCount(1);
});

// The repository went public at 4.3 (#125): the site links it instead of promising it.
const REPO = 'https://github.com/omark-app/omark';
test('links the code, the contributor guide and the principles on GitHub', async ({ page }) => {
  const open = page.locator('#open-source');
  await expect(open.getByRole('link', { name: 'Code on GitHub' })).toHaveAttribute('href', REPO);
  await expect(open.getByRole('link', { name: 'How to contribute' })).toHaveAttribute('href', `${REPO}/blob/main/CONTRIBUTING.md`);
  await expect(page.locator('#principles').getByRole('link', { name: 'PHILOSOPHY.md' })).toHaveAttribute('href', `${REPO}/blob/main/PHILOSOPHY.md`);
  await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', REPO);
  await expect(page.locator('main')).not.toContainText('at launch');
});

// The walkthrough film (#130): beside the headline on wide screens, under the intro on phones. It plays from
// omark.app itself, and nothing but its still loads until the visitor presses play.
test('shows the walkthrough film in the hero, under the intro on phones', async ({ page }, testInfo) => {
  const film = page.locator('.hero figure.film');
  await expect(film).toHaveCount(1);
  await expect(film.locator('figcaption')).toHaveText('A 40-second tour of the demo: Tasks, Time and Goals.');
  const h1 = (await page.locator('h1').boundingBox())!;
  const lead = (await page.locator('.lead').boundingBox())!;
  const box = (await film.boundingBox())!;
  const card = (await page.locator('.card').first().boundingBox())!;
  if (testInfo.project.name === 'desktop') {
    expect(box.x).toBeGreaterThan(h1.x + h1.width - 1);
    expect(box.y).toBeLessThan(lead.y + lead.height);
  } else {
    expect(box.y).toBeGreaterThan(lead.y + lead.height - 1);
  }
  expect(box.y + box.height).toBeLessThan(card.y);
  await expectNoSideScroll(page);
});

// WebKit opens a request for the film and cancels it at once, so the test counts the bytes, not the requests.
test('downloads none of the film until play, and serves it and its still from the site', async ({ page, request }) => {
  let filmBytes = 0;
  page.on('requestfinished', async (r) => {
    if (r.url().endsWith('.mp4')) filmBytes += (await r.sizes()).responseBodySize;
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const video = page.locator('.hero video');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toHaveAttribute('playsinline', '');
  const poster = new URL((await video.getAttribute('poster'))!, page.url());
  const source = new URL((await video.locator('source').getAttribute('src'))!, page.url());
  await expect(video.locator('source')).toHaveAttribute('type', 'video/mp4');
  expect(poster.origin).toBe(new URL(page.url()).origin);
  expect(source.origin).toBe(new URL(page.url()).origin);
  expect(filmBytes).toBe(0);
  const still = await request.get(poster.href);
  expect(still.ok()).toBe(true);
  expect(still.headers()['content-type']).toBe('image/webp');
  const mp4 = await request.get(source.href);
  expect(mp4.ok()).toBe(true);
  expect(mp4.headers()['content-type']).toBe('video/mp4');
});
