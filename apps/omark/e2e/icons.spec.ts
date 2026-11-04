import { test, expect } from '@playwright/test';

// The one app's own icons and manifest: what app.omark.app installs. Tasks' icons.spec.ts checks the standalone
// build, which no host serves and CI no longer runs (#132).

test('manifest names Omark, opens standalone, and lists 192, 512 and a maskable 512', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('Omark');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toEqual([
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
});

const LINKS: [string, string][] = [
  ['link[rel="icon"][type="image/svg+xml"]', '/icons/favicon.svg'],
  ['link[rel="icon"][sizes="32x32"]', '/icons/favicon-32.png'],
  ['link[rel="apple-touch-icon"]', '/icons/apple-touch-icon.png'],
];

test('page is titled Omark and links the favicons and the apple-touch-icon', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Omark');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Omark');
  for (const [selector, href] of LINKS) {
    await expect(page.locator(selector)).toHaveAttribute('href', href);
  }
});

test('every icon answers with an image', async ({ page, request }) => {
  await page.goto('/');
  const urls = [...LINKS.map(([, href]) => href), '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-512-maskable.png'];
  for (const url of urls) {
    const res = await request.get(new URL(url, page.url()).toString());
    expect(res.status(), url).toBe(200);
    // vite preview answers a missing file with index.html and 200, so check the type too.
    expect(res.headers()['content-type'], url).toMatch(/^image\//);
  }
});
