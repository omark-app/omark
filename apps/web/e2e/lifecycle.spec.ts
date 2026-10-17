import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, externalWrite, openApp, SPEC_TASKS } from './helpers';

type AuthStub = 'signed-out' | 'expired' | 'redirect-error';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

async function start(page: Page) {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

/** The app regains focus: the page becomes visible and the window is focused. */
async function regainFocus(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

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

/** Boots the fake build through the sign-in path, with the stubbed Microsoft account in `state`. */
async function startWithAuth(page: Page, state: AuthStub) {
  await page.addInitScript((s) => {
    (window as unknown as { __TASKAPP_AUTH_STUB__: string }).__TASKAPP_AUTH_STUB__ = s;
  }, state);
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
}

const signIns = (page: Page) =>
  page.evaluate(() => (window as unknown as { __taskappAuth: { signIns: number } }).__taskappAuth.signIns);

test('an outside edit shows up when the app regains focus', async ({ page }) => {
  await start(page);
  await externalWrite(page, 'tasks.md', `${SPEC_TASKS}- [ ] From Obsidian 📅 2026-10-16\n`);
  await regainFocus(page);
  await expect(row(page, 'From Obsidian')).toHaveCount(1);
});

test('coming back online re-reads the files', async ({ page }) => {
  await start(page);
  await externalWrite(page, 'tasks.md', `${SPEC_TASKS}- [ ] Written while away 📅 2026-10-16\n`);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(row(page, 'Written while away')).toHaveCount(1);
});

test('a bad config.yaml shows a banner naming the line, and the app keeps working', async ({ page, isMobile }) => {
  await start(page);
  await expect(page.getByTestId('config-banner')).toHaveCount(0);
  await externalWrite(page, 'config.yaml', 'theme: [');
  await regainFocus(page);
  await expect(page.getByTestId('config-banner')).toContainText('line 1');
  await addTask(page, 'Still works', isMobile);
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Still works');

  await externalWrite(page, 'config.yaml', 'theme: system\n');
  await regainFocus(page);
  await expect(page.getByTestId('config-banner')).toHaveCount(0);
});

test('theme in config.yaml forces dark or light; system follows the device', async ({ page }) => {
  await start(page);
  await externalWrite(page, 'config.yaml', 'theme: dark\n');
  await regainFocus(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 16, 21)');

  await externalWrite(page, 'config.yaml', 'theme: system\n');
  await regainFocus(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 244, 247)');
});

test('offline shows in the status; back online and focused, the task reaches the drive', async ({ page, isMobile }) => {
  await start(page);
  await expect(page.getByTestId('status')).toHaveText('saved');
  await page.evaluate(() => (window as unknown as { __taskappFake: { setOffline(o: boolean): void } }).__taskappFake.setOffline(true));
  await addTask(page, 'Written offline', isMobile);
  await expect(page.getByTestId('status')).toHaveText('offline');
  expect(await driveFile(page, 'tasks.md')).not.toContain('Written offline');

  await page.evaluate(() => (window as unknown as { __taskappFake: { setOffline(o: boolean): void } }).__taskappFake.setOffline(false));
  await regainFocus(page);
  await expect(page.getByTestId('status')).toHaveText('saved');
  expect(await driveFile(page, 'tasks.md')).toContain('- [ ] Written offline');
});

test('buckets move on at local midnight without a focus change', async ({ page }) => {
  await openApp(page, {
    files: { 'tasks.md': '# Always\n\n# Tasks\n- [ ] Saturday chores 📅 2026-10-17\n' },
    now: '2026-10-16T23:59:00',
    fakeTimers: true,
  });
  await expect(page.getByTestId('bucket-week').getByTestId('task-row')).toHaveCount(1);
  await page.clock.fastForward('01:30');
  await expect(page.getByTestId('bucket-today').getByTestId('task-row')).toHaveCount(1);
});

test('with no signed-in account the sign-in screen shows, and its button starts sign-in', async ({ page }) => {
  await startWithAuth(page, 'signed-out');
  const button = page.getByRole('button', { name: 'Sign in with Microsoft' });
  await expect(button).toBeVisible();
  await expect(page.getByTestId('bucket-today')).toHaveCount(0);
  await button.click();
  await expect.poll(() => signIns(page)).toBe(1);
});

test('a failed token refresh reads "sign in needed", and clicking it starts sign-in', async ({ page }) => {
  await startWithAuth(page, 'expired');
  const status = page.getByTestId('status');
  await expect(status).toHaveText('sign in needed');
  await status.click();
  await expect.poll(() => signIns(page)).toBe(1);
});

test('a start-up failure shows the error with a way to try again', async ({ page }) => {
  await startWithAuth(page, 'redirect-error');
  await expect(page.getByRole('alert')).toContainText('could not start');
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await Promise.all([page.waitForEvent('load'), retry.click()]);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
