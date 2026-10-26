import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
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

const item = (name: string) => `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${E2E_FOLDER}/${name}`;

interface Read { text: string; etag: string | null }

/** Reads a file from Node (no CORS): metadata with the token, then the pre-authenticated download URL without it. */
async function readFile(request: APIRequestContext, auth: string, name: string): Promise<Read> {
  const meta = await request.get(item(name), { headers: { Authorization: auth } });
  if (meta.status() === 404) return { text: '', etag: null };
  if (!meta.ok()) throw new Error(`Graph read failed: ${meta.status()}`);
  const json = (await meta.json()) as { eTag?: string; '@microsoft.graph.downloadUrl'?: string };
  const url = json['@microsoft.graph.downloadUrl'];
  if (!url) return { text: '', etag: json.eTag ?? null };
  const body = await request.get(url);
  if (!body.ok()) throw new Error(`Download failed: ${body.status()}`);
  return { text: await body.text(), etag: json.eTag ?? null };
}

/** Writes only if the file is still the version that was read, so cleanup never overwrites a newer file. */
async function writeFile(request: APIRequestContext, auth: string, name: string, text: string, etag: string | null): Promise<void> {
  const headers: Record<string, string> = { Authorization: auth, 'Content-Type': 'text/plain' };
  if (etag) headers['If-Match'] = etag;
  const res = await request.put(`${item(name)}:/content`, { headers, data: text });
  if (!res.ok()) throw new Error(`Graph write failed: ${res.status()}`);
}

const text = async (request: APIRequestContext, auth: string, name: string) => (await readFile(request, auth, name)).text;

test('add, complete and delete a task on the real OneDrive', async ({ page, request }) => {
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
    await expect.poll(() => text(request, box.token, 'tasks.md'), { timeout: 30_000 }).toContain(doneTitle);

    await row(page, doneTitle).click();
    await page.keyboard.press('x');
    await expect(page.getByTestId('toast')).toContainText(`Done · ${doneTitle}`);
    await expect.poll(() => text(request, box.token, 'done.md'), { timeout: 30_000 }).toContain(doneTitle);
    expect(await text(request, box.token, 'tasks.md')).not.toContain(doneTitle);

    await row(page, deleteTitle).click();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('toast')).toContainText(`Deleted · ${deleteTitle}`);
    await expect.poll(() => text(request, box.token, 'tasks.md'), { timeout: 30_000 }).not.toContain(deleteTitle);
  } finally {
    // Close the app first so it cannot re-save over the cleaned files. The app cannot delete from done.md,
    // so the smoke lines are removed through Graph. A cleanup error is only a warning (no token in it).
    await page.close().catch(() => {});
    if (box.token) {
      try {
        for (const name of ['done.md', 'tasks.md']) {
          const { text: before, etag } = await readFile(request, box.token, name);
          const after = before.split('\n').filter((l) => !(l.includes('e2e smoke ') && l.includes(stamp))).join('\n');
          if (after !== before) await writeFile(request, box.token, name, after, etag);
        }
      } catch (e) {
        console.warn(`Cleanup of the e2e smoke lines failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
  }
});
