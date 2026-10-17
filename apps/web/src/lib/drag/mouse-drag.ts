import type { BucketKey, DropTarget } from '@taskapp/core';

/**
 * Desktop mouse drag with HTML5 DnD. The dragged task is kept here because `dragover` cannot read the
 * DataTransfer payload, and the highlight needs to know the task's own bucket.
 */
let dragged: { id: string; bucket: BucketKey } | null = null;

const clearMarks = (root: ParentNode): void => {
  root.querySelectorAll('.drop-before, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-into'));
};

const rowUnder = (e: DragEvent): HTMLElement | null =>
  e.target instanceof Element ? e.target.closest<HTMLElement>('[data-testid="task-row"]') : null;

export function dragStart(e: DragEvent, id: string, bucket: BucketKey): void {
  dragged = { id, bucket };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
}

export function dragEnd(): void {
  dragged = null;
  clearMarks(document);
}

/** Marks the bucket (unless it is the task's own) and the row under the pointer; accepts the drop. */
export function dragOver(e: DragEvent, section: HTMLElement, bucket: BucketKey): void {
  if (!dragged) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  clearMarks(document);
  if (bucket !== dragged.bucket) section.classList.add('drop-into');
  const row = rowUnder(e);
  if (row && row.dataset.id !== dragged.id) row.classList.add('drop-before');
}

/** Clears the marks when the pointer leaves the section for somewhere else. */
export function dragLeave(e: DragEvent, section: HTMLElement): void {
  if (!(e.relatedTarget instanceof Node) || !section.contains(e.relatedTarget)) clearMarks(section);
}

/** The task and target of a drop on `bucket`, or null when no task of ours is being dragged. */
export function dropAt(e: DragEvent, bucket: BucketKey): { id: string; target: DropTarget } | null {
  if (!dragged) return null;
  e.preventDefault();
  const id = dragged.id;
  const beforeId = rowUnder(e)?.dataset.id ?? null;
  dragEnd();
  return { id, target: { bucket, beforeId } };
}
