import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Goals' area pictures (roadmap G.2b, Goals spec 7.1 and 8) on the fake storage: JPEGs in goals/images/.

const PARTS = 'parts: [goals, tasks]\n';

type Fake = Record<string, {
  peek(n: string): string | null;
  names(): string[];
  readBytes(n: string): Promise<Blob | null>;
  setOffline(o: boolean): void;
}>;

async function open(page: Page, goals: Record<string, string> = {}) {
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00'));
  await page.addInitScript((s) => {
    (window as unknown as Record<string, unknown>).__OMARK_SEED__ = s;
  }, { root: { 'config.yaml': PARTS }, goals });
  await page.goto('/goals');
  await expect(page.getByTestId('goals-board')).toBeVisible();
}

const goalsMd = (page: Page) => page.evaluate(() => (window as unknown as { __omarkFake: Fake }).__omarkFake.goals!.peek('goals.md'));
const pictureNames = (page: Page) => page.evaluate(() => (window as unknown as { __omarkFake: Fake }).__omarkFake.images!.names());
const setOffline = (page: Page, on: boolean) =>
  page.evaluate((o) => (window as unknown as { __omarkFake: Fake }).__omarkFake.images!.setOffline(o), on);

/** A saved picture's type, first bytes and size in pixels. */
const pictureInfo = (page: Page, name: string) =>
  page.evaluate(async (n) => {
    const blob = (await (window as unknown as { __omarkFake: Fake }).__omarkFake.images!.readBytes(n))!;
    const start = [...new Uint8Array(await blob.slice(0, 2).arrayBuffer())];
    const bitmap = await createImageBitmap(blob);
    return { type: blob.type, start, width: bitmap.width, height: bitmap.height };
  }, name);

/** A PNG of this size, made in the page. */
async function png(page: Page, width: number, height: number): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const bytes = await page.evaluate(async ([w, h]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3a7';
    ctx.fillRect(0, 0, w, h);
    const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, [width, height] as const);
  return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

const card = (page: Page, name: string) => page.getByTestId('area-card').filter({ hasText: name });
const sheet = (page: Page) => page.locator('form.sheet');
const fileInput = (page: Page) => sheet(page).locator('input[type=file]');

test('a picture is saved as a 1600 px JPEG named from the tag; Replace adds -2 and Remove keeps the files', async ({ page }) => {
  await open(page);
  // A new area with a picture from the start.
  await page.getByRole('button', { name: 'Add your first area' }).click();
  await sheet(page).getByLabel('Name').fill('Climbing');
  await fileInput(page).setInputFiles(await png(page, 2000, 1000));
  await expect(sheet(page).getByTestId('picture-thumb')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(card(page, 'Climbing').getByTestId('area-picture')).toHaveJSProperty('complete', true);
  expect(await card(page, 'Climbing').getByTestId('area-picture').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
  await expect.poll(() => goalsMd(page)).toBe('## Climbing #climbing\n\n![Climbing](images/climbing.jpg)\n');
  expect(await pictureInfo(page, 'climbing.jpg')).toEqual({ type: 'image/jpeg', start: [0xff, 0xd8], width: 1600, height: 800 });

  // Replace: a new name, the old file left.
  await card(page, 'Climbing').getByRole('button', { name: 'Edit Climbing' }).click();
  await expect(sheet(page).getByTestId('picture-thumb')).toBeVisible();
  await fileInput(page).setInputFiles(await png(page, 800, 1200));
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => goalsMd(page)).toBe('## Climbing #climbing\n\n![Climbing](images/climbing-2.jpg)\n');
  expect(await pictureNames(page)).toEqual(['climbing-2.jpg', 'climbing.jpg']);
  expect(await pictureInfo(page, 'climbing-2.jpg')).toMatchObject({ width: 800, height: 1200 });

  // Remove: the line goes, the files stay, the card shows its colour.
  await card(page, 'Climbing').getByRole('button', { name: 'Edit Climbing' }).click();
  await sheet(page).getByRole('button', { name: 'Remove picture' }).click();
  await expect(sheet(page).getByTestId('picture-thumb')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => goalsMd(page)).toBe('## Climbing #climbing\n');
  await expect(card(page, 'Climbing').getByTestId('area-picture')).toHaveCount(0);
  expect(await pictureNames(page)).toEqual(['climbing-2.jpg', 'climbing.jpg']);
});

test('offline, the picture is not saved and the form says why; the rest of the edit is', async ({ page }) => {
  await open(page, { 'goals.md': '## Climbing #climbing\n' });
  await setOffline(page, true);
  await card(page, 'Climbing').getByRole('button', { name: 'Edit Climbing' }).click();
  await sheet(page).getByLabel('Vision').fill('Lead 7a.');
  await fileInput(page).setInputFiles(await png(page, 400, 300));
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByRole('alert')).toContainText("Can't reach the Omark folder");
  await expect.poll(() => goalsMd(page)).toBe('## Climbing #climbing\n\nLead 7a.\n');
  // Back online, Save again adds it.
  await setOffline(page, false);
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => goalsMd(page)).toBe('## Climbing #climbing\n\n![Climbing](images/climbing.jpg)\n\nLead 7a.\n');
  await expect(card(page, 'Climbing').getByTestId('area-picture')).toBeVisible();
});

test('a picture line whose file is missing, or outside images/, shows the plain colour and stays', async ({ page }) => {
  const text = '## Climbing #climbing\n\n![Climbing](images/climbing.jpg)\n\n## Home #home\n\n![Home](https://example.com/home.jpg)\n';
  await open(page, { 'goals.md': text });
  await expect(page.getByTestId('area-card')).toHaveCount(2);
  await expect(page.getByTestId('area-picture')).toHaveCount(0);
  expect(await goalsMd(page)).toBe(text);
});
