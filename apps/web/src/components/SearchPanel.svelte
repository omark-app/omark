<script lang="ts">
  import { allTasks, bucketOf, BUCKETS, dayMonth, markedParts, metaLabel, searchDone, searchTasks } from '@omark/core';
  import type { DoneHit, Marked, Task, TaskHit } from '@omark/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import type { SearchResult, SearchSession } from '../lib/search.svelte.ts';

  let { store, search, onopen }: { store: AppStore; search: SearchSession; onopen: (r: SearchResult) => void } = $props();

  /** Completed matches shown at most; done.md grows forever, and one more word narrows it. */
  const DONE_LIMIT = 100;

  type Row = { kind: 'task'; hit: TaskHit } | { kind: 'more' } | { kind: 'done'; hit: DoneHit };

  let input: HTMLInputElement | undefined = $state();
  let list: HTMLDivElement | undefined = $state();

  const tasks = $derived(searchTasks(allTasks(store.state.doc), search.query));
  const done = $derived(searchDone(store.state.done, search.query));
  const rows = $derived<Row[]>([
    ...tasks.map((hit): Row => ({ kind: 'task', hit })),
    ...(done.length === 0 ? [] : search.withDone ? done.slice(0, DONE_LIMIT).map((hit): Row => ({ kind: 'done', hit })) : [{ kind: 'more' } as Row]),
  ]);
  const active = $derived(Math.min(search.active, rows.length - 1));

  $effect(() => {
    input?.focus();
  });

  $effect(() => {
    list?.querySelector(`#search-row-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  });

  /** The row's date or bucket label, as the task list shows it (the bucket name where a row shows none). */
  function when(t: Task): { text: string; over: boolean; repeat: boolean } {
    const label = metaLabel(t, store.ctx, store.config.dateLabels);
    const text = label.text ?? BUCKETS.find((b) => b.key === bucketOf(t, store.ctx))!.name;
    return { text, over: label.overdue, repeat: label.repeat };
  }

  function choose(row: Row): void {
    if (row.kind === 'more') {
      search.withDone = true;
      input?.focus();
    } else if (row.kind === 'task') onopen({ kind: 'task', id: row.hit.task.id });
    else onopen({ kind: 'done', entry: row.hit.entry });
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      search.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length > 0) search.active = Math.min(rows.length - 1, Math.max(0, active + (e.key === 'ArrowDown' ? 1 : -1)));
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const row = rows[active];
      if (row) choose(row);
    } else if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+K again keeps the panel, not the browser's own search.
      e.preventDefault();
      input?.select();
    }
  }
</script>

{#snippet marked(m: Marked)}
  {#each markedParts(m) as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="search" data-testid="search" {onkeydown}>
  <!-- Esc is the keyboard way out, so the backdrop needs no key handler. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="backdrop" onclick={() => search.close()}></div>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Search">
    <div class="bar">
      <span class="glass" aria-hidden="true">🔍</span>
      <input
        bind:this={input}
        bind:value={() => search.query, (q) => (search.query = q)}
        data-testid="search-input"
        placeholder="Search tasks and notes"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="go"
        role="combobox"
        aria-label="Search"
        aria-expanded={rows.length > 0}
        aria-controls="search-results"
        aria-activedescendant={rows.length > 0 ? `search-row-${active}` : undefined}
      />
      <button class="xbtn" data-testid="search-close" title="Close (Esc)" aria-label="Close search" onclick={() => search.close()}>✕</button>
    </div>
    <div class="results" id="search-results" role="listbox" aria-label="Results" bind:this={list}>
      {#if search.query.trim() === ''}
        <p class="empty">Type words from a title or a note.</p>
      {:else if tasks.length === 0}
        <p class="empty">No open tasks match.</p>
      {/if}
      {#each rows as row, i (row.kind === 'task' ? row.hit.task.id : row.kind === 'done' ? `d${row.hit.index}` : 'more')}
        {#if row.kind === 'done' && (i === 0 || rows[i - 1]!.kind !== 'done')}
          <div class="lab" role="presentation">Completed · {done.length}</div>
        {/if}
        <!-- Arrows move through the rows from the input (aria-activedescendant), so rows stay out of the Tab order. -->
        <button
          id="search-row-{i}"
          class="row"
          class:on={i === active}
          class:more={row.kind === 'more'}
          class:done={row.kind === 'done'}
          data-testid={row.kind === 'more' ? 'search-more' : 'search-result'}
          role="option"
          aria-selected={i === active}
          tabindex="-1"
          onpointermove={() => (search.active = i)}
          onclick={() => choose(row)}
        >
          {#if row.kind === 'more'}
            Also search {done.length} completed
          {:else}
            {@const hit = row.hit}
            <span class="title" class:imp={row.kind === 'task' && row.hit.task.important}>{@render marked(hit.title)}</span>
            {#if row.kind === 'task'}
              {@const w = when(row.hit.task)}
              <span class="meta" class:over={w.over}>{#if w.repeat}<span class="rep">↻</span>{' '}{/if}{w.text}</span>
            {:else}
              <span class="meta">✅ {dayMonth(row.hit.entry.doneOn!, store.ctx)}</span>
            {/if}
            {#if hit.note}<span class="note">≡ {@render marked(hit.note)}</span>{/if}
          {/if}
        </button>
      {/each}
      {#if search.withDone && done.length > DONE_LIMIT}
        <p class="empty">The first {DONE_LIMIT} of {done.length} completed are shown; add a word to narrow them.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Over the board and the + button; sheets opened from a result go on top. */
  .search { position: fixed; inset: 0; z-index: 50; }
  .backdrop { position: absolute; inset: 0; background: rgba(8, 12, 20, .38); }
  .panel { position: absolute; left: 50%; top: 12vh; transform: translateX(-50%); width: min(640px, calc(100% - 32px)); max-height: 72vh; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
  .bar { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  .glass { font-size: 14px; filter: grayscale(1); opacity: .6; }
  input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 16px var(--mono); color: var(--ink); }
  input::placeholder { color: var(--faint); }
  .xbtn { border: 1px solid var(--line); background: var(--surface); border-radius: 6px; padding: 2px 7px; font: 11px var(--mono); color: var(--muted); cursor: pointer; }
  .results { overflow-y: auto; overscroll-behavior: contain; padding: 6px; display: flex; flex-direction: column; gap: 1px; }
  .empty { margin: 0; padding: 10px; font: 13px var(--mono); color: var(--faint); }
  .lab { padding: 10px 10px 4px; font: 500 11px var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: none; color: var(--ink); text-align: left; cursor: pointer; }
  .row.on { background: var(--sel); }
  .title { font: 15px/1.45 var(--mono); overflow-wrap: anywhere; min-width: 0; }
  .title.imp { color: var(--imp); font-weight: 500; }
  .meta { font: 12px/1.45 var(--mono); color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; margin-top: 1px; }
  .meta.over { color: var(--danger); }
  .rep { color: var(--faint); }
  .note { grid-column: 1 / -1; font: 13px/1.5 var(--mono); color: var(--muted); overflow-wrap: anywhere; }
  .row.done .title { text-decoration: line-through; text-decoration-color: var(--faint); color: var(--muted); }
  .row.more { display: block; font: 13px var(--mono); color: var(--accent); }
  mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 3px; }
  /* On a phone the same search fills the screen. */
  @media (max-width: 719.98px) {
    .backdrop { display: none; }
    .panel { inset: 0; transform: none; width: auto; max-height: none; border: 0; border-radius: 0; box-shadow: none; background: var(--bg); padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
    .bar { padding: 12px 16px; }
    .xbtn { padding: 6px 10px; font-size: 13px; }
    .results { padding: 6px 8px; }
    .row { padding: 11px 8px; }
    .title { font-size: 16px; }
    .meta { font-size: 13px; }
  }
</style>
