import { findTask } from '@taskapp/core';
import type { AppStore } from './store.svelte.ts';

type Field = 'title' | 'notes';

/**
 * The typed title and notes of one task, shared by the desktop detail and the phone edit sheet. Only fields
 * typed in since the last save are sent, so an outside change to the other field (arriving while one is
 * being typed in) is never overwritten with stale text. The store runs `commit` before every flush (the
 * page being hidden) and refresh, and unmounting the component commits too, so typing is never lost.
 * Call during component init.
 */
export function createTaskEdit(
  store: AppStore,
  id: string,
  /** True while a field must not follow outside changes even though it is not dirty (e.g. it has focus). */
  holds: (field: Field) => boolean = () => false,
) {
  const task = findTask(store.state, id);
  let title = $state(task?.title ?? '');
  let notes = $state(task?.notes.join('\n') ?? '');
  let titleDirty = false;
  let notesDirty = false;

  // Follow outside changes (undo, sync) per field, unless that field has been typed in.
  $effect(() => {
    const t = findTask(store.state, id);
    if (!t) return;
    const storedTitle = t.title;
    const storedNotes = t.notes.join('\n');
    if (!titleDirty && !holds('title')) title = storedTitle;
    if (!notesDirty && !holds('notes')) notes = storedNotes;
  });

  /** Saves the typed fields now. `settle` puts the stored values back in the fields. */
  function commit(settle = false): void {
    const current = findTask(store.state, id);
    if (current && (titleDirty || notesDirty)) {
      store.edit(id, {
        title: titleDirty ? title : current.title,
        notes: notesDirty ? notes.split('\n') : current.notes,
      });
    }
    titleDirty = false;
    notesDirty = false;
    if (settle) {
      const t = findTask(store.state, id);
      if (t) {
        title = t.title;
        notes = t.notes.join('\n');
      }
    }
  }

  $effect(() => {
    const off = store.registerPending(() => commit());
    return () => {
      off();
      commit();
    };
  });

  return {
    get title() {
      return title;
    },
    set title(v: string) {
      title = v;
    },
    get notes() {
      return notes;
    },
    set notes(v: string) {
      notes = v;
    },
    /** Marks a field as typed in, so it is saved by the next commit. */
    typed(field: Field): void {
      if (field === 'title') titleDirty = true;
      else notesDirty = true;
    },
    commit,
  };
}
