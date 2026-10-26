import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test, expect } from '@playwright/test';
import { STATE_PATH } from './state';

test('sign in by hand and save the browser state', async ({ page, context }) => {
  test.setTimeout(10 * 60_000);
  await page.goto('/');
  console.log('\nSign in with your Microsoft account in the browser window. Waiting up to 9 minutes for the app to show "saved"...');
  await expect(page.getByTestId('status')).toHaveText('saved', { timeout: 9 * 60_000 });
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  await context.storageState({ path: STATE_PATH });
  console.log(`Saved the signed-in state to ${STATE_PATH}`);
});
