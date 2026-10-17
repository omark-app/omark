<script lang="ts">
  import { BUCKETS } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';

  let { store }: { store: AppStore } = $props();

  let input: HTMLInputElement | undefined = $state();
  const bucketName = $derived(BUCKETS.find((b) => b.key === store.config.newTaskBucket)!.name);

  export function focus(): void {
    input?.focus();
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const title = input!.value;
      input!.value = '';
      store.add(title);
    } else if (e.key === 'Escape') {
      input!.blur();
    }
  }
</script>

<label class="add">
  <input
    bind:this={input}
    data-testid="add-input"
    placeholder="Add a task to {bucketName}"
    autocomplete="off"
    aria-label="Add a task"
    {onkeydown}
  />
  <kbd>/</kbd>
</label>

<style>
  .add { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--surface); }
  .add:focus-within { border-color: var(--accent); }
  input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 15px var(--mono); color: var(--ink); }
  input::placeholder { color: var(--faint); }
  kbd { font: 500 11px/1 var(--mono); color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 3px 5px; }
</style>
