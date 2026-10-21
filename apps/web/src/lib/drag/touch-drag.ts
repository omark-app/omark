import type { DropTarget } from '@omark/core';
import { bucketAt, clearDropMarks, dropTarget, markDropTarget, rowOf } from './drop-target.ts';

/** The finger this close to the top or bottom edge scrolls the page (spec 9.2). */
const AUTOSCROLL_TOP_PX = 90;
const AUTOSCROLL_BOTTOM_PX = 150;
/** Autoscroll speed: one px per frame for every this many px into the zone. */
const AUTOSCROLL_EASE = 6;

/** A row lifted by a long press (see `rowGestures`), following the finger until it is dropped or cancelled. */
export interface TouchDrag {
  /** The finger moved to (x, y), in viewport coordinates. */
  move(x: number, y: number): void;
  /** Ends the drag where the finger was let go: the task and its target, or null outside every bucket. */
  drop(): { id: string; target: DropTarget } | null;
  /** Ends the drag with no drop. */
  cancel(): void;
}

/**
 * Lifts `row` under a finger at (x, y): the row is dimmed (`.lifted`) and a floating copy (`.drag-ghost`)
 * follows the finger up and down. The bucket and row under the finger are marked as for a mouse drag, and the
 * page scrolls while the finger is in an edge zone. Null when `row` is not a task row inside a bucket.
 */
export function liftRow(row: HTMLElement, x: number, y: number): TouchDrag | null {
  const id = row.dataset.id;
  const from = bucketAt(row);
  if (!id || !from) return null;
  const dragged = { id, bucket: from.bucket };

  const box = row.getBoundingClientRect();
  const ghost = row.cloneNode(true) as HTMLElement;
  // A copy for the eye only: not a row for tests, drop targets or assistive tech.
  for (const attr of ['data-testid', 'data-id', 'draggable']) ghost.removeAttribute(attr);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.remove('sel', 'swipe-r', 'swipe-l', 'drop-before');
  ghost.classList.add('drag-ghost');
  ghost.style.left = `${box.left}px`;
  ghost.style.top = `${box.top}px`;
  ghost.style.width = `${box.width}px`;
  document.body.append(ghost);
  row.classList.add('lifted');

  const grabY = y - box.top;
  let lastX = x;
  let lastY = y;

  /** Marks what is under the finger and returns it as a drop target (null outside every bucket). */
  function mark(): DropTarget | null {
    const el = document.elementFromPoint(lastX, lastY);
    const at = bucketAt(el);
    if (!at) {
      clearDropMarks();
      return null;
    }
    const over = rowOf(el);
    markDropTarget(dragged, at.section, at.bucket, over);
    return dropTarget(at.bucket, over);
  }

  let frame = requestAnimationFrame(function autoscroll() {
    const bottomZone = window.innerHeight - AUTOSCROLL_BOTTOM_PX;
    const speed =
      lastY < AUTOSCROLL_TOP_PX
        ? -Math.ceil((AUTOSCROLL_TOP_PX - lastY) / AUTOSCROLL_EASE)
        : lastY > bottomZone
          ? Math.ceil((lastY - bottomZone) / AUTOSCROLL_EASE)
          : 0;
    if (speed) {
      window.scrollBy(0, speed);
      mark(); // the page moved under a still finger
    }
    frame = requestAnimationFrame(autoscroll);
  });

  function cancel(): void {
    cancelAnimationFrame(frame);
    ghost.remove();
    row.classList.remove('lifted');
    clearDropMarks();
  }

  return {
    move(nx, ny) {
      lastX = nx;
      lastY = ny;
      ghost.style.top = `${ny - grabY}px`;
      mark();
    },
    drop() {
      const target = mark();
      cancel();
      return target && { id, target };
    },
    cancel,
  };
}
