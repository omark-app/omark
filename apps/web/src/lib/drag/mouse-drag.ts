import type { BucketKey, DropTarget } from '@taskapp/core';
import { clearDropMarks, dropTarget, markDropTarget, rowOf } from './drop-target.ts';
import type { Dragged } from './drop-target.ts';

/**
 * Desktop mouse drag with HTML5 DnD. The dragged task is kept here because `dragover` cannot read the
 * DataTransfer payload, and the highlight needs to know the task's own bucket.
 */
let dragged: Dragged | null = null;

export function dragStart(e: DragEvent, id: string, bucket: BucketKey): void {
  dragged = { id, bucket };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
}

export function dragEnd(): void {
  dragged = null;
  clearDropMarks();
}

/** Marks the bucket (unless it is the task's own) and the row under the pointer; accepts the drop. */
export function dragOver(e: DragEvent, section: HTMLElement, bucket: BucketKey): void {
  if (!dragged) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  markDropTarget(dragged, section, bucket, rowOf(e.target));
}

/** Clears the marks when the pointer leaves the section for somewhere else. */
export function dragLeave(e: DragEvent, section: HTMLElement): void {
  if (!(e.relatedTarget instanceof Node) || !section.contains(e.relatedTarget)) clearDropMarks(section);
}

/** The task and target of a drop on `bucket`, or null when no task of ours is being dragged. */
export function dropAt(e: DragEvent, bucket: BucketKey): { id: string; target: DropTarget } | null {
  if (!dragged) return null;
  e.preventDefault();
  const id = dragged.id;
  const target = dropTarget(bucket, rowOf(e.target));
  dragEnd();
  return { id, target };
}
