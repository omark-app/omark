<script module lang="ts">
  import type { MovableBucket } from '@taskapp/core';

  /** What was typed and chosen. It outlives a dismissed sheet and is cleared only by a successful Add. */
  const draft = $state<{ title: string; bucket: MovableBucket | null }>({ title: '', bucket: null });
</script>

<script lang="ts">
  import { movableBuckets } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';

  let { store, onclose }: { store: AppStore; onclose: () => void } = $props();

  const chips = $derived(movableBuckets(store.ctx));
  // The configured bucket for new tasks until a chip is chosen; Today when that chip is not offered (This
  // week on its last day).
  const bucket = $derived.by(() => {
    const wanted = draft.bucket ?? store.config.newTaskBucket;
    return chips.some((c) => c.key === wanted) ? wanted : 'today';
  });
  let input: HTMLInputElement | undefined = $state();

  function choose(key: MovableBucket): void {
    draft.bucket = key;
    input?.focus();
  }

  function add(): void {
    if (store.add(draft.title, bucket)) {
      draft.title = '';
      draft.bucket = null;
    }
    onclose();
  }
</script>

<form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
  <input bind:this={input} bind:value={draft.title} class="fld wide" data-autofocus placeholder="What needs doing?" autocomplete="off" aria-label="New task" />
  <div class="chips">
    {#each chips as chip (chip.key)}
      <button type="button" class="chip" class:on={bucket === chip.key} aria-pressed={bucket === chip.key} onclick={() => choose(chip.key)}>{chip.name}</button>
    {/each}
  </div>
  <div class="actions">
    <button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
    <button type="submit" class="btn primary">Add</button>
  </div>
</form>

<style>
  .add { display: flex; flex-direction: column; gap: 12px; }
</style>
