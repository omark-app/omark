<script lang="ts">
  import { bucketOf, BUCKETS, describeRepeat, dueText, movableBuckets } from '@taskapp/core';
  import type { Task } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import { autogrow } from '../lib/autogrow.ts';
  import { createTaskEdit } from '../lib/task-edit.svelte.ts';

  let {
    store,
    task,
    oncommand,
  }: { store: AppStore; task: Task; oncommand: (command: 'pickDate' | 'repeat') => void } = $props();

  // `id` never changes for a mounted detail (the parent keys on it), so reading it once is intended.
  // svelte-ignore state_referenced_locally
  const id = task.id;
  let titleEl: HTMLInputElement | undefined = $state();
  let notesEl: HTMLTextAreaElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const bucket = $derived(bucketOf(task, store.ctx));
  const bucketName = $derived(BUCKETS.find((b) => b.key === bucket)!.name);
  const over = $derived(task.date !== null && task.date < store.ctx.today);
  const chips = $derived(movableBuckets(store.ctx));

  // A focused field keeps its text even before it is typed in. Unmounting (another task, deselect, the
  // task gone) commits.
  // svelte-ignore state_referenced_locally
  const edit = createTaskEdit(store, id, (field) => document.activeElement === (field === 'title' ? titleEl : notesEl));

  /** Commits the typed text to the store now. `settle` puts the stored values back in the fields. */
  function commit(settle = false): void {
    clearTimeout(timer);
    timer = undefined;
    edit.commit(settle);
  }

  // A debounced save left after unmounting has nothing to do: the unmount committed.
  $effect(() => () => clearTimeout(timer));

  function typed(field: 'title' | 'notes'): void {
    edit.typed(field);
    clearTimeout(timer);
    timer = setTimeout(() => {
      commit();
      void store.flush();
    }, store.config.saveDelaySeconds * 1000);
  }

  function blurred(e: FocusEvent): void {
    // Moving between the two fields keeps what is typed (e.g. the new note line after Shift+Enter).
    commit(e.relatedTarget !== titleEl && e.relatedTarget !== notesEl);
  }

  export function focusTitle(): void {
    titleEl?.focus();
    titleEl?.setSelectionRange(edit.title.length, edit.title.length);
  }

  function titleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (edit.notes.trim() !== '') edit.notes = edit.notes.replace(/\s*$/, '') + '\n';
      notesEl?.focus();
      notesEl?.setSelectionRange(edit.notes.length, edit.notes.length);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      titleEl?.blur();
    }
  }

  function notesKey(e: KeyboardEvent): void {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'Escape') {
      e.preventDefault();
      notesEl?.blur();
    }
  }
</script>

<div class="detail" data-testid="detail">
  <div class="top">
    <span class="lab">Task · {bucketName}</span>
    <button class="xbtn" title="Close (Esc)" onclick={() => store.select(null)}>esc</button>
  </div>
  <div>
    <input
      bind:this={titleEl}
      bind:value={edit.title}
      class="d-title"
      data-testid="detail-title"
      aria-label="Task title"
      oninput={() => typed('title')}
      onkeydown={titleKey}
      onblur={blurred}
    />
    <textarea
      bind:this={notesEl}
      bind:value={edit.notes}
      class="d-notes"
      data-testid="detail-notes"
      rows={3}
      use:autogrow={edit.notes}
      placeholder="Notes, one per line"
      aria-label="Notes"
      oninput={() => typed('notes')}
      onkeydown={notesKey}
      onblur={blurred}
    ></textarea>
  </div>
  <div class="fields">
    <div class="row">
      <span class="lab k">Due</span>
      <button class="val" class:over data-testid="detail-due" onclick={() => oncommand('pickDate')}>{dueText(task, store.ctx)}</button>
    </div>
    <div class="row">
      <span class="k"></span>
      <div class="chips">
        {#each chips as chip (chip.key)}
          <button class="chipb" class:on={bucket === chip.key} onclick={() => store.moveTo(id, chip.key)}>{chip.name}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="lab k">Repeat</span>
      <button class="val" data-testid="detail-repeat" onclick={() => oncommand('repeat')}>{task.repeat ? '↻ ' + describeRepeat(task.repeat) : 'No repeat'}</button>
    </div>
  </div>
  <div class="actions">
    <button class="btn" onclick={() => store.complete(id)}>Complete</button>
    <button class="btn danger" onclick={() => store.remove(id)}>Delete</button>
  </div>
  <div class="ehint">Enter saves · Shift+Enter adds a note · Esc closes</div>
</div>

<style>
  .detail { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .lab { font: 500 11px var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
  .d-title, .d-notes { box-sizing: border-box; width: 100%; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink); outline: 0; padding: 4px 6px; }
  .d-title { font: 600 17px/1.4 var(--mono); }
  .d-notes { font: 14px/1.6 var(--mono); color: var(--muted); resize: none; overflow-y: hidden; }
  .d-title:hover, .d-notes:hover { border-color: var(--line); }
  .d-title:focus, .d-notes:focus { border-color: var(--accent); background: var(--surface); }
  .fields { display: flex; flex-direction: column; gap: 8px; padding: 10px 6px; border-block: 1px dashed var(--line); }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .row .k { width: 58px; flex: none; }
  .val { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 7px; padding: 5px 10px; font: 13px var(--mono); cursor: pointer; }
  .val:hover { border-color: var(--accent); }
  .val.over { color: var(--danger); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chipb { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 5px 10px; font: 12.5px var(--mono); cursor: pointer; }
  .chipb:hover { border-color: var(--faint); }
  .chipb.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 6px; }
  .btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 7px 13px; font: 500 13px var(--sans); cursor: pointer; }
  .btn:hover { border-color: var(--faint); }
  .btn.danger { color: var(--danger); }
  .xbtn { border: 1px solid var(--line); background: var(--surface); border-radius: 6px; padding: 2px 7px; font: 11px var(--mono); color: var(--muted); cursor: pointer; }
  .ehint { font: 11px var(--mono); color: var(--faint); padding: 0 6px; }
</style>
