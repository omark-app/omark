import type { BucketKey, DropTarget } from '@omark/tasks-core';
import type { AppStore } from '../store.svelte.ts';
import type { OnDropPickDate } from '../commands.svelte.ts';

/** The task being dragged, by mouse or finger, and the bucket it is dragged from. */
export interface Dragged {
  id: string;
  bucket: BucketKey;
}

/** The task row an element is part of. */
export const rowOf = (el: EventTarget | null): HTMLElement | null =>
  el instanceof Element ? el.closest<HTMLElement>('[data-testid="task-row"]') : null;

/** The bucket section an element is in, with its key. */
export function bucketAt(el: Element | null): { section: HTMLElement; bucket: BucketKey } | null {
  const section = el?.closest<HTMLElement>('[data-bucket]');
  return section ? { section, bucket: section.dataset.bucket as BucketKey } : null;
}

export function clearDropMarks(root: ParentNode = document): void {
  root.querySelectorAll('.drop-before, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-into'));
}

/**
 * Shows where `dragged` would land (spec 4.4): the bucket is highlighted unless it is the task's own, and a
 * line marks the row it would go before.
 */
export function markDropTarget(dragged: Dragged, section: HTMLElement, bucket: BucketKey, row: HTMLElement | null): void {
  clearDropMarks();
  if (bucket !== dragged.bucket) section.classList.add('drop-into');
  if (row && row.dataset.id !== dragged.id) row.classList.add('drop-before');
}

/** The drop on `bucket`, before `row` when there is one. */
export const dropTarget = (bucket: BucketKey, row: HTMLElement | null): DropTarget => ({ bucket, beforeId: row?.dataset.id ?? null });

/** Applies a drop; one on Later asks for a date (`onpickdate`) instead. */
export function applyDrop(store: AppStore, id: string, target: DropTarget, onpickdate?: OnDropPickDate): void {
  const out = store.drop(id, target);
  if (out.kind === 'pickDate') onpickdate?.(id, out.suggested, out.beforeId);
}
