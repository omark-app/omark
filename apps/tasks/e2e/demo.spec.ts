import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { demoPort } from './port';

// The demo build (VITE_STORAGE=demo), served by playwright.config.ts's second web server. Each test has a
// fresh browser context, so it starts on a new IndexedDB with the sample files.
const DEMO = `http://localhost:${demoPort(process.cwd(), process.env)}`;
test.use({ baseURL: DEMO });

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const sheet = (page: Page) => page.getByTestId('sheet');

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(row(page, 'Call the dentist about the crown')).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('saved');
}

/** A file on the demo drive, read straight from its IndexedDB database (null if missing). */
function demoFile(page: Page, name: string): Promise<string | null> {
  return page.evaluate(
    (n) =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('omark-demo:drive');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('files').objectStore('files').get(n);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            resolve((get.result as { text: string } | undefined)?.text ?? null);
          };
        };
      }),
    name,
  );
}

async function addTask(page: Page, isMobile: boolean, title: string): Promise<void> {
  if (isMobile) {
    await page.getByTestId('fab').tap();
    await sheet(page).getByLabel('New task').fill(title);
    await sheet(page).getByRole('button', { name: 'Add', exact: true }).tap();
  } else {
    await page.getByTestId('add-input').fill(title);
    await page.getByTestId('add-input').press('Enter');
  }
  await expect(row(page, title)).toHaveCount(1);
}

async function addNote(page: Page, isMobile: boolean, title: string, note: string): Promise<void> {
  if (isMobile) {
    await row(page, title).tap();
    await sheet(page).getByLabel('Notes').fill(note);
    await sheet(page).getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(sheet(page)).toHaveCount(0);
  } else {
    await row(page, title).click();
    await page.getByTestId('detail-notes').fill(note);
    await page.getByTestId('detail-notes').press('Control+Enter');
  }
}

test('opens on the sample tasks, with no sign-in', async ({ page }) => {
  await open(page);
  await expect(row(page, 'Send the invoice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toHaveCount(0);
  await expect(page.getByTestId('sync-banner')).toHaveCount(0);
});

test('an added task, a completion and a note survive a reload', async ({ page, isMobile }) => {
  await open(page);
  await addTask(page, isMobile, 'Buy stamps');
  await row(page, 'Send the invoice').getByTestId('task-check').click();
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await addNote(page, isMobile, 'Pick up the dry cleaning', 'the blue coat');
  await expect.poll(() => demoFile(page, 'tasks.md')).toContain('    - the blue coat\n');
  expect(await demoFile(page, 'tasks.md')).toContain('- [ ] Buy stamps');
  expect(await demoFile(page, 'tasks.md')).not.toContain('Send the invoice');
  await expect.poll(() => demoFile(page, 'done.md')).toContain('- [x] Send the invoice');

  await page.reload();
  await expect(row(page, 'Buy stamps')).toHaveCount(1);
  await expect(row(page, 'Send the invoice')).toHaveCount(0);
  await expect(row(page, 'Pick up the dry cleaning')).toContainText('≡');
  await expect(row(page, 'Call the dentist about the crown')).toHaveCount(1);
});

test('the footer says DEMO and offers Reset demo and Use it for real', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('env-label')).toHaveText('DEMO');
  await expect(page.getByTestId('reset-demo')).toHaveText('Reset demo');
  await expect(page.getByTestId('reset-demo')).toBeVisible();
  await expect(page.getByTestId('real-use')).toHaveText('Use it for real');
  await expect(page.getByTestId('real-use')).toHaveAttribute('href', 'https://example.test/real');
  await expect(page.getByTestId('real-use')).toBeVisible();
  // Nothing sticks out past the right edge (the phone has the least room).
  const width = page.viewportSize()!.width;
  for (const id of ['env-label', 'reset-demo', 'real-use', 'build']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

test('Reset demo asks first; dismissed it changes nothing, accepted it brings back the samples', async ({ page, isMobile }) => {
  await open(page);
  const samples = { tasks: await demoFile(page, 'tasks.md'), done: await demoFile(page, 'done.md') };
  expect(samples.tasks).toContain('Call the dentist about the crown');
  await addTask(page, isMobile, 'Buy stamps');
  await row(page, 'Send the invoice').getByTestId('task-check').click();
  await expect.poll(() => demoFile(page, 'done.md')).toContain('- [x] Send the invoice');
  await expect.poll(() => demoFile(page, 'tasks.md')).toContain('- [ ] Buy stamps');

  const messages: string[] = [];
  page.once('dialog', (d) => {
    messages.push(d.message());
    void d.dismiss();
  });
  await page.evaluate(() => ((window as unknown as { __notReloaded: boolean }).__notReloaded = true));
  await page.getByTestId('reset-demo').click();
  await expect.poll(() => messages).toEqual(['Reset the demo? Your demo edits are lost.']);
  await expect(row(page, 'Buy stamps')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded)).toBe(true);
  expect(await demoFile(page, 'tasks.md')).toContain('- [ ] Buy stamps');

  page.once('dialog', (d) => void d.accept());
  await Promise.all([page.waitForEvent('load'), page.getByTestId('reset-demo').click()]);
  await expect(row(page, 'Send the invoice')).toHaveCount(1);
  await expect(row(page, 'Buy stamps')).toHaveCount(0);
  await expect(page.getByTestId('status')).toHaveText('saved');
  expect(await demoFile(page, 'tasks.md')).toBe(samples.tasks);
  expect(await demoFile(page, 'done.md')).toBe(samples.done);
});

test('every request goes to the demo origin, and none to /api/', async ({ page, isMobile }) => {
  const stray: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== DEMO || u.pathname.startsWith('/api/')) stray.push(r.url());
  });
  await open(page);
  await addTask(page, isMobile, 'Buy stamps');
  await expect.poll(() => demoFile(page, 'tasks.md')).toContain('- [ ] Buy stamps');
  await page.reload();
  await expect(row(page, 'Buy stamps')).toHaveCount(1);
  await expect(page.getByTestId('status')).toHaveText('saved');
  expect(stray).toEqual([]);
});

test('with IndexedDB blocked (private mode) the demo opens in memory with a warning', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await open(page);
  await expect(page.getByText('This browser blocks offline storage, so demo edits are lost on reload.')).toBeVisible();
});
