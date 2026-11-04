import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, externalWrite, openApp, SPEC_TASKS } from './helpers';
import { poll } from './poll';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

/** Adds a task the way this device does: the add input on desktop, the + sheet on a phone. */
async function addTask(page: Page, title: string, isMobile: boolean) {
  if (isMobile) {
    await page.getByTestId('fab').tap();
    await page.getByTestId('sheet').getByLabel('New task').fill(title);
    await page.getByTestId('sheet').getByRole('button', { name: 'Add', exact: true }).tap();
  } else {
    await page.getByTestId('add-input').fill(title);
    await page.getByTestId('add-input').press('Enter');
  }
  await expect(row(page, title)).toHaveCount(1);
}

type Fake = { folders(): string[]; setOffline(o: boolean): void; setFull(f: boolean): void };
const folders = (page: Page) => page.evaluate(() => (window as unknown as { __taskappFake: Fake }).__taskappFake.folders());
const setOffline = (page: Page, on: boolean) =>
  page.evaluate((o) => (window as unknown as { __taskappFake: Fake }).__taskappFake.setOffline(o), on);
const setFull = (page: Page, on: boolean) =>
  page.evaluate((f) => (window as unknown as { __taskappFake: Fake }).__taskappFake.setFull(f), on);

const signInWith = (page: Page) =>
  page.evaluate(() => (window as unknown as { __taskappAuth: { signInWith: (string | null)[] } }).__taskappAuth.signInWith);

test('with Google set up, the sign-in screen offers both, and the Google button signs in with Google', async ({ page }) => {
  await openApp(page, { auth: 'signed-out', providers: ['microsoft', 'google'] });
  await expect(page.getByText('Your tasks live in three plain Markdown files. Choose where to keep them.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my OneDrive' })).toBeVisible();
  await page.getByRole('button', { name: 'Use my Google Drive' }).click();
  await poll(() => signInWith(page)).toEqual(['google']);
  await page.getByRole('button', { name: 'Use my OneDrive' }).click();
  await poll(() => signInWith(page)).toEqual(['google', 'microsoft']);
});

test('without Google set up, the sign-in screen has only Microsoft', async ({ page }) => {
  await openApp(page, { auth: 'signed-out' });
  await expect(page.getByText('Your tasks live in three plain Markdown files. Choose where to keep them.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my OneDrive' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my Google Drive' })).toHaveCount(0);
  // the button names its provider; auth.signIn keeps the plain `/api/auth/login` for the default
  await page.getByRole('button', { name: 'Use my OneDrive' }).click();
  await poll(() => signInWith(page)).toEqual(['microsoft']);
});

test('with only Google set up, its button signs in with Google', async ({ page }) => {
  await openApp(page, { auth: 'signed-out', providers: ['google'] });
  await expect(page.getByText('Your tasks live in three plain Markdown files. Choose where to keep them.')).toBeVisible();
  await page.getByRole('button', { name: 'Use my Google Drive' }).click();
  await poll(() => signInWith(page)).toEqual(['google']);
});

test('a Google session that needs signing in again signs in with Google, not the default', async ({ page }) => {
  // The helper clears the signed-in cookie on a failed token request, so the app must remember the provider.
  await openApp(page, { auth: 'google-expired', files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('sync-banner')).toContainText('Sign in again to reach Google Drive — showing your last saved copy');
  await page.getByTestId('sync-banner').getByRole('button', { name: 'Sign in' }).click();
  await poll(() => signInWith(page)).toEqual(['google']);
});

test('signed in with Google on an empty drive, the first task creates the folder and tasks.md', async ({ page, isMobile }) => {
  await openApp(page, { auth: 'google' });
  await expect(page.getByTestId('bucket-important')).toBeVisible();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await addTask(page, 'Buy milk', isMobile);
  await poll(() => driveFile(page, 'tasks.md')).toMatch(/^# Tasks\n- \[ \] Buy milk\b/);
  expect(await folders(page)).toEqual(['Omark Tasks Dev']);
});

test('signed in with Google, a save that meets an outside edit merges it in', async ({ page, isMobile }) => {
  await openApp(page, { auth: 'google', files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await externalWrite(page, 'tasks.md', `${SPEC_TASKS}- [ ] Added on the phone 📅 2026-10-16\n`);
  await addTask(page, 'Added here', isMobile); // its write gets a 412, merges the phone's task in and writes
  await expect(row(page, 'Added on the phone')).toHaveCount(1);
  await poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Added here');
  expect(await driveFile(page, 'tasks.md')).toContain('- [ ] Added on the phone 📅 2026-10-16');
  await expect(page.getByTestId('status')).toHaveText('saved');
});

test('a full Google Drive says so; once there is room, the next refresh saves and clears it (#68)', async ({ page, isMobile }) => {
  await openApp(page, { auth: 'google', files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('status')).toHaveText('saved');
  await setFull(page, true);
  await addTask(page, 'Written on a full drive', isMobile);
  await expect(page.getByTestId('sync-banner')).toHaveText(
    "Your Google Drive is full — changes are kept on this device until there's room",
  );
  expect(await driveFile(page, 'tasks.md')).not.toContain('Written on a full drive');
  await setFull(page, false);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Written on a full drive');
  await expect(page.getByTestId('sync-banner')).toHaveCount(0);
  await expect(page.getByTestId('status')).toHaveText('saved');
});

test('signed in with Google and offline, the banner names Google Drive', async ({ page, isMobile }) => {
  await openApp(page, { auth: 'google', files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('status')).toHaveText('saved');
  await setOffline(page, true);
  await addTask(page, 'Written offline', isMobile);
  await expect(page.getByTestId('sync-banner')).toHaveText("Can't reach Google Drive since 09:00 — showing your last saved copy");
});
