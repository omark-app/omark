import type { DoneEntry } from '@taskapp/core';

/** A result the user opened: an open task, or a completion from done.md. */
export type SearchResult = { kind: 'task'; id: string } | { kind: 'done'; entry: DoneEntry };

/**
 * The search panel's state, owned by the app shell so the query and results outlive the panel while a
 * result is open. `viewing` is the task shown in the desktop detail, or null for a sheet (the phone's edit
 * sheet, a completed task); closing that view brings the panel back.
 */
export type SearchSession = ReturnType<typeof createSearch>;

export function createSearch() {
  let mode = $state<'closed' | 'open' | 'viewing'>('closed');
  let query = $state('');
  let withDone = $state(false);
  let active = $state(0);
  let viewing = $state<string | null>(null);
  /** Where focus was when search opened; it goes back there when search closes. */
  let opener: HTMLElement | null = null;

  return {
    get mode() { return mode; },
    get viewing() { return viewing; },
    get query() { return query; },
    set query(q: string) {
      query = q;
      active = 0;
    },
    /** True once "Also search N completed" was chosen; kept until search closes. */
    get withDone() { return withDone; },
    set withDone(on: boolean) { withDone = on; },
    /** The highlighted row (↑/↓, hover). */
    get active() { return active; },
    set active(i: number) { active = i; },
    /** Opens the panel; a fresh open (not a return from a result) starts empty. */
    open(): void {
      if (mode === 'closed') {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        query = '';
        withDone = false;
        active = 0;
      }
      mode = 'open';
      viewing = null;
    },
    /** Hides the panel while a result is open; `id` is the task in the desktop detail, null for a sheet. */
    view(id: string | null): void {
      mode = 'viewing';
      viewing = id;
    },
    /** The open result was closed: show the panel again, query and results kept. */
    back(): void {
      if (mode === 'viewing') this.open();
    },
    /** Closes search; `restoreFocus` false when the user moved on elsewhere (e.g. selected another task). */
    close(restoreFocus = true): void {
      mode = 'closed';
      viewing = null;
      const o = opener;
      opener = null;
      if (restoreFocus && o?.isConnected) o.focus();
    },
  };
}
