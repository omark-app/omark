<script lang="ts">
  import { BUCKETS, hasWeekLeft } from '@taskapp/core';
  import type { AppStore, MovableBucket } from '../lib/store.svelte.ts';

  let { store, onclose }: { store: AppStore; onclose: () => void } = $props();

  const weekLeft = $derived(hasWeekLeft(store.ctx));
  // Later has no single date, and This week is hidden on the last day of the week (it would be Today).
  const chips = $derived(BUCKETS.filter((b) => b.key !== 'later' && (b.key !== 'week' || weekLeft)) as { key: MovableBucket; name: string }[]);

  // The chip starts on the configured bucket for new tasks; after that it is the user's choice.
  // svelte-ignore state_referenced_locally
  let bucket = $state<MovableBucket>(store.config.newTaskBucket === 'week' && !weekLeft ? 'today' : store.config.newTaskBucket);
  let title = $state('');
  let input: HTMLInputElement | undefined = $state();

  function choose(key: MovableBucket): void {
    bucket = key;
    input?.focus();
  }

  function add(): void {
    store.add(title, bucket);
    onclose();
  }
</script>

<form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
  <input bind:this={input} bind:value={title} class="fld wide" data-autofocus placeholder="What needs doing?" autocomplete="off" aria-label="New task" />
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
