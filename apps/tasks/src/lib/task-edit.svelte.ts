import { untrack } from 'svelte';
import { findTask, readQuickAdd, shortcutWords } from '@omark/tasks-core';
import type { Dismissed } from '@omark/tasks-core';
import type { AppStore } from './store.svelte.ts';

type Field = 'title' | 'notes';

/**
 * The typed title and notes of one task, shared by the desktop detail and the phone edit sheet. Only fields
 * typed in since the last save are sent, so an outside change to the other field (arriving while one is
 * being typed in) is never overwritten with stale text. The store runs `commit` before every flush (the
 * page being hidden) and refresh, and unmounting the component commits too, so typing is never lost.
 * Shortcut words typed in the title (issue #19) move or flag the task when it saves, and then leave the
 * field; words the title already had when it was shown stay plain text. The commit before a flush is not
 * final, so it holds back a habit rename; unmounting is. Call during component init.
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
  /** Shortcut words that are plain text: those the shown title already had, and those Backspace turned back. */
  let dismissed = $state<Dismissed[]>(existing(title));
  let titleDirty = false;
  let notesDirty = false;

  // Follow outside changes (undo, sync) per field, unless that field has been typed in.
  $effect(() => {
    const t = findTask(store.state, id);
    if (!t) return;
    const storedTitle = t.title;
    const storedNotes = t.notes.join('\n');
    if (!titleDirty && !holds('title') && untrack(() => title) !== storedTitle) {
      title = storedTitle;
      dismissed = existing(title);
    }
    if (!notesDirty && !holds('notes')) notes = storedNotes;
  });

  /** True when saving `typed` would rename a habit that has progress, which restarts its count (habits spec 8). */
  function restartsHabit(typed: string): boolean {
    const t = findTask(store.state, id);
    const p = store.habits.get(id);
    const next = typed.trim();
    return t?.habit !== undefined && p !== undefined && (p.count > 0 || p.best > 0) && next !== '' && next !== t.title;
  }

  /**
   * Saves the typed fields now. `settle` puts the stored values back in the fields. A rename that restarts
   * a habit waits for a `final` commit (Enter, blur, closing: Review Focus 5), so a save while typing never
   * asks; the store asks then, and a no puts the stored title back.
   */
  function commit(settle = false, final = settle): void {
    const current = findTask(store.state, id);
    const typed = titleDirty ? readQuickAdd(title, store.ctx, dismissed) : null;
    const renames = typed !== null && restartsHabit(typed.title);
    if (current && renames && !final) {
      if (notesDirty) store.edit(id, { title: current.title, notes: notes.split('\n') });
      notesDirty = false;
      return;
    }
    if (current && (titleDirty || notesDirty)) {
      const patch = {
        title: typed ? typed.title : current.title,
        notes: notesDirty ? notes.split('\n') : current.notes,
        when: typed?.when ?? null,
        important: typed?.important ?? false,
      };
      store.edit(id, patch);
      const after = findTask(store.state, id);
      if (renames && after?.title === current.title) {
        // Said no to the rename: the rest of what was typed still saves, and the field shows the stored title.
        store.edit(id, { ...patch, title: current.title });
        title = current.title;
        dismissed = existing(title);
      }
    }
    titleDirty = false;
    notesDirty = false;
    // Words that did their job leave the field, even while it has focus, so a later save can't apply them again.
    const applied = typed !== null && shortcutWords(title, dismissed).length > 0 && typed.title !== '';
    if (applied) {
      const t = findTask(store.state, id);
      if (t) {
        title = t.title;
        dismissed = existing(title);
      }
    }
    if (settle) {
      const t = findTask(store.state, id);
      if (t) {
        if (title !== t.title) dismissed = existing(t.title);
        title = t.title;
        notes = t.notes.join('\n');
      }
    }
  }

  $effect(() => {
    const off = store.registerPending(() => commit());
    return () => {
      off();
      commit(false, true);
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
    get dismissed() {
      return dismissed;
    },
    set dismissed(v: Dismissed[]) {
      dismissed = v;
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

/** The shortcut words a title already has, as dismissed: shown and saved as plain text. */
function existing(title: string): Dismissed[] {
  return shortcutWords(title).map((w) => ({ start: w.start, word: w.word }));
}
