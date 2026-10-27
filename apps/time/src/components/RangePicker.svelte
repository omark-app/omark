<script lang="ts">
  import { untrack } from 'svelte';
  import { namedRange } from '@omark/time-core';
  import type { DateRange, RangeName, WeekStart } from '@omark/time-core';
  import { customRange } from '../lib/views.ts';

  let {
    today,
    weekStart,
    onchange,
    initial = 'thisWeek',
  }: {
    today: string;
    weekStart: WeekStart;
    /** Null while a custom range is not valid, so nothing shows numbers for the last good one. */
    onchange: (range: DateRange | null) => void;
    initial?: RangeName | 'custom';
  } = $props();

  const NAMES: { id: RangeName | 'custom'; label: string }[] = [
    { id: 'thisWeek', label: 'This week' },
    { id: 'lastWeek', label: 'Last week' },
    { id: 'thisMonth', label: 'This month' },
    { id: 'lastMonth', label: 'Last month' },
    { id: 'custom', label: 'Custom' },
  ];

  // The range the picker starts on; changing `initial` later does not move it.
  let name = $state<RangeName | 'custom'>(untrack(() => initial));
  let from = $state('');
  let to = $state('');
  const custom = $derived(customRange(from, to));
  const range = $derived(name === 'custom' ? (typeof custom === 'string' ? null : custom) : namedRange(name, today, weekStart));

  $effect(() => {
    onchange(range);
  });

  function choose(id: RangeName | 'custom') {
    if (id === 'custom' && from === '' && range) {
      from = range.from;
      to = range.to;
    }
    name = id;
  }
</script>

<div class="range" role="group" aria-label="Range">
  <div class="names">
    {#each NAMES as n (n.id)}
      <button type="button" class:on={name === n.id} aria-pressed={name === n.id} onclick={() => choose(n.id)}>{n.label}</button>
    {/each}
  </div>
  {#if name === 'custom'}
    <div class="custom">
      <label>From <input type="date" bind:value={from} /></label>
      <label>To <input type="date" bind:value={to} /></label>
      {#if typeof custom === 'string'}<span class="error" role="alert">{custom}</span>{/if}
    </div>
  {/if}
  {#if range}<p class="muted dates" data-testid="range">{range.from} – {range.to}</p>{/if}
</div>

<style>
  .names {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .names button {
    background: var(--chip);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 12px;
    cursor: pointer;
  }
  .names button.on {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .custom {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 10px;
  }
  input {
    font: inherit;
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
  }
  .error {
    color: var(--danger);
  }
  .dates {
    font-family: var(--mono);
    font-size: 13px;
    margin: 8px 0 0;
  }
</style>
