<script lang="ts">
  import { habitLabel, habitsInProgress } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import { habitStateLine } from '../lib/habit-text.ts';

  let {
    store,
    variant,
    onopen,
    onhistory,
  }: {
    store: AppStore;
    /** `list` is the side pane and rail group; `cards` the phone's sideways row under the stats line. */
    variant: 'list' | 'cards';
    /** A card tap (the phone's edit sheet). */
    onopen: (id: string) => void;
    onhistory: () => void;
  } = $props();

  const habits = $derived(habitsInProgress(store.state.doc));
  const count = $derived(store.habitCount);
  const over = $derived(count.max > 0 && count.inProgress > count.max);
  const history = $derived(store.history);
  const visible = $derived(habits.length > 0 || history.formed.length > 0 || history.dropped.length > 0);
  /** `2 formed · 1 dropped ›`, leaving out a zero; `History ›` on the phone or with nothing to count. */
  const link = $derived.by(() => {
    const parts = [
      history.formed.length > 0 ? `${history.formed.length} formed` : '',
      history.dropped.length > 0 ? `${history.dropped.length} dropped` : '',
    ].filter((p) => p !== '');
    return variant === 'list' && parts.length > 0 ? `${parts.join(' · ')} ›` : 'History ›';
  });

  /** A card's second line: `12/66 · last chance`, `31/66 · done ✓`, `9/30 · Wed`. */
  function cardText(id: string): string {
    const task = habits.find((t) => t.id === id);
    const p = store.habits.get(id);
    if (!task || !p) return '';
    const l = habitLabel(task, p, store.ctx, store.config.dateLabels);
    const tail = p.lastChance ? 'last chance' : p.doneThisPeriod ? 'done ✓' : (l.tag ?? l.when);
    return tail ? `${l.count} · ${tail}` : l.count;
  }
</script>

{#if visible}
  <section class="habits {variant}" data-testid="habits-group">
    <div class="head">
      <h2>
        Habits
        <span class="n" class:over data-testid="habits-count">{count.max > 0 ? `${count.inProgress} of ${count.max}` : count.inProgress}</span>
      </h2>
      <button class="hist" data-testid="habits-history" onclick={onhistory}>{link}</button>
    </div>
    {#if variant === 'cards'}
      <div class="cards" data-testid="habit-cards">
        {#each habits as task (task.id)}
          {@const p = store.habits.get(task.id)}
          {#if p}
            <button class="card" class:last={p.lastChance} data-testid="habit-card" onclick={() => onopen(task.id)}>
              <span class="t">{task.title}</span>
              <span class="bar" aria-hidden="true"><span style="width: {Math.min(100, (p.count / p.rules.goal) * 100)}%"></span></span>
              <span class="s" class:last={p.lastChance} class:done={p.doneThisPeriod && !p.lastChance}>{cardText(task.id)}</span>
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      {#each habits as task (task.id)}
        {@const p = store.habits.get(task.id)}
        {#if p}
          <button class="item" class:sel={store.selectedId === task.id} data-testid="habit-item" onclick={() => store.select(task.id)}>
            <span class="top"><span class="t">{task.title}</span><span class="c">{p.count}/{p.rules.goal}</span></span>
            <span class="bar" aria-hidden="true"><span style="width: {Math.min(100, (p.count / p.rules.goal) * 100)}%"></span></span>
            <span class="state" class:last={p.lastChance} data-testid="habit-state">{habitStateLine(task, p, store.ctx)}</span>
          </button>
        {/if}
      {/each}
    {/if}
  </section>
{/if}

<style>
  .habits.list { display: flex; flex-direction: column; gap: 6px; border: 1px solid color-mix(in srgb, var(--habit) 30%, var(--line)); border-radius: 12px; padding: 12px 8px; background: var(--surface); }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 6px; }
  .habits.cards .head { padding: 4px 2px 6px; }
  h2 { margin: 0; font: 600 12px var(--sans); letter-spacing: .04em; text-transform: uppercase; color: var(--habit-ink); }
  .n { margin-left: 4px; font-weight: 500; color: var(--faint); }
  .n.over { color: var(--danger); }
  .hist { padding: 0; border: 0; background: none; font: 12px var(--sans); color: var(--accent); cursor: pointer; }
  .item { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 6px; border: 0; border-radius: 8px; background: none; color: inherit; text-align: left; cursor: pointer; }
  .item:hover { background: color-mix(in srgb, var(--sel) 55%, transparent); }
  .item.sel { background: var(--sel); }
  .top { display: flex; justify-content: space-between; gap: 8px; }
  .t { font: 13px var(--mono); color: var(--habit-ink); overflow-wrap: anywhere; }
  .c { font: 500 12px var(--sans); color: var(--habit-ink); font-variant-numeric: tabular-nums; }
  .bar { display: block; height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--habit) 18%, transparent); }
  .bar > span { display: block; height: 100%; border-radius: 3px; background: var(--habit); }
  .state { font: 11.5px var(--sans); color: var(--muted); }
  .state.last { color: var(--danger); }
  .cards { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: none; }
  .card { display: flex; flex-direction: column; gap: 6px; flex: 0 0 auto; width: 132px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--habit-soft); color: inherit; text-align: left; cursor: pointer; }
  .card.last { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
  .card .t { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card .bar { height: 4px; }
  .s { font: 500 11px var(--sans); color: var(--muted); }
  .s.last { color: var(--danger); }
  .s.done { color: var(--good); }
</style>
