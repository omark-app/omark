import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp } from './helpers';

// Issue #73: links in a title or notes open in a new tab (in the installed app, the default browser).
const TASKS = `# Tasks
- [ ] Read https://example.com/article today 📅 2026-10-16
- [ ] Book [the hut](https://hut.example.com/book) 📅 2026-10-16
    - map at https://maps.example.com/route
- [ ] Call mum 📅 2026-10-16
`;

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

async function start(page: Page) {
  // The links lead nowhere real: answer them here so the new tab loads.
  await page.context().route(/^https:\/\/[a-z.]*example\.com\//, (r) => r.fulfill({ contentType: 'text/html', body: '<p>linked page</p>' }));
  await openApp(page, { files: { 'tasks.md': TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

test('a link in a title opens in a new tab and leaves the task unselected', async ({ page, isMobile }) => {
  await start(page);
  const link = row(page, 'Read').getByRole('link', { name: 'https://example.com/article' });
  await expect(link).toHaveAttribute('href', 'https://example.com/article');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(row(page, 'Read')).toContainText('Read https://example.com/article today');
  const popup = page.waitForEvent('popup');
  if (isMobile) await link.tap();
  else await link.click();
  expect((await popup).url()).toBe('https://example.com/article');
  await expect(page.getByTestId('detail')).toHaveCount(0);
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('a Markdown link in a title shows its label', async ({ page }) => {
  await start(page);
  await expect(row(page, 'Book')).toContainText('Book the hut');
  await expect(row(page, 'Book').getByRole('link', { name: 'the hut' })).toHaveAttribute('href', 'https://hut.example.com/book');
});

test('the task shows the links in its title and notes, each opening in a new tab', async ({ page, isMobile }) => {
  await start(page);
  // Tap the title text, away from the link.
  const title = row(page, 'Book').locator('.title');
  if (isMobile) await title.tap({ position: { x: 4, y: 8 } });
  else await title.click({ position: { x: 4, y: 8 } });
  const box = page.getByTestId(isMobile ? 'sheet' : 'detail');
  const links = box.getByTestId('task-links').getByRole('link');
  await expect(links).toHaveText(['the hut', 'https://maps.example.com/route']);
  await expect(links.nth(1)).toHaveAttribute('target', '_blank');
  const popup = page.waitForEvent('popup');
  if (isMobile) await links.nth(1).tap();
  else await links.nth(1).click();
  expect((await popup).url()).toBe('https://maps.example.com/route');
});

test('a task without links shows no link list', async ({ page, isMobile }) => {
  await start(page);
  if (isMobile) await row(page, 'Call mum').tap();
  else await row(page, 'Call mum').click();
  await expect(page.getByTestId(isMobile ? 'sheet' : 'detail')).toBeVisible();
  await expect(page.getByTestId('task-links')).toHaveCount(0);
});
