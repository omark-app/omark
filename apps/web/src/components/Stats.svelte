<script lang="ts">
  import type { Stats } from '@taskapp/core';

  let { stats, variant }: { stats: Stats; variant: 'box' | 'line' } = $props();

  const ARROW = { up: '↑', down: '↓', flat: '→' } as const;
  const avg = $derived(stats.avg === null ? '–' : stats.avg.toFixed(1));
  const prev = $derived(stats.prev7 === null ? '–' : String(stats.prev7));
  const arrow = $derived(stats.prev7 !== null && stats.trend ? stats.trend : null);
</script>

{#snippet bracket(text: string, trend: 'up' | 'down' | 'flat' | null)}
  <span class="br">({text}{#if trend} <span class={trend}>{ARROW[trend]}</span>{/if})</span>
{/snippet}

{#if variant === 'box'}
  <div class="statsbox" data-testid="stats">
    <div class="stat" title="Done today (your daily average)">
      <span class="lab">Today</span>{' '}<span><span class="val">{stats.today}</span> {@render bracket(avg, null)}</span>
    </div>
    <div class="stat" title="Last 7 full days (the 7 before that)">
      <span class="lab">7d</span>{' '}<span><span class="val">{stats.last7}</span> {@render bracket(prev, arrow)}</span>
    </div>
    <div class="stat" title="All-time completions">
      <span class="lab">All</span>{' '}<span><span class="val">{stats.all}</span></span>
    </div>
  </div>
{:else}
  <div class="statline" data-testid="stats">
    <span title="Done today (your daily average)">Today <b>{stats.today}</b> {@render bracket(avg, null)}</span>
    <span title="Last 7 full days (the 7 before that)">7d <b>{stats.last7}</b> {@render bracket(prev, arrow)}</span>
    <span title="All-time completions">All <b>{stats.all}</b></span>
  </div>
{/if}

<style>
  .statsbox { margin-top: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; border-top: 1px dashed var(--line); padding: 14px 6px 2px; }
  .stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lab { font: 500 11px var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .val { font: 500 22px/1.15 var(--mono); font-variant-numeric: tabular-nums; }
  .br { font: 13px var(--mono); color: var(--muted); }
  .up { color: var(--good); }
  .down { color: var(--danger); }
  .flat { color: var(--muted); }
  .statline { font: 13px var(--mono); color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 14px; font-variant-numeric: tabular-nums; }
  .statline b { color: var(--ink); font-weight: 600; }
</style>
