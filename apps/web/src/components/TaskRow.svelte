<script lang="ts">
  import { describeRepeat, metaLabel } from '@taskapp/core';
  import type { DateLabelStyle, Task, WeekCtx } from '@taskapp/core';

  let {
    task,
    ctx,
    labelStyle,
    selected = false,
    onselect,
    oncomplete,
  }: {
    task: Task;
    ctx: WeekCtx;
    labelStyle: DateLabelStyle;
    selected?: boolean;
    onselect?: () => void;
    oncomplete?: () => void;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (selected) el?.scrollIntoView?.({ block: 'nearest' });
  });

  const label = $derived(metaLabel(task, ctx, labelStyle));
  const empty = $derived(label.text === null && !label.repeat);
  const tip = $derived(
    (task.repeat ? `Repeats ${describeRepeat(task.repeat)} · ` : '') + 'Click to change the date',
  );
</script>

<!-- Keyboard users select with j/k, so the click handler is a pointer convenience. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div bind:this={el} class="task" class:sel={selected} data-testid="task-row" data-id={task.id} onclick={onselect}>
  <button class="check" data-testid="task-check" aria-label="Complete {task.title}" onclick={(e) => { e.stopPropagation(); oncomplete?.(); }}></button>
  <div class="title">
    {task.title}{#if task.notes.length > 0}<span class="ni" title="{task.notes.length} note{task.notes.length > 1 ? 's' : ''}">≡</span>{/if}
  </div>
  <button class="meta" class:empty class:over={label.overdue} data-testid="task-meta" title={tip}>
    {#if empty}{task.date ? 'today' : 'no date'}{:else}{#if label.repeat}<span class="rep">↻</span>{/if}{#if label.repeat && label.text}{' '}{/if}{label.text ?? ''}{/if}
  </button>
</div>

<style>
  .task { position: relative; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 6px 6px 6px 10px; border-radius: 8px; touch-action: pan-y; user-select: none; transition: background .12s; cursor: default; -webkit-touch-callout: none; }
  .task:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .task.sel { background: var(--sel); }
  .check { width: 16px; height: 16px; margin-top: 3px; padding: 0; border: 1.5px solid var(--faint); border-radius: 50%; background: transparent; cursor: pointer; }
  .check:hover { border-color: var(--good); background: color-mix(in srgb, var(--good) 15%, transparent); }
  .title { font: 15px/1.45 var(--mono); overflow-wrap: anywhere; min-width: 0; }
  .ni { margin-left: 6px; font-size: 12px; color: var(--faint); }
  .meta { margin-top: 1px; padding: 1px 5px; border: 0; border-radius: 5px; background: none; cursor: pointer; font: 12px/1.45 var(--mono); color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .meta:hover { background: var(--chip); color: var(--ink); }
  .meta.over { color: var(--danger); }
  .meta.empty { color: transparent; }
  .task:hover .meta.empty, .task.sel .meta.empty { color: var(--faint); }
  .rep { color: var(--faint); }
  .meta.over .rep { color: inherit; }
  @media (max-width: 719.98px) {
    .title { font-size: 16px; }
    .task { padding: 9px 4px 9px 8px; }
    .meta { font-size: 13px; }
    .meta.empty { display: none; }
  }
</style>
