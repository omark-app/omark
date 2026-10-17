import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_FOLDER, STATE_PATH } from './state';

test.beforeAll(() => {
  if (!existsSync(STATE_PATH)) {
    throw new Error(`No saved sign-in at ${STATE_PATH}. Run "pnpm e2e:real:login" once first (or set TASKAPP_E2E_STATE).`);
  }
});

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

/** Catches the bearer token the app itself sends to Graph (never logged), so read-back needs no second sign-in. */
function watchToken(page: Page) {
  const box = { token: '' };
  page.on('request', (req) => {
    if (!req.url().startsWith('https://graph.microsoft.com/')) return;
    const auth = req.headers()['authorization'];
    if (auth) box.token = auth;
  });
  return box;
}

const fileUrl = (name: string) => `https://graph.microsoft.com/v1.0/me/drive/root:/${E2E_FOLDER}/${name}:/content`;

async function readFile(page: Page, auth: string, name: string): Promise<string> {
  return page.evaluate(async ([url, a]) => {
    const res = await fetch(url!, { headers: { Authorization: a! } });
    if (res.status === 404) return '';
    if (!res.ok) throw new Error(`Graph read failed: ${res.status}`);
    return res.text();
  }, [fileUrl(name), auth]);
}

async function writeFile(page: Page, auth: string, name: string, text: string): Promise<void> {
  const status = await page.evaluate(async ([url, a, body]) => {
    const res = await fetch(url!, { method: 'PUT', headers: { Authorization: a!, 'Content-Type': 'text/plain' }, body });
    return res.status;
  }, [fileUrl(name), auth, text]);
  if (status >= 300) throw new Error(`Graph write failed: ${status}`);
}

test('add, complete and delete a task on the real OneDrive', async ({ page }) => {
  test.setTimeout(120_000);
  const box = watchToken(page);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const doneTitle = `e2e smoke done ${stamp}`;
  const deleteTitle = `e2e smoke delete ${stamp}`;

  await page.goto('/');
  await expect(page.getByTestId('status'), 'sign in again with "pnpm e2e:real:login" if this says "sign in needed"').toHaveText('saved', { timeout: 30_000 });
  await expect.poll(() => box.token, { message: 'the app should have called Graph' }).not.toBe('');

  try {
    const input = page.getByTestId('add-input');
    for (const title of [doneTitle, deleteTitle]) {
      await input.fill(title);
      await input.press('Enter');
      await expect(row(page, title)).toHaveCount(1);
    }
    await expect(page.getByTestId('status')).toHaveText('saved', { timeout: 30_000 });
    await expect.poll(() => readFile(page, box.token, 'tasks.md'), { timeout: 30_000 }).toContain(doneTitle);

    await row(page, doneTitle).click();
    await page.keyboard.press('x');
    await expect(page.getByTestId('toast')).toContainText(`Done · ${doneTitle}`);
    await expect.poll(() => readFile(page, box.token, 'done.md'), { timeout: 30_000 }).toContain(doneTitle);
    expect(await readFile(page, box.token, 'tasks.md')).not.toContain(doneTitle);

    await row(page, deleteTitle).click();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('toast')).toContainText(`Deleted · ${deleteTitle}`);
    await expect.poll(() => readFile(page, box.token, 'tasks.md'), { timeout: 30_000 }).not.toContain(deleteTitle);
  } finally {
    // The app cannot delete from done.md, so remove the smoke lines through Graph. Nothing is left behind.
    if (box.token) {
      const done = await readFile(page, box.token, 'done.md');
      const cleaned = done.split('\n').filter((l) => !l.includes(`e2e smoke done ${stamp}`)).join('\n');
      if (cleaned !== done) await writeFile(page, box.token, 'done.md', cleaned);
      const tasks = await readFile(page, box.token, 'tasks.md');
      const tasksCleaned = tasks.split('\n').filter((l) => !l.includes(`e2e smoke `) || !l.includes(stamp)).join('\n');
      if (tasksCleaned !== tasks) await writeFile(page, box.token, 'tasks.md', tasksCleaned);
    }
  }
});
