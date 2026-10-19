<script lang="ts">
  import { describeRepeat, dueText, findTask } from '@taskapp/core';
  import type { ChoiceKey } from '@taskapp/core';
  import { autogrow } from '../lib/autogrow.ts';
  import type { AppStore } from '../lib/store.svelte.ts';
  import { createTaskEdit } from '../lib/task-edit.svelte.ts';
  import MoveOptions from './MoveOptions.svelte';
  import ShortcutField from './ShortcutField.svelte';

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

  // Every way out of the sheet saves what was typed (Undo takes it back), so typing is never lost; the
  // page being hidden saves it too.
  // svelte-ignore state_referenced_locally
  const edit = createTaskEdit(store, taskId);

  // Each action saves the typed text first, so the edit and its toast come before the action's (and Undo
  // after a delete brings back the edited text).
  function save(): void {
    edit.commit();
    onclose();
  }

  function important(): void {
    edit.commit();
    store.setImportant(taskId, !task?.important);
    onclose();
  }

  function move(bucket: ChoiceKey): void {
    edit.commit();
    store.moveTo(taskId, bucket);
    onclose();
  }

  function open(command: 'pickDate' | 'repeat'): void {
    edit.commit();
    oncommand(command);
  }

  function remove(): void {
    edit.commit();
    store.remove(taskId);
    onclose();
  }

  function titleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      save();
    }
  }
</script>

{#if task}
  <ShortcutField
    bind:value={edit.title}
    bind:dismissed={edit.dismissed}
    class="fld wide"
    aria-label="Task title"
    autocomplete="off"
    ontype={() => edit.typed('title')}
    onkeydown={titleKey}
  />
  <textarea
    bind:value={edit.notes}
    class="fld"
    rows={2}
    use:autogrow={edit.notes}
    placeholder="Notes, one per line"
    aria-label="Notes"
    oninput={() => edit.typed('notes')}
  ></textarea>
  <div class="sub due">{dueText(task, store.ctx)}{task.repeat ? ` · ↻ ${describeRepeat(task.repeat)}` : ''}</div>
  <MoveOptions
    {task}
    ctx={store.ctx}
    onmove={move}
    onpickdate={() => open('pickDate')}
    onrepeat={() => open('repeat')}
    onimportant={important}
  />
  <div class="actions">
    <button class="btn danger" onclick={remove}>Delete</button>
    <button class="btn primary" onclick={save}>Save</button>
  </div>
{/if}

<style>
  .sub.due { margin-top: 0; }
</style>
