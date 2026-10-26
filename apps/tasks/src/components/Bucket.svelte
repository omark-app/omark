<script lang="ts">
  import { bucketRange, tasksInBucket } from '@omark/tasks-core';
  import type { BucketKey, ISODate } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import TaskRow from './TaskRow.svelte';
  import { dragEnd, dragLeave, dragOver, dragStart, dropAt } from '../lib/drag/mouse-drag.ts';
  import { applyDrop } from '../lib/drag/drop-target.ts';

  let {
    store,
    key,
    name,
    onpickdate,
    ondroppickdate,
    onopen,
  }: {
    store: AppStore;
    key: BucketKey;
    name: string;
    onpickdate?: (id: string) => void;
    /** A task was dropped on Later, which needs a date: the suggestion and the row to place it before. */
    ondroppickdate?: (id: string, suggested: ISODate, beforeId: string | null) => void;
    /** Given on a phone: a row tap opens the task (its edit sheet) instead of selecting it, and rows lift by long press, not HTML5 drag. */
    onopen?: (id: string) => void;
  } = $props();

  /** Shown only in an empty bucket the user unfolded: an empty one starts folded. */
  const EMPTY: Record<BucketKey, string> = {
    today: 'Nothing due. Enjoy it.',
    tomorrow: 'Nothing due tomorrow.',
    week: 'Nothing else this week.',
    next: 'Nothing planned yet.',
    later: 'Nothing scheduled.',
    someday: 'No someday ideas.',
    important: 'Nothing here. Flag an undated task important to keep it in sight.',
  };
  /** Important, not urgent never folds (#38): its header is a plain heading. */
  const fixed = $derived(key === 'important');

  const tasks = $derived(tasksInBucket(store.state.doc, key, store.ctx));
  const range = $derived(bucketRange(key, store.ctx));
  const folded = $derived(store.folded[key]);
  let section: HTMLElement | undefined = $state();

  /** Without `onopen` (desktop) the date label selects its row too, as a click on the row would. */
  function pickDate(id: string): void {
    if (!onopen) store.select(id);
    onpickdate?.(id);
  }

  function ondrop(e: DragEvent): void {
    const dropped = dropAt(e, key);
    if (dropped) applyDrop(store, dropped.id, dropped.target, ondroppickdate);
  }
</script>

<!-- Drop target for mouse drag (touch drag finds it by `data-bucket`); keyboard users move tasks with commands. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  bind:this={section}
  class="bucket"
  data-testid="bucket-{key}"
  data-bucket={key}
  ondragover={(e) => section && dragOver(e, section, key)}
  ondragleave={(e) => section && dragLeave(e, section)}
  {ondrop}
>
  <h2>
    {#if fixed}
      <div class="bhead fixed" data-testid="bucket-head-{key}">
        <span class="name">{name}</span>
        <span class="count" data-testid="bucket-count-{key}">{tasks.length}</span>
      </div>
    {:else}
      <button class="bhead" data-testid="bucket-head-{key}" aria-expanded={!folded} onclick={() => store.toggleFold(key)}>
        <span class="chev" aria-hidden="true">{folded ? '▸' : '▾'}</span>
        <span class="name">{name}</span>
        {#if range}<span class="range">{range}</span>{/if}
        <span class="count" data-testid="bucket-count-{key}">{tasks.length}</span>
      </button>
    {/if}
  </h2>
  {#if !folded}
    {#each tasks as task (task.id)}
      <TaskRow
        {task}
        ctx={store.ctx}
        labelStyle={store.config.dateLabels}
        selected={store.selectedId === task.id}
        onselect={() => (onopen ? onopen(task.id) : store.select(task.id))}
        oncomplete={() => store.complete(task.id)}
        onpickdate={() => pickDate(task.id)}
        draggable={!onopen}
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
  .bhead:hover .chev { color: var(--ink); }
  .bhead.fixed { cursor: default; }
  h2 { margin: 0; font: inherit; }
  .name { font: 600 17px/1.3 var(--mono); letter-spacing: -.01em; color: var(--ink); }
  .chev { width: 10px; font-size: 10px; color: var(--faint); transform: translateY(-1px); }
  .count { margin-left: auto; font: 13px var(--mono); color: var(--faint); font-variant-numeric: tabular-nums; }
  .range { font: 12px var(--mono); color: var(--faint); }
  .empty { padding: 4px 10px 6px 38px; font: 13px var(--mono); color: var(--faint); }
</style>
