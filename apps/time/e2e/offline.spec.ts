import { expect, test } from '@playwright/test';
import { firstRun, openTime, reload } from './helpers';

test('with Google and the drive unreachable, the app opens from its copy of the files', async ({ page }) => {
  await openTime(page);
  await firstRun(page);
  await expect(page.getByTestId('rows')).toHaveText('3 rows of tracked time');
  // Added after the first script, so it wins on the reload.
  await page.addInitScript(() => {
    window.__OMARK_TIME_SEED__ = { ...window.__OMARK_TIME_SEED__, offline: true };
  });
  await reload(page);
  await expect(page.getByTestId('status')).toContainText('Offline · 1 to fix');
  await expect(page.getByTestId('rows')).toHaveText('3 rows of tracked time');
});
