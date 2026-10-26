<script lang="ts">
  import { findTask } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
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
</script>

{#if task}
  <h3>{task.title}</h3>
  <div class="sub">Move to…</div>
  <MoveOptions
    {task}
    ctx={store.ctx}
    onmove={(bucket) => { store.moveTo(taskId, bucket); onclose(); }}
    onpickdate={() => oncommand('pickDate')}
    onrepeat={() => oncommand('repeat')}
    onimportant={() => { store.setImportant(taskId, !task.important); onclose(); }}
  />
  <div class="actions">
    <button class="btn danger" onclick={() => { store.remove(taskId); onclose(); }}>Delete</button>
    <button class="btn ghost" onclick={onclose}>Cancel</button>
  </div>
{/if}
