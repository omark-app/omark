import { tick } from 'svelte';
import { findTask, hasWeekLeft } from '@taskapp/core';
import type { Command } from '@taskapp/core';
import type { AppStore } from './store.svelte.ts';
import { commandFor, isTypingTarget, sheetOpen } from './keys.ts';

/** What the views report upward: the app shell owns the pickers. Each carries the task id. */
export type ShellCommand = 'pickDate' | 'repeat' | 'edit';
export type OnCommand = (command: ShellCommand, id: string) => void;

/** Reactive "under 720 px" flag (phones always get the Task list). Call during component init. */
export function createPhone(): { readonly value: boolean } {
  const query = window.matchMedia('(max-width: 719.98px)');
  let value = $state(query.matches);
  $effect(() => {
    const on = (): void => {
      value = query.matches;
    };
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  });
  return {
    get value() {
      return value;
    },
  };
}

/** Enter on a focused button or link is that control's own click, never the edit command. */
const isControl = (el: EventTarget | null): boolean => el instanceof Element && el.closest('button, a') !== null;

/**
 * The keyboard and double-click commands shared by the Task list and the Week board. The view supplies what
 * only it can reach (the add input, the detail's title field); the store supplies the visible-row order.
 */
export function createCommands(opts: {
  store: AppStore;
  phone: { readonly value: boolean };
  focusAdd: () => void;
  focusTitle: () => void;
  onCommand: OnCommand;
}): { onkeydown: (e: KeyboardEvent) => void; ondblclick: (e: MouseEvent) => void } {
  const { store, phone, focusAdd, focusTitle, onCommand } = opts;

  /** Runs `command`; true when it did something, so the key press is consumed. */
  function run(command: Command): boolean {
    switch (command) {
      case 'focusAdd':
        if (phone.value) return false;
        focusAdd();
        return true;
      case 'down': store.selectNext(1); return true;
      case 'up': store.selectNext(-1); return true;
      case 'undo': store.undo(); return true;
      case 'deselect': store.select(null); return true;
      case 'switchView': store.switchView(); return true;
    }
    const id = store.selectedId;
    if (id === null) return false;
    switch (command) {
      case 'today': store.moveTo(id, 'today'); break;
      case 'thisWeek': store.moveTo(id, hasWeekLeft(store.ctx) ? 'week' : 'today'); break;
      case 'nextWeek': store.moveTo(id, 'next'); break;
      case 'someday': store.moveTo(id, 'someday'); break;
      case 'complete': store.complete(id); break;
      case 'delete': store.remove(id); break;
      case 'edit':
        if (phone.value) return false;
        void tick().then(focusTitle);
        onCommand(command, id);
        break;
      case 'pickDate':
      case 'repeat':
        onCommand(command, id);
        break;
    }
    return true;
  }

  return {
    onkeydown(e) {
      const command = commandFor(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          repeat: e.repeat,
          typing: isTypingTarget(e.target) || sheetOpen(),
        },
        store.config.shortcuts,
      );
      if (command === 'edit' && isControl(e.target)) return;
      if (command !== null && run(command)) e.preventDefault();
    },
    ondblclick(e) {
      if (phone.value || isControl(e.target)) return;
      const row = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-testid="task-row"]') : null;
      if (!row?.dataset.id) return;
      store.select(row.dataset.id);
      run('edit');
    },
  };
}

/** The selected task, or null (also when it no longer exists). */
export function selectedTask(store: AppStore) {
  return store.selectedId === null ? null : (findTask(store.state, store.selectedId) ?? null);
}
