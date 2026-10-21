import type { DropTarget } from '@omark/core';
import { rowOf } from './drag/drop-target.ts';
import { liftRow } from './drag/touch-drag.ts';
import type { TouchDrag } from './drag/touch-drag.ts';

/** A finger held still this long lifts the row (spec 9.2). */
export const HOLD_MS = 400;

/** What a finger did, read at release. */
export type GestureResult = 'tap' | 'swipeRight' | 'swipeLeft' | 'drop' | 'none';
/**
 * `pending` until the movement (or a still hold) decides it. `scroll` is left to the browser; `swipe` follows
 * the finger sideways; `drag` is a long-press lift (moved by touch drag).
 */
export type GesturePhase = 'pending' | 'scroll' | 'swipe' | 'drag' | 'ended';

/**
 * Tells tap, swipe, scroll and long-press apart by movement (spec 9.2): moving before the hold time is a
 * swipe (mostly sideways) or a scroll; holding still for `holdMs` is a drag. Pure: the caller feeds it
 * positions and times, and calls `tick` from a timer so a still finger can lift.
 */
export class GestureTracker {
  private readonly holdMs: number;
  private readonly slop: number;
  private readonly swipeStart: number;
  private readonly swipeCommit: number;
  private phase: GesturePhase = 'ended';
  private x0 = 0;
  private y0 = 0;
  private t0 = 0;
  /** Moved past the slop, so a hold can no longer lift. */
  private moved = false;
  private x = 0;

  constructor(opts: { holdMs?: number; slop?: number; swipeStart?: number; swipeCommit?: number } = {}) {
    this.holdMs = opts.holdMs ?? HOLD_MS;
    this.slop = opts.slop ?? 8;
    this.swipeStart = opts.swipeStart ?? 10;
    this.swipeCommit = opts.swipeCommit ?? 90;
  }

  /** Horizontal distance from the press. */
  get dx(): number {
    return this.x - this.x0;
  }

  down(x: number, y: number, t: number): void {
    this.phase = 'pending';
    this.x0 = this.x = x;
    this.y0 = y;
    this.t0 = t;
    this.moved = false;
  }

  move(x: number, y: number, t: number): GesturePhase {
    this.tick(t);
    if (this.phase === 'ended' || this.phase === 'scroll') return this.phase;
    this.x = x;
    if (this.phase !== 'pending') return this.phase;
    const dx = Math.abs(x - this.x0);
    const dy = Math.abs(y - this.y0);
    if (dx >= this.swipeStart && dx > 1.3 * dy) this.phase = 'swipe';
    else if (dy > this.slop) this.phase = 'scroll';
    else if (Math.hypot(dx, dy) > this.slop) this.moved = true;
    return this.phase;
  }

  /** Turns `pending` into `drag` once `holdMs` passes with no movement beyond the slop. */
  tick(t: number): GesturePhase {
    if (this.phase === 'pending' && !this.moved && t - this.t0 >= this.holdMs) this.phase = 'drag';
    return this.phase;
  }

  up(t: number): GestureResult {
    const phase = this.tick(t);
    this.phase = 'ended';
    switch (phase) {
      case 'pending':
        return this.moved ? 'none' : 'tap';
      case 'drag':
        return 'drop';
      case 'swipe':
        if (this.dx >= this.swipeCommit) return 'swipeRight';
        if (this.dx <= -this.swipeCommit) return 'swipeLeft';
        return 'none';
      default:
        return 'none';
    }
  }
}

export interface RowGestureOptions {
  /** Off on desktop layouts, where rows are clicked and mouse-dragged instead. */
  enabled: boolean;
  onswiperight: (id: string) => void;
  onswipeleft: (id: string) => void;
  /** A lifted row was let go over a bucket (spec 4.4). */
  ondrop: (id: string, target: DropTarget) => void;
}

/** Past this the row shows what letting go will do. */
const SWIPE_HINT_PX = 40;

const TOUCH_EVENTS = ['touchmove', 'touchend', 'touchcancel'] as const;
/** Input that starts something new, so a click still owed to an earlier gesture is no longer coming. */
const NEW_INPUT = ['pointerdown', 'keydown'] as const;

/** The one finger being tracked on a row. */
interface Gesture {
  tracker: GestureTracker;
  row: HTMLElement;
  id: string;
  pointerId: number;
  /** Where the finger is now. */
  x: number;
  y: number;
  swiping: boolean;
  /** Runs when the hold time is up, so a still finger lifts the row. */
  holdTimer: ReturnType<typeof setTimeout>;
  /** Set once the row is lifted. */
  drag: TouchDrag | null;
}

/**
 * Touch gestures for every task row inside `node` (a Svelte action), told apart by `GestureTracker`: swipe
 * right and left with the row following the finger, and long-press drag (`lib/drag/touch-drag.ts`). A tap
 * stays the row's own click; the click that follows any other gesture is swallowed. Buttons inside a row
 * (complete, date label) keep their own taps. Vertical moves are left to the browser's scrolling (rows are
 * `touch-action: pan-y`) except while a row is lifted. Mouse pointers are ignored: mouse drag is HTML5 DnD.
 *
 * A lifted row also follows touch events: iOS may cancel the pointer when the finger moves (rows are
 * `touch-action: pan-y`), so a `pointercancel` leaves a lift in place, and `touchmove` / `touchend` carry it
 * on. Whichever release comes first (`pointerup` or `touchend`) drops it; the other finds no gesture.
 *
 * One gesture is tracked at a time. Its pointer events are heard on the window, so a row removed mid-gesture
 * still ends it. Touch events stay with the element the finger first touched even once it is removed, so
 * they are heard on the gesture's row as well as on the window (which keeps every touchmove cancelable).
 */
export function rowGestures(node: HTMLElement, initial: RowGestureOptions) {
  let opts = initial;
  let active: Gesture | null = null;
  /**
   * Set when a swipe, scroll or hold ends: the next click is that gesture's release, not a tap, however late a
   * busy phone sends it (so no time window). New input (any pointer going down, any key) clears it, since a
   * browser may send no click at all for a release (most don't after a moved touch), and the next real tap or
   * key press must still count.
   */
  let swallowClick = false;

  /** Ends the gesture: a lifted row is put down with no drop; a swiped row springs back (its CSS transition runs again). */
  function release(): void {
    if (!active) return;
    clearTimeout(active.holdTimer);
    for (const type of TOUCH_EVENTS) active.row.removeEventListener(type, ontouch);
    active.drag?.cancel();
    active.row.style.transition = '';
    active.row.style.transform = '';
    active.row.classList.remove('swipe-r', 'swipe-l');
    active = null;
  }

  function onpointerdown(e: PointerEvent): void {
    // A second finger, or the mouse, leaves the gesture in progress alone.
    if (!opts.enabled || e.pointerType === 'mouse' || !e.isPrimary) return;
    release();
    const row = rowOf(e.target);
    if (!row?.dataset.id || (e.target as Element).closest('button')) return;
    const tracker = new GestureTracker();
    const downAt = performance.now();
    tracker.down(e.clientX, e.clientY, downAt);
    const gesture: Gesture = {
      tracker,
      row,
      id: row.dataset.id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      swiping: false,
      holdTimer: setTimeout(() => lift(gesture, downAt + HOLD_MS), HOLD_MS),
      drag: null,
    };
    for (const type of TOUCH_EVENTS) row.addEventListener(type, ontouch, { passive: false });
    active = gesture;
  }

  /** The hold time is up: lifts the row if the finger stayed still. */
  function lift(gesture: Gesture, heldUntil: number): void {
    if (active !== gesture || gesture.drag) return;
    // The timer ran, so the hold time is up even if the clock reads a hair less.
    if (gesture.tracker.tick(Math.max(performance.now(), heldUntil)) !== 'drag') return;
    gesture.drag = liftRow(gesture.row, gesture.x, gesture.y);
    // Not a row in a bucket: let go, rather than hold the page still for a drag that can't happen.
    if (!gesture.drag) release();
  }

  /** Moves a swiped row with the finger. */
  function follow(gesture: Gesture, pointerId: number): void {
    const { row, tracker } = gesture;
    if (!gesture.swiping) {
      gesture.swiping = true;
      row.style.transition = 'none'; // follow the finger without lag
      try {
        row.setPointerCapture(pointerId);
      } catch {
        // Already captured (touch pointers are captured by the row they started on).
      }
    }
    row.style.transform = `translateX(${tracker.dx}px)`;
    row.classList.toggle('swipe-r', tracker.dx > SWIPE_HINT_PX);
    row.classList.toggle('swipe-l', tracker.dx < -SWIPE_HINT_PX);
  }

  function onpointermove(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId) return;
    active.x = e.clientX;
    active.y = e.clientY;
    const phase = active.tracker.move(e.clientX, e.clientY, performance.now());
    if (phase === 'swipe') follow(active, e.pointerId);
    else if (phase === 'drag') active.drag?.move(e.clientX, e.clientY);
  }

  function onpointerup(e: PointerEvent): void {
    if (active && e.pointerId === active.pointerId) finish();
  }

  /** The finger was let go: reads what the gesture was and acts on it. */
  function finish(): void {
    if (!active) return;
    const { tracker, id, drag } = active;
    const dropped = drag?.drop() ?? null;
    release();
    const result = tracker.up(performance.now());
    if (result !== 'tap') swallowClick = true;
    if (result === 'swipeRight') opts.onswiperight(id);
    else if (result === 'swipeLeft') opts.onswipeleft(id);
    else if (dropped) opts.ondrop(dropped.id, dropped.target);
  }

  function onpointercancel(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId || active.drag) return; // a lift carries on by touch events
    release();
    swallowClick = true;
  }

  /** The last touch event handled: one heard on the row is heard again on the window. */
  let handledTouch: TouchEvent | null = null;

  // Non-passive, so the page doesn't scroll under a lifted row; every other move scrolls as usual.
  function ontouch(e: TouchEvent): void {
    if (e === handledTouch) return;
    handledTouch = e;
    switch (e.type) {
      case 'touchcancel':
        release();
        return;
      case 'touchend':
        if (active?.drag && e.touches.length === 0) finish();
        return;
    }
    if (active?.tracker.tick(performance.now()) !== 'drag') return;
    e.preventDefault();
    const finger = e.touches.length === 1 ? e.changedTouches[0] : undefined; // a second finger doesn't steer
    if (finger && active.drag) active.drag.move(finger.clientX, finger.clientY);
  }

  // A drag or swipe left behind by an app switch or the lock screen is put down, not resumed.
  function onvisibilitychange(): void {
    if (document.hidden) release();
  }

  /** Heard on the window before anything else, so it runs ahead of the gesture the input may start. */
  function onnewinput(): void {
    swallowClick = false;
  }

  function onclick(e: MouseEvent): void {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  // Android shows a context menu on long-press; iOS's callout is off via CSS on the rows.
  function oncontextmenu(e: MouseEvent): void {
    if (opts.enabled && rowOf(e.target)) e.preventDefault();
  }

  for (const type of NEW_INPUT) window.addEventListener(type, onnewinput, true);
  node.addEventListener('pointerdown', onpointerdown);
  window.addEventListener('pointermove', onpointermove);
  window.addEventListener('pointerup', onpointerup);
  window.addEventListener('pointercancel', onpointercancel);
  for (const type of TOUCH_EVENTS) window.addEventListener(type, ontouch, { passive: false });
  document.addEventListener('visibilitychange', onvisibilitychange);
  node.addEventListener('click', onclick, true);
  node.addEventListener('contextmenu', oncontextmenu);
  return {
    update(next: RowGestureOptions) {
      opts = next;
      if (!opts.enabled) release();
    },
    destroy() {
      release();
      for (const type of NEW_INPUT) window.removeEventListener(type, onnewinput, true);
      node.removeEventListener('pointerdown', onpointerdown);
      window.removeEventListener('pointermove', onpointermove);
      window.removeEventListener('pointerup', onpointerup);
      window.removeEventListener('pointercancel', onpointercancel);
      for (const type of TOUCH_EVENTS) window.removeEventListener(type, ontouch);
      document.removeEventListener('visibilitychange', onvisibilitychange);
      node.removeEventListener('click', onclick, true);
      node.removeEventListener('contextmenu', oncontextmenu);
    },
  };
}

