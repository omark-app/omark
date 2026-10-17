<script lang="ts">
  import { describeRepeat, dueText, findTask } from '@taskapp/core';
  import type { AppStore, MovableBucket } from '../lib/store.svelte.ts';
  import MoveOptions from './MoveOptions.svelte';

  let {
    store,
    taskId,
    oncommand,
    onclose,
  }: { store: AppStore; taskId: string; oncommand: (command: 'pickDate' | 'repeat') => void; onclose: () => void } = $props();

  const task = $derived(findTask(store.state, taskId));
  $effect(() => {
    if (!task) onclose();
  });

  // svelte-ignore state_referenced_locally
  let title = $state(task?.title ?? '');
  // svelte-ignore state_referenced_locally
  let notes = $state(task?.notes.join('\n') ?? '');
  // Fields typed in since they were last saved. Only these are sent, so an outside change to the other
  // field is never overwritten with stale text.
  let titleDirty = false;
  let notesDirty = false;

  // Follow outside changes (sync, undo) per field until it is typed in.
  $effect(() => {
    if (!task) return;
    const t = task.title;
    const n = task.notes.join('\n');
    if (!titleDirty) title = t;
    if (!notesDirty) notes = n;
  });

  /** Saves what was typed. Every way out of the sheet saves (Undo takes it back), so typing is never lost. */
  function commit(): void {
    const current = findTask(store.state, taskId);
    if (current && (titleDirty || notesDirty)) {
      store.edit(taskId, {
        title: titleDirty ? title : current.title,
        notes: notesDirty ? notes.split('\n') : current.notes,
      });
    }
    titleDirty = false;
    notesDirty = false;
  }

  // The store runs this before every flush (the page being hidden) and refresh; closing the sheet commits too.
  $effect(() => {
    const off = store.registerPending(commit);
    return () => {
      off();
      commit();
    };
  });

  // Each action saves the typed text first, so the edit and its toast come before the action's.
  function save(): void {
    commit();
    onclose();
  }

  function move(bucket: MovableBucket): void {
    commit();
    store.moveTo(taskId, bucket);
    onclose();
  }

  function open(command: 'pickDate' | 'repeat'): void {
    commit();
    oncommand(command);
  }

  function titleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      save();
    }
  }
</script>

{#if task}
  <input
    bind:value={title}
    class="fld wide"
    aria-label="Task title"
    autocomplete="off"
    oninput={() => (titleDirty = true)}
    onkeydown={titleKey}
  />
  <textarea
    bind:value={notes}
    class="fld"
    rows={Math.max(2, notes.split('\n').length + 1)}
    placeholder="Notes, one per line"
    aria-label="Notes"
    oninput={() => (notesDirty = true)}
  ></textarea>
  <div class="sub due">{dueText(task, store.ctx)}{task.repeat ? ` · ↻ ${describeRepeat(task.repeat)}` : ''}</div>
  <MoveOptions
    {task}
    ctx={store.ctx}
    onmove={move}
    onpickdate={() => open('pickDate')}
    onrepeat={() => open('repeat')}
  />
  <div class="actions">
    <button class="btn danger" onclick={() => { store.remove(taskId); onclose(); }}>Delete</button>
    <button class="btn primary" onclick={save}>Save</button>
  </div>
{/if}

<style>
  .sub.due { margin-top: 0; }
</style>
