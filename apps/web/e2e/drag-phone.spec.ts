import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openApp, SPEC_TASKS } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'long-press drag is the touch counterpart of desktop mouse drag');

/*
 * Spec 15 accepts weak emulation for long-press drag, so this is a smoke test. WebKit has no CDP touch input,
 * so the finger is synthetic events dispatched on the row it pressed (pointer events as in phone.spec, and
 * touch events). The page's clock is paused once the list is up, so time passes only when a test runs it on:
 * the hold lasts exactly as long as the test says, however slowly a loaded machine dispatches the events.
 */

/** A still finger lifts the row after this long (spec 9.2, `HOLD_MS` in gestures.ts). */
const HOLD_MS = 400;
/** Far longer than a busy phone could take to send the click that follows a release. */
const LATE_CLICK_MS = 2000;

const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ hasText: title });

type Point = { x: number; y: number };

/** A touch pointer event from the finger at `at`. */
const pointer = (target: Locator, type: string, at: Point) =>
  target.evaluate(
    (el, [type, at]) => {
      el.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: at.x, clientY: at.y }),
      );
    },
    [type, at] as const,
  );

/**
 * A touch event from the finger at `at` (or carrying no touch). True when the app cancelled it: a cancelled
 * touchmove does not scroll the page.
 */
const touch = (target: Locator, type: 'touchmove' | 'touchend', at?: Point) =>
  target.evaluate(
    (el, [type, at]) => {
      // WebKit has no Touch constructor; its legacy factories still work.
      const d = document as Document & {
        createTouch(view: Window, target: EventTarget, id: number, pageX: number, pageY: number, screenX: number, screenY: number): Touch;
        createTouchList(...touches: Touch[]): TouchList;
      };
      const list = (...touches: Touch[]) => d.createTouchList(...touches) as unknown as Touch[]; // TouchEventInit takes a TouchList here
      const finger = at && list(d.createTouch(window, el, 7, at.x + scrollX, at.y + scrollY, at.x, at.y));
      const fingers = finger && { changedTouches: finger, touches: type === 'touchend' ? list() : finger };
      const e = new TouchEvent(type, { bubbles: true, cancelable: true, ...fingers });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    },
    [type, at] as const,
  );

/** Opens the spec tasks and holds a finger on the Today row until it lifts; returns the row and the finger. */
async function lift(page: Page): Promise<{ dentist: Locator; at: Point }> {
  await openApp(page, { files: { 'tasks.md': SPEC_TASKS }, fakeTimers: true });
  const dentist = row(page, 'Call the dentist');
  await expect(dentist).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-16T09:01:00'));
  const box = (await dentist.boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await pointer(dentist, 'pointerdown', at);
  await page.clock.runFor(HOLD_MS - 1);
  expect(await touch(dentist, 'touchmove')).toBe(false); // not lifted yet: the page may scroll
  await expect(dentist).not.toHaveClass(/\blifted\b/);
  await page.clock.runFor(1);
  await expect(dentist).toHaveClass(/\blifted\b/);
  await expect(page.locator('.drag-ghost')).toHaveCount(1);
  expect(await touch(dentist, 'touchmove')).toBe(true); // lifted: the page holds still
  return { dentist, at };
}

/** The middle of the Next week head. */
async function nextHead(page: Page): Promise<Point> {
  const head = (await page.getByTestId('bucket-head-next').boundingBox())!;
  return { x: head.x + 40, y: head.y + head.height / 2 };
}

async function expectMovedToNextWeek(page: Page): Promise<void> {
  await expect(page.getByTestId('toast')).toContainText('Moved to Next week');
  await expect(page.getByTestId('bucket-next').getByTestId('task-row').filter({ hasText: 'Call the dentist' })).toHaveCount(1);
  await expect(page.getByTestId('bucket-head-next')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.drag-ghost, .lifted, .drop-into, .drop-before')).toHaveCount(0);
}

test('holding a Today row lifts it; dropping it on the Next week head moves it there', async ({ page }) => {
  const { dentist, at } = await lift(page);
  // No HTML5 drag on a phone, or iOS could start its own drag on the long press.
  await expect(dentist).not.toHaveAttribute('draggable', 'true');

  const to = await nextHead(page);
  for (let i = 1; i <= 5; i++) await pointer(dentist, 'pointermove', { x: at.x + ((to.x - at.x) * i) / 5, y: at.y + ((to.y - at.y) * i) / 5 });
  await expect(page.getByTestId('bucket-next')).toHaveClass(/\bdrop-into\b/);
  await pointer(dentist, 'pointerup', to);
  expect(await touch(dentist, 'touchmove')).toBe(false);
  // The click a browser may send after the release is not a tap on the head (which would fold Next week),
  // even when a busy phone sends it late.
  await page.clock.runFor(LATE_CLICK_MS);
  await page.getByTestId('bucket-head-next').evaluate((el) => (el as HTMLElement).click());

  await expectMovedToNextWeek(page);
});

test('a lifted row survives a pointercancel and follows touch events to the drop', async ({ page }) => {
  const { dentist } = await lift(page);
  // iOS may cancel the pointer when the lifted finger moves (rows are touch-action: pan-y).
  await pointer(dentist, 'pointercancel', { x: 0, y: 0 });
  await expect(dentist).toHaveClass(/\blifted\b/);

  const to = await nextHead(page);
  expect(await touch(dentist, 'touchmove', to)).toBe(true);
  await expect(page.getByTestId('bucket-next')).toHaveClass(/\bdrop-into\b/);
  await touch(dentist, 'touchend', to);
  await page.clock.runFor(LATE_CLICK_MS);
  await page.getByTestId('bucket-head-next').evaluate((el) => (el as HTMLElement).click());
  await expectMovedToNextWeek(page);

  await pointer(dentist, 'pointerup', to); // whichever release comes second finds no gesture
  await expect(page.getByTestId('toast')).toHaveCount(1);
  await expect(page.getByTestId('bucket-head-next')).toHaveAttribute('aria-expanded', 'true');
});

test('a lifted row taken off the page still holds the page still, and its release ends the drag', async ({ page }) => {
  const { dentist } = await lift(page);
  // As a re-render would. Touch events keep going to the element first touched (here the title), even once
  // removed, and no longer reach the window.
  const detached = await dentist.locator('.title').elementHandle();
  await dentist.evaluate((el) => el.remove());
  const touchOn = (type: string) =>
    detached!.evaluate((el, type) => {
      const e = new TouchEvent(type, { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    }, type);
  expect(await touchOn('touchmove')).toBe(true);
  await touchOn('touchend');
  await expect(page.locator('.drag-ghost, .lifted, .drop-into, .drop-before')).toHaveCount(0);
});

/** Lifts the Today row and drops it on the Next week head with no click after the release, as after most moved touches. */
async function dropWithoutClick(page: Page): Promise<Locator> {
  const { dentist } = await lift(page);
  const to = await nextHead(page);
  await pointer(dentist, 'pointermove', to);
  await pointer(dentist, 'pointerup', to);
  await expectMovedToNextWeek(page);
  return page.getByTestId('bucket-head-next');
}

test('after a release the browser sent no click for, the next tap still counts', async ({ page }) => {
  const head = await dropWithoutClick(page);
  const at = await nextHead(page);
  await pointer(head, 'pointerdown', at);
  await pointer(head, 'pointerup', at);
  await head.evaluate((el) => (el as HTMLElement).click());
  await expect(head).toHaveAttribute('aria-expanded', 'false');
});

test('after a release the browser sent no click for, the next key press still counts', async ({ page }) => {
  const head = await dropWithoutClick(page);
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
});
