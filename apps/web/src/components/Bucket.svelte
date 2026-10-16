<script lang="ts">
  import { bucketRange, tasksInBucket } from '@taskapp/core';
  import type { BucketKey } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import TaskRow from './TaskRow.svelte';

  let { store, key, name }: { store: AppStore; key: BucketKey; name: string } = $props();

  const EMPTY: Record<BucketKey, string> = {
    today: 'Nothing due. Enjoy it.',
    week: 'Nothing else this week.',
    next: 'Nothing planned yet.',
    later: 'Nothing scheduled.',
    someday: 'No someday ideas.',
  };

  const tasks = $derived(tasksInBucket(store.state.doc, key, store.ctx));
  const range = $derived(bucketRange(key, store.ctx));
  const folded = $derived(store.folded[key]);
</script>

<section class="bucket" data-testid="bucket-{key}">
  <button class="bhead" data-testid="bucket-head-{key}" aria-expanded={!folded} onclick={() => store.toggleFold(key)}>
    <span class="chev" aria-hidden="true">{folded ? '▸' : '▾'}</span>
    <h2>{name}</h2>
    {#if range}<span class="range">{range}</span>{/if}
    <span class="count" data-testid="bucket-count-{key}">{tasks.length}</span>
  </button>
  {#if !folded}
    {#each tasks as task (task.id)}
      <TaskRow {task} ctx={store.ctx} labelStyle={store.config.dateLabels} selected={store.selectedId === task.id} />
    {:else}
      <div class="empty">{EMPTY[key]}</div>
    {/each}
  {/if}
</section>

<style>
  .bucket { display: flex; flex-direction: column; gap: 1px; border-radius: 10px; }
  .bhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; width: 100%; padding: 6px 10px; background: none; border: 0; cursor: pointer; text-align: left; user-select: none; border-radius: 6px; }
  .bhead:hover .chev { color: var(--ink); }
  h2 { margin: 0; font: 600 17px/1.3 var(--mono); letter-spacing: -.01em; }
  .chev { width: 10px; font-size: 10px; color: var(--faint); transform: translateY(-1px); }
  .count { margin-left: auto; font: 13px var(--mono); color: var(--faint); font-variant-numeric: tabular-nums; }
  .range { font: 12px var(--mono); color: var(--faint); }
  .empty { padding: 4px 10px 6px 38px; font: 13px var(--mono); color: var(--faint); }
</style>
