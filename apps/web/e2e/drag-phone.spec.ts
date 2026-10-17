import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openApp, SPEC_TASKS } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'long-press drag is the touch counterpart of desktop mouse drag');

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

/**
 * Spec 15 accepts weak emulation for long-press drag, so this is the one smoke test. WebKit has no CDP touch
 * input, so the finger is synthetic touch pointer events (as in phone.spec), with the page's timers running
 * through the hold.
 */
test('holding a Today row lifts it; dropping it on the Next week head moves it there', async ({ page }) => {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS } });
  const dentist = row(page, 'Call the dentist');
  await expect(dentist).toBeVisible();
  // No HTML5 drag on a phone, or iOS could start its own drag on the long press.
  await expect(dentist).not.toHaveAttribute('draggable', 'true');
  const head = await page.getByTestId('bucket-head-next').boundingBox();
  const finger = (type: string, x: number, y: number) =>
    dentist.evaluate(
      (el, [type, x, y]) => {
        el.dispatchEvent(
          new PointerEvent(type as string, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x as number, clientY: y as number }),
        );
      },
      [type, x, y] as const,
    );
  // Whether the page would scroll under the finger: a touchmove the app cancels does not scroll.
  const scrollBlocked = () =>
    dentist.evaluate((el) => {
      const e = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
  const box = (await dentist.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await finger('pointerdown', x, y);
  expect(await scrollBlocked()).toBe(false);
  await page.waitForTimeout(500);
  await expect(dentist).toHaveClass(/\blifted\b/);
  await expect(page.locator('.drag-ghost')).toHaveCount(1);
  expect(await scrollBlocked()).toBe(true);

  const to = { x: head!.x + 40, y: head!.y + head!.height / 2 };
  for (let i = 1; i <= 5; i++) await finger('pointermove', x + ((to.x - x) * i) / 5, y + ((to.y - y) * i) / 5);
  await expect(page.getByTestId('bucket-next')).toHaveClass(/\bdrop-into\b/);
  await finger('pointerup', to.x, to.y);
  expect(await scrollBlocked()).toBe(false);
  // The click a browser may send after the release is not a tap on the head (which would fold Next week).
  await page.getByTestId('bucket-head-next').evaluate((el) => (el as HTMLElement).click());

  await expect(page.getByTestId('toast')).toContainText('Moved to Next week');
  await expect(page.getByTestId('bucket-next').getByTestId('task-row').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
  await expect(page.getByTestId('bucket-head-next')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.drag-ghost, .lifted, .drop-into, .drop-before')).toHaveCount(0);
});
