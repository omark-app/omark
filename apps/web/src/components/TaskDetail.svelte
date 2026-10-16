<script lang="ts">
  import { bucketOf, BUCKETS, describeRepeat, dueText, findTask, hasWeekLeft } from '@taskapp/core';
  import type { BucketKey, Task } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';

  let {
    store,
    task,
    oncommand,
  }: { store: AppStore; task: Task; oncommand: (command: 'pickDate' | 'repeat') => void } = $props();

  // `id` never changes for a mounted detail (the parent keys on it), so reading it once is intended.
  // svelte-ignore state_referenced_locally
  const id = task.id;
  // svelte-ignore state_referenced_locally
  let title = $state(task.title);
  // svelte-ignore state_referenced_locally
  let notes = $state(task.notes.join('\n'));
  let titleEl: HTMLInputElement | undefined = $state();
  let notesEl: HTMLTextAreaElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const bucket = $derived(bucketOf(task, store.ctx));
  const bucketName = $derived(BUCKETS.find((b) => b.key === bucket)!.name);
  const over = $derived(task.date !== null && task.date < store.ctx.today);
  const weekLeft = $derived(hasWeekLeft(store.ctx));
  const chips = $derived(
    (weekLeft
      ? [['today', 'Today'], ['week', 'This week'], ['next', 'Next week'], ['someday', 'Someday']]
      : [['today', 'Today'], ['next', 'Next week'], ['someday', 'Someday']]) as [
      Exclude<BucketKey, 'later'>,
      string,
    ][],
  );

  const editing = (): boolean => document.activeElement === titleEl || document.activeElement === notesEl;

  // Follow outside changes (undo, sync) unless the person is typing in a field.
  $effect(() => {
    const t = task.title;
    const n = task.notes.join('\n');
    if (editing()) return;
    title = t;
    notes = n;
  });

  /** Saves the fields now. `settle` puts the stored values (trimmed, blank notes dropped) back in the fields. */
  function save(settle: boolean): void {
    clearTimeout(timer);
    timer = undefined;
    store.edit(id, { title, notes: notes.split('\n') });
    if (settle) {
      const t = findTask(store.state, id);
      if (t) {
        title = t.title;
        notes = t.notes.join('\n');
      }
    }
  }

  function typed(): void {
    clearTimeout(timer);
    timer = setTimeout(() => save(false), store.config.saveDelaySeconds * 1000);
  }

  $effect(() => () => clearTimeout(timer));

  export function focusTitle(): void {
    titleEl?.focus();
    titleEl?.setSelectionRange(title.length, title.length);
  }

  function titleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (notes.trim() !== '') notes = notes.replace(/\s*$/, '') + '\n';
      notesEl?.focus();
      notesEl?.setSelectionRange(notes.length, notes.length);
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
      bind:value={title}
      class="d-title"
      data-testid="detail-title"
      aria-label="Task title"
      oninput={typed}
      onkeydown={titleKey}
      onblur={() => save(true)}
    />
    <textarea
      bind:this={notesEl}
      bind:value={notes}
      class="d-notes"
      data-testid="detail-notes"
      rows={Math.max(3, notes.split('\n').length + 1)}
      placeholder="Notes, one per line"
      aria-label="Notes"
      oninput={typed}
      onkeydown={notesKey}
      onblur={() => save(true)}
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
        {#each chips as [key, label] (key)}
          <button class="chipb" class:on={bucket === key} onclick={() => store.moveTo(id, key)}>{label}</button>
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
  .d-notes { font: 14px/1.6 var(--mono); color: var(--muted); resize: vertical; min-height: 60px; }
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
