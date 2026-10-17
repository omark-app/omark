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
    this.holdMs = opts.holdMs ?? 400;
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
}

/** Past this the row shows what letting go will do. */
const SWIPE_HINT_PX = 40;
/** A click this soon after a swipe, scroll or hold is the release of that gesture, not a tap. */
const CLICK_AFTER_GESTURE_MS = 400;

const rowOf = (el: EventTarget | null): HTMLElement | null =>
  el instanceof Element ? el.closest<HTMLElement>('[data-testid="task-row"]') : null;

/**
 * Touch gestures for every task row inside `node` (a Svelte action): swipe right and left, with the row
 * following the finger. A tap stays the row's own click; the click that follows any other gesture is
 * swallowed. Buttons inside a row (complete, date label) keep their own taps. Vertical moves are left to the
 * browser's scrolling (rows are `touch-action: pan-y`). Mouse pointers are ignored: mouse drag is HTML5 DnD.
 *
 * One gesture is tracked at a time; its tracker lives in `active`, which is where a long-press lift (the
 * tracker's `drag` phase, with a hold timer calling `tick`) attaches.
 */
export function rowGestures(node: HTMLElement, initial: RowGestureOptions) {
  let opts = initial;
  let active: { tracker: GestureTracker; row: HTMLElement; id: string; pointerId: number; swiping: boolean } | null = null;
  let swallowUntil = 0;

  function release(): void {
    if (!active) return;
    active.row.style.transform = '';
    active.row.classList.remove('swipe-r', 'swipe-l');
    active = null;
  }

  function onpointerdown(e: PointerEvent): void {
    release();
    swallowUntil = 0;
    if (!opts.enabled || e.pointerType === 'mouse' || !e.isPrimary) return;
    const row = rowOf(e.target);
    if (!row?.dataset.id || (e.target as Element).closest('button')) return;
    const tracker = new GestureTracker();
    tracker.down(e.clientX, e.clientY, performance.now());
    active = { tracker, row, id: row.dataset.id, pointerId: e.pointerId, swiping: false };
  }

  function onpointermove(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId) return;
    if (active.tracker.move(e.clientX, e.clientY, performance.now()) !== 'swipe') return;
    const { row, tracker } = active;
    if (!active.swiping) {
      active.swiping = true;
      try {
        row.setPointerCapture(e.pointerId);
      } catch {
        // Already captured (touch pointers are captured by the row they started on).
      }
    }
    row.style.transform = `translateX(${tracker.dx}px)`;
    row.classList.toggle('swipe-r', tracker.dx > SWIPE_HINT_PX);
    row.classList.toggle('swipe-l', tracker.dx < -SWIPE_HINT_PX);
  }

  function onpointerup(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId) return;
    const { tracker, id } = active;
    release();
    const result = tracker.up(performance.now());
    if (result !== 'tap') swallowUntil = performance.now() + CLICK_AFTER_GESTURE_MS;
    if (result === 'swipeRight') opts.onswiperight(id);
    else if (result === 'swipeLeft') opts.onswipeleft(id);
  }

  function onpointercancel(e: PointerEvent): void {
    if (!active || e.pointerId !== active.pointerId) return;
    release();
    swallowUntil = performance.now() + CLICK_AFTER_GESTURE_MS;
  }

  function onclick(e: MouseEvent): void {
    if (performance.now() >= swallowUntil) return;
    swallowUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }

  // Android shows a context menu on long-press; iOS's callout is off via CSS on the rows.
  function oncontextmenu(e: MouseEvent): void {
    if (opts.enabled && rowOf(e.target)) e.preventDefault();
  }

  node.addEventListener('pointerdown', onpointerdown);
  node.addEventListener('pointermove', onpointermove);
  node.addEventListener('pointerup', onpointerup);
  node.addEventListener('pointercancel', onpointercancel);
  node.addEventListener('click', onclick, true);
  node.addEventListener('contextmenu', oncontextmenu);
  return {
    update(next: RowGestureOptions) {
      opts = next;
      if (!opts.enabled) release();
    },
    destroy() {
      release();
      node.removeEventListener('pointerdown', onpointerdown);
      node.removeEventListener('pointermove', onpointermove);
      node.removeEventListener('pointerup', onpointerup);
      node.removeEventListener('pointercancel', onpointercancel);
      node.removeEventListener('click', onclick, true);
      node.removeEventListener('contextmenu', oncontextmenu);
    },
  };
}
