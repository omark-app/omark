import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { allFields, fieldId } from '@omark/settings';
import type { KeysField } from '@omark/settings';
import { DEFAULT_CONFIG_YAML, TASKS_SCHEMA } from '@omark/tasks-core';
import { driveFile, externalWrite, openApp, SPEC_TASKS } from './helpers';

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });
const settings = (page: Page) => page.getByTestId('settings');
const themeButton = (page: Page, label: string) =>
  page.getByTestId('field-theme').getByRole('button', { name: label, exact: true });
const saveDelay = (page: Page) => page.locator('#setting-saveDelaySeconds');

/** Opens the app on SPEC_TASKS with `config` as config.yaml ('' is an empty file; a missing one gets the defaults). */
async function start(page: Page, config: string, opts: { fakeTimers?: boolean } = {}) {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS, 'config.yaml': config }, fakeTimers: opts.fakeTimers });
  await expect(page.getByTestId('bucket-today')).toBeVisible();
}

/** Opens Settings from the footer gear. */
async function openSettings(page: Page) {
  await page.getByTestId('open-settings').click();
  await expect(settings(page)).toBeVisible();
}

/** The app regains focus: the page becomes visible and the window is focused (as in lifecycle.spec.ts). */
async function regainFocus(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

/** Arms the first key of `cmd` and presses `key`. Shows every command first. */
async function captureKey(page: Page, cmd: string, key: string) {
  const showAll = page.getByTestId('keys-show-all');
  if (await showAll.isVisible()) await showAll.getByRole('button', { name: 'Show all' }).click();
  await page.getByTestId(`key-${cmd}-0`).click();
  await expect(page.getByTestId(`key-${cmd}-0`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press(key);
}

test('the footer gear opens Settings with every setting', async ({ page, isMobile }) => {
  await start(page, 'theme: dark\nsaveDelaySeconds: 2\n');
  const gear = page.getByTestId('open-settings');
  await expect(gear).toBeVisible();
  if (isMobile) {
    // The phone's gear sits in the top line, clear of the + button.
    const [g, fab] = [await gear.boundingBox(), await page.getByTestId('fab').boundingBox()];
    expect(g && fab).toBeTruthy();
    const apart = g!.x + g!.width <= fab!.x || fab!.x + fab!.width <= g!.x || g!.y + g!.height <= fab!.y || fab!.y + fab!.height <= g!.y;
    expect(apart).toBe(true);
  }
  await openSettings(page);
  expect(new URL(page.url()).hash).toBe('#settings');
  await expect(page.getByTestId('bucket-today')).toHaveCount(0);
  await expect(page.getByTestId('fab')).toHaveCount(0);
  await expect(page.getByTestId('open-settings')).toHaveCount(0);
  await expect(settings(page).getByRole('link', { name: /Omark Time/ })).toHaveAttribute('href', 'https://app.omark.app/settings');

  for (const field of allFields(TASKS_SCHEMA)) await expect(page.getByTestId(`field-${fieldId(field)}`)).toBeVisible();
  await page.getByTestId('keys-show-all').getByRole('button', { name: 'Show all' }).click();
  const keys = allFields(TASKS_SCHEMA).find((f): f is KeysField => f.type === 'keys')!;
  for (const c of keys.commands) await expect(page.getByTestId(`key-${c.id}-0`)).toBeVisible();
  await expect(themeButton(page, 'Dark')).toHaveAttribute('aria-pressed', 'true');
  await expect(saveDelay(page)).toHaveValue('2');

  // The list's keys do nothing here: no search, no view switch.
  await page.locator('h1').click();
  await page.keyboard.press('f');
  await page.keyboard.press('v');
  await expect(page.getByTestId('search')).toHaveCount(0);
  await expect(settings(page)).toBeVisible();

  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await expect(settings(page)).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  if (!isMobile) {
    await page.keyboard.press(',');
    await expect(settings(page)).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#settings');
    // Browser back returns to the list.
    await page.goBack();
    await expect(page.getByTestId('bucket-today')).toBeVisible();
    // In a field the comma is just typed.
    await page.getByTestId('add-input').focus();
    await page.keyboard.press(',');
    await expect(settings(page)).toHaveCount(0);
    await expect(page.getByTestId('add-input')).toHaveValue(',');
  }
});

test('‹ Tasks goes back in history, so browser back then does not reopen Settings', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await start(page, '');
  // An entry behind the list, so browser back stays in the app.
  await page.evaluate(() => history.pushState(null, '', '/'));
  await openSettings(page);
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  await expect(settings(page)).toHaveCount(0);
});

test('on a direct load of #settings, ‹ Tasks links to the list', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await start(page, '');
  await page.goto('about:blank');
  await page.goto('/#settings');
  await expect(settings(page)).toBeVisible();
  await expect(page.getByTestId('settings-back')).toHaveAttribute('href', '#');
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('bucket-today')).toBeVisible();
  // The link added an entry: back is Settings again, not the page before the app.
  await page.goBack();
  await expect(settings(page)).toBeVisible();
});

test('the theme applies at once and only that key is written', async ({ page }) => {
  await start(page, DEFAULT_CONFIG_YAML);
  await openSettings(page);
  await themeButton(page, 'Dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe(DEFAULT_CONFIG_YAML.replace('\ntheme: system\n', '\ntheme: dark\n'));
});

test('a theme set on an empty file writes just that line', async ({ page }) => {
  await start(page, '');
  await openSettings(page);
  await themeButton(page, 'Dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('theme: dark\n');
});

test('back to the default removes the key', async ({ page }) => {
  await start(page, 'theme: dark\n');
  await openSettings(page);
  await themeButton(page, 'System').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('');
});

test('the Habits section edits the habits keys', async ({ page }) => {
  await start(page, '');
  await openSettings(page);
  const goal = page.locator('[id="setting-habits.goal"]');
  const misses = page.locator('[id="setting-habits.missesPerAttempt"]');
  await expect(goal).toHaveValue('66');
  await expect(misses).toHaveValue('10%');

  await goal.fill('30');
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('habits:\n  goal: 30\n');
  await misses.fill('25%');
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('habits:\n  goal: 30\n  missesPerAttempt: 25%\n');

  // A share over 100% is refused with the reader's reason, and the file stays.
  await misses.fill('120%');
  await expect(page.getByTestId('field-error-habits.missesPerAttempt')).toContainText('or a percentage from 0% to 100%');
  expect(await driveFile(page, 'config.yaml')).toBe('habits:\n  goal: 30\n  missesPerAttempt: 25%\n');

  // Back to the default removes the key, and the emptied habits: map with it.
  await misses.fill('10%');
  await misses.blur();
  await goal.fill('66');
  await goal.blur();
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('');
});

test('invalid input is refused with a reason', async ({ page }) => {
  const seed = 'theme: dark\n';
  await start(page, seed);
  await openSettings(page);

  await saveDelay(page).fill('-1');
  await expect(page.getByTestId('field-error-saveDelaySeconds')).toBeVisible();
  await expect(page.getByTestId('config-text')).toHaveText(seed);

  // The click on Show all blurs the box with its error; it still lands although the error line goes.
  await captureKey(page, 'complete', 'i');
  await expect(page.getByTestId('keys-error')).toContainText('is already Important on or off');
  await expect(page.getByTestId('config-text')).toHaveText(seed);
  await expect(page.getByTestId('status')).toHaveText('saved');
  expect(await driveFile(page, 'config.yaml')).toBe(seed);
});

test('typing through the default keeps the line and its comment', async ({ page }) => {
  await start(page, 'saveDelaySeconds: 3  # slow phone\n', { fakeTimers: true });
  await openSettings(page);
  await saveDelay(page).selectText();
  await saveDelay(page).pressSequentially('15');
  // Typing 1 (the default) on the way to 15 leaves the line alone.
  await expect(page.getByTestId('config-text')).toHaveText('saveDelaySeconds: 15  # slow phone');
  // The new delay applies at once, so the save waits 15 seconds.
  await page.clock.fastForward(16_000);
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('saveDelaySeconds: 15  # slow phone\n');
});

test('a broken file opens the editor at the problem line', async ({ page }) => {
  await start(page, 'theme: dark\nfoo: [\n');
  await page.getByTestId('config-banner-settings').click();
  await expect(page.getByTestId('text-editor')).toBeVisible();
  await expect(page.getByTestId('text-line-2')).toHaveAttribute('data-problem', 'true');
  await expect(page.getByTestId('text-error')).toContainText('Line 2');
  await expect(page.getByTestId('text-done')).toBeDisabled();

  await page.getByTestId('text-editor').fill('theme: dark\n');
  await expect(page.getByTestId('text-done')).toBeEnabled();
  await page.getByTestId('text-done').click();
  await expect(page.getByTestId('field-theme')).toBeVisible();
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('theme: dark\n');
});

test('a change from another device is merged on focus', async ({ page }) => {
  await start(page, '');
  await openSettings(page);
  await themeButton(page, 'Dark').click();
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe('theme: dark\n');
  await expect(settings(page).getByTestId('status')).toHaveText('saved');

  const text = await driveFile(page, 'config.yaml');
  await externalWrite(page, 'config.yaml', `${text}saveDelaySeconds: 2\n`);
  await regainFocus(page);
  await expect(saveDelay(page)).toHaveValue('2');
  await expect(themeButton(page, 'Dark')).toHaveAttribute('aria-pressed', 'true');
});

test('theme and a shortcut survive a reload, and the file holds only those keys', async ({ page, isMobile }) => {
  await start(page, '');
  await openSettings(page);
  await themeButton(page, 'Dark').click();
  await captureKey(page, 'complete', 'c');
  await expect(page.getByTestId('key-complete-0')).toHaveText('c');
  const saved = 'theme: dark\nshortcuts:\n  complete: c\n';
  await expect.poll(() => driveFile(page, 'config.yaml')).toBe(saved);

  // The fake drive lives in memory, so the reload is seeded with what was saved (a later init script wins).
  await page.addInitScript((files) => {
    (window as unknown as { __TASKAPP_SEED__: unknown }).__TASKAPP_SEED__ = files;
  }, { 'tasks.md': SPEC_TASKS, 'config.yaml': saved });
  await page.reload();
  await expect(settings(page)).toBeVisible();
  await expect(themeButton(page, 'Dark')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('keys-show-all').getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByTestId('key-complete-0')).toHaveText('c');

  if (!isMobile) {
    await page.getByTestId('settings-back').click();
    await row(page, 'Call the dentist').click();
    await page.keyboard.press('c');
    await expect(row(page, 'Call the dentist')).toHaveCount(0);
    await expect.poll(() => driveFile(page, 'done.md')).toContain('Call the dentist about the crown');
  }
});
