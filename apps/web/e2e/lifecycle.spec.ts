import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { driveFile, externalWrite, openApp, SPEC_TASKS } from './helpers';

type AuthStub = 'signed-out' | 'expired' | 'redirect-error' | 'stalled-start';

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
async function startWithAuth(page: Page, state: AuthStub, opts: { fakeTimers?: boolean } = {}) {
  await page.addInitScript((s) => {
    (window as unknown as { __TASKAPP_AUTH_STUB__: string }).__TASKAPP_AUTH_STUB__ = s;
  }, state);
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS }, fakeTimers: opts.fakeTimers });
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

test('offline shows a banner with the last sync time; back online and focused, the task reaches the drive', async ({ page, isMobile }) => {
  await start(page);
  await expect(page.getByTestId('status')).toHaveText('saved');
  await expect(page.getByTestId('sync-banner')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __taskappFake: { setOffline(o: boolean): void } }).__taskappFake.setOffline(true));
  await addTask(page, 'Written offline', isMobile);
  await expect(page.getByTestId('sync-banner')).toHaveText("Can't reach OneDrive since 09:00 — showing your last saved copy");
  await expect(page.getByTestId('status')).toHaveCount(0); // the banner says it instead of the faint status
  expect(await driveFile(page, 'tasks.md')).not.toContain('Written offline');

  await page.evaluate(() => (window as unknown as { __taskappFake: { setOffline(o: boolean): void } }).__taskappFake.setOffline(false));
  await regainFocus(page);
  await expect(page.getByTestId('status')).toHaveText('saved');
  await expect(page.getByTestId('sync-banner')).toHaveCount(0);
  expect(await driveFile(page, 'tasks.md')).toContain('- [ ] Written offline');
});

test("a save that meets another device's change shows that change without a focus change (#6)", async ({ page, isMobile }) => {
  await start(page);
  await externalWrite(page, 'tasks.md', `${SPEC_TASKS}- [ ] Added on the phone 📅 2026-10-16\n`);
  await addTask(page, 'Added here', isMobile); // its write gets a 412, merges the phone's task in and writes
  await expect(row(page, 'Added on the phone')).toHaveCount(1);
  await expect.poll(() => driveFile(page, 'tasks.md')).toContain('- [ ] Added here');
  await expect(page.getByTestId('status')).toHaveText('saved');
});

test('the build this device runs is shown beside the status', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('build')).toHaveText(/^v7 · \d{1,2} [A-Z][a-z]{2}$/);
  await expect(page.getByTestId('build')).toHaveAttribute('title', /^Build /);
});

test('buckets move on at local midnight without a focus change', async ({ page }) => {
  await openApp(page, {
    files: { 'tasks.md': '# Always\n\n# Tasks\n- [ ] Saturday chores 📅 2026-10-17\n' },
    now: '2026-10-16T23:59:45',
    fakeTimers: true,
  });
  await expect(page.getByTestId('bucket-tomorrow').getByTestId('task-row')).toHaveCount(1);
  // 20 s: past midnight, but short of the 30 s periodic check, so only the midnight timer can move it.
  await page.clock.fastForward(20_000);
  await expect(page.getByTestId('bucket-today').getByTestId('task-row')).toHaveCount(1);
});

test('with no signed-in account the sign-in screen shows, and its button starts sign-in', async ({ page }) => {
  await startWithAuth(page, 'signed-out');
  const button = page.getByRole('button', { name: 'Sign in with Microsoft' });
  await expect(button).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('omark tasks');
  await expect(page.getByTestId('bucket-today')).toHaveCount(0);
  await button.click();
  await expect.poll(() => signIns(page)).toBe(1);
});

test('a failed token refresh shows a sign-in banner, and its button starts sign-in', async ({ page }) => {
  await startWithAuth(page, 'expired');
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await expect(page.getByTestId('sync-banner')).toContainText('Sign in again to reach OneDrive — showing your last saved copy');
  const status = page.getByTestId('sync-banner').getByRole('button', { name: 'Sign in' });
  await status.click();
  await expect.poll(() => signIns(page)).toBe(1);
  expect(dialogs).toEqual([]); // nothing to lose, nothing to ask
});

test('signing in again with edits only in memory asks first', async ({ page, isMobile }) => {
  await startWithAuth(page, 'expired'); // the fake build caches in memory only
  await addTask(page, 'Not on OneDrive yet', isMobile);
  const status = page.getByTestId('sync-banner').getByRole('button', { name: 'Sign in' });
  await expect(status).toBeVisible();

  const dialogs: string[] = [];
  page.once('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await status.click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("aren't saved to OneDrive yet");
  expect(await signIns(page)).toBe(0);
  await expect(row(page, 'Not on OneDrive yet')).toHaveCount(1);

  page.once('dialog', (d) => void d.accept());
  await status.click();
  await expect.poll(() => signIns(page)).toBe(1);
});

test('a sign-in library that never finishes starting still opens the list, asking to sign in', async ({ page }) => {
  await startWithAuth(page, 'stalled-start', { fakeTimers: true });
  await expect(page.getByText('Loading…')).toBeVisible();
  await page.clock.fastForward(15_000);
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await expect(page.getByTestId('sync-banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('a start-up failure shows the error with a way to try again', async ({ page }) => {
  await startWithAuth(page, 'redirect-error');
  await expect(page.getByRole('alert')).toContainText('could not start');
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await Promise.all([page.waitForEvent('load'), retry.click()]);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
