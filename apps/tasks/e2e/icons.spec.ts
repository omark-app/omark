import { test, expect } from '@playwright/test';

test('manifest lists 192, 512 and a maskable 512', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href!, page.url()).toString());
  const manifest = await res.json();
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

test('page links the favicons and the apple-touch-icon', async ({ page }) => {
  await page.goto('/');
  for (const [selector, href] of LINKS) {
    await expect(page.locator(selector)).toHaveAttribute('href', href);
  }
});

test('every icon answers with an image', async ({ page, request }) => {
  await page.goto('/');
  const urls = [
    ...LINKS.map(([, href]) => href),
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-512-maskable.png',
  ];
  for (const url of urls) {
    const res = await request.get(new URL(url, page.url()).toString());
    expect(res.status(), url).toBe(200);
    expect(res.headers()['content-type'], url).toMatch(/^image\//);
  }
});
