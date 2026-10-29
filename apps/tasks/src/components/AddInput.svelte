<script lang="ts">
  import { bucketName as nameOf, readQuickAdd } from '@omark/tasks-core';
  import type { Dismissed } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import { part } from '../lib/part.svelte.ts';
  import ShortcutField from './ShortcutField.svelte';

  let { store }: { store: AppStore } = $props();

  let input: HTMLInputElement | undefined = $state();
  let value = $state('');
  let dismissed = $state<Dismissed[]>([]);
  const bucketName = $derived(nameOf(store.config.newTaskBucket));

  export function focus(): void {
    input?.focus();
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      // Shortcut words typed in the title set the date and the flags (issue #19); `hab` alone means today.
      const typed = readQuickAdd(value, store.ctx, dismissed);
      // A title of shortcut words only adds nothing; its text stays to be finished.
      if (store.add(typed.title, typed.when ?? (typed.habit ? 'today' : undefined), typed.important, typed.habit) || value.trim() === '') {
        value = '';
        dismissed = [];
      }
    } else if (e.key === 'Escape') {
      input!.blur();
    }
  }
</script>

<label class="add" data-testid="add">
  <ShortcutField
    bind:value
    bind:dismissed
    bind:input
    class="addfld"
    data-testid="add-input"
    data-draft
    placeholder="Add a task to {bucketName}"
    autocomplete="off"
    aria-label="Add a task"
    tags={part.tags}
    {onkeydown}
  />
  <kbd>/</kbd>
</label>

<style>
  .add { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--surface); }
  .add:focus-within { border-color: var(--accent); }
  .add :global(.addfld) { border: 0; outline: 0; padding: 0; background: transparent; font: 15px var(--mono); }
  kbd { font: 500 11px/1 var(--mono); color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 3px 5px; }
</style>
