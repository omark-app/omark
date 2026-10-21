<script lang="ts">
  import { describeRepeat, metaLabel } from '@omark/core';
  import type { DateLabelStyle, Task, WeekCtx } from '@omark/core';

  let {
    task,
    ctx,
    labelStyle,
    selected = false,
    onselect,
    oncomplete,
    onpickdate,
    draggable = true,
    ondragstart,
    ondragend,
  }: {
    task: Task;
    ctx: WeekCtx;
    labelStyle: DateLabelStyle;
    selected?: boolean;
    onselect?: () => void;
    oncomplete?: () => void;
    onpickdate?: () => void;
    /** HTML5 drag, for the mouse. Off on a phone, where a long press lifts the row instead (lib/gestures.ts). */
    draggable?: boolean;
    ondragstart?: (e: DragEvent) => void;
    ondragend?: () => void;
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
<div bind:this={el} class="task" class:sel={selected} class:imp={task.important} data-testid="task-row" data-id={task.id} data-important={task.important === true} {draggable} onclick={onselect} {ondragstart} {ondragend}>
  <button class="check" data-testid="task-check" aria-label="Complete {task.title}" onclick={(e) => { e.stopPropagation(); oncomplete?.(); }}></button>
  <div class="title">
    {task.title}{#if task.notes.length > 0}<span class="ni" title="{task.notes.length} note{task.notes.length > 1 ? 's' : ''}">≡</span>{/if}
  </div>
  <button class="meta" class:empty class:over={label.overdue} data-testid="task-meta" title={tip} onclick={(e) => { e.stopPropagation(); onpickdate?.(); }}>
    {#if empty}{task.date ? 'today' : 'no date'}{:else}{#if label.repeat}<span class="rep">↻</span>{/if}{#if label.repeat && label.text}{' '}{/if}{label.text ?? ''}{/if}
  </button>
</div>

<style>
  .task { position: relative; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 6px 6px 6px 10px; border-radius: 8px; touch-action: pan-y; user-select: none; transition: background .12s, transform .18s ease-out; cursor: default; -webkit-touch-callout: none; }
  .task:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .task:global(.drop-before) { box-shadow: inset 0 2px 0 var(--accent); }
  /* A row lifted by a long press stays in place, dimmed, while its copy (.drag-ghost) follows the finger. */
  .task:global(.lifted) { opacity: .35; }
  .task:global(.drag-ghost) { position: fixed; z-index: 90; margin: 0; pointer-events: none; background: var(--surface); border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, .24); transform: scale(1.03); transition: none; }
  /* Set while a finger swipes the row (lib/gestures.ts): right completes, left opens the move sheet. */
  .task:global(.swipe-r) { background: color-mix(in srgb, var(--good) 16%, var(--surface)); }
  .task:global(.swipe-l) { background: var(--chip); }
  .task.sel { background: var(--sel); }
  .check { width: 16px; height: 16px; margin-top: 3px; padding: 0; border: 1.5px solid var(--faint); border-radius: 50%; background: transparent; cursor: pointer; }
  .check:hover { border-color: var(--good); background: color-mix(in srgb, var(--good) 15%, transparent); }
  .title { font: 15px/1.45 var(--mono); overflow-wrap: anywhere; min-width: 0; }
  /* Important (issue #19): an amber circle and title. */
  .task.imp .check { border: 2px solid var(--imp); }
  .task.imp .title { color: var(--imp); font-weight: 500; }
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
