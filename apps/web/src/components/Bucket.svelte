<script lang="ts">
  import { bucketRange, tasksInBucket } from '@taskapp/core';
  import type { BucketKey, ISODate } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import TaskRow from './TaskRow.svelte';
  import { dragEnd, dragLeave, dragOver, dragStart, dropAt } from '../lib/drag/mouse-drag.ts';

  let {
    store,
    key,
    name,
    onpickdate,
    ondroppickdate,
    foldable = true,
  }: {
    store: AppStore;
    key: BucketKey;
    name: string;
    onpickdate?: (id: string) => void;
    /** A task was dropped on Later, which needs a date: the suggestion and the row to place it before. */
    ondroppickdate?: (id: string, suggested: ISODate, beforeId: string | null) => void;
    foldable?: boolean;
  } = $props();

  const EMPTY: Record<BucketKey, string> = {
    today: 'Nothing due. Enjoy it.',
    week: 'Nothing else this week.',
    next: 'Nothing planned yet.',
    later: 'Nothing scheduled.',
    someday: 'No someday ideas.',
  };

  const tasks = $derived(tasksInBucket(store.state.doc, key, store.ctx));
  const range = $derived(bucketRange(key, store.ctx));
  const folded = $derived(foldable && store.folded[key]);
  let section: HTMLElement | undefined = $state();

  function ondrop(e: DragEvent): void {
    const dropped = dropAt(e, key);
    if (!dropped) return;
    const out = store.drop(dropped.id, dropped.target);
    if (out.kind === 'pickDate') ondroppickdate?.(dropped.id, out.suggested, out.beforeId);
  }
</script>

<!-- Drop target for mouse drag; keyboard users move tasks with commands. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  bind:this={section}
  class="bucket"
  data-testid="bucket-{key}"
  ondragover={(e) => section && dragOver(e, section, key)}
  ondragleave={(e) => section && dragLeave(e, section)}
  {ondrop}
>
  {#snippet head()}
    {#if foldable}<span class="chev" aria-hidden="true">{folded ? '▸' : '▾'}</span>{/if}
    <span class="name">{name}</span>
    {#if range}<span class="range">{range}</span>{/if}
    <span class="count" data-testid="bucket-count-{key}">{tasks.length}</span>
  {/snippet}
  <h2>
    {#if foldable}
      <button class="bhead" data-testid="bucket-head-{key}" aria-expanded={!folded} onclick={() => store.toggleFold(key)}>{@render head()}</button>
    {:else}
      <div class="bhead static" data-testid="bucket-head-{key}">{@render head()}</div>
    {/if}
  </h2>
  {#if !folded}
    {#each tasks as task (task.id)}
      <TaskRow
        {task}
        ctx={store.ctx}
        labelStyle={store.config.dateLabels}
        selected={store.selectedId === task.id}
        onselect={() => store.select(task.id)}
        oncomplete={() => store.complete(task.id)}
        onpickdate={() => onpickdate?.(task.id)}
        ondragstart={(e) => dragStart(e, task.id, key)}
        ondragend={dragEnd}
      />
    {:else}
      <div class="empty">{EMPTY[key]}</div>
    {/each}
  {/if}
</section>

<style>
  .bucket:global(.drop-into) { background: color-mix(in srgb, var(--accent) 7%, transparent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent); }
  .bucket { display: flex; flex-direction: column; gap: 1px; border-radius: 10px; }
  .bhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; width: 100%; padding: 6px 10px; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; user-select: none; border-radius: 6px; }
  .bhead.static { cursor: default; }
  .bhead:hover .chev { color: var(--ink); }
  h2 { margin: 0; font: inherit; }
  .name { font: 600 17px/1.3 var(--mono); letter-spacing: -.01em; color: var(--ink); }
  .chev { width: 10px; font-size: 10px; color: var(--faint); transform: translateY(-1px); }
  .count { margin-left: auto; font: 13px var(--mono); color: var(--faint); font-variant-numeric: tabular-nums; }
  .range { font: 12px var(--mono); color: var(--faint); }
  .empty { padding: 4px 10px 6px 38px; font: 13px var(--mono); color: var(--faint); }
</style>
