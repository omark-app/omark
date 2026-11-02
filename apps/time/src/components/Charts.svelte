<script lang="ts">
  import { weeklyByCategory, weeklyByProject } from '@omark/time-core';
  import type { DateRange } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';
  import { chartsRange } from '../lib/views.ts';
  import RangePicker from './RangePicker.svelte';
  import WeekChart from './WeekChart.svelte';

  /** Spec 9, Charts: hours per week per project, and per category for one project. */
  let { store }: { store: TimeStore } = $props();
  let range = $state<DateRange | null>(null);
  let planned = $state(false);
  let code = $state('');
  const weekStart = $derived(store.config?.weekStart ?? 'monday');
  const byProject = $derived(range ? weeklyByProject(store.allRows, range, weekStart, store.nowMs(), planned) : null);
  const codes = $derived(byProject?.series.map((s) => s.key) ?? []);
  const chosen = $derived(codes.includes(code) ? code : (codes[0] ?? ''));
  const byCategory = $derived(range && chosen ? weeklyByCategory(store.allRows, chosen, range, weekStart, store.nowMs(), planned) : null);
</script>

<section class="card">
  <h2>Charts</h2>
  <!-- Charts can mount before the first sync (a reload on Charts): pick the range again once rows arrive. -->
  {#key store.allRows.length > 0}
    <RangePicker today={store.todayDate} weekStart={weekStart} initial={chartsRange(store.allRows, store.todayDate, weekStart, store.nowMs())} onchange={(r) => (range = r)} />
  {/key}
  <label class="planned"><input type="checkbox" bind:checked={planned} /> Include planned time</label>
</section>

{#if byProject}
  <section class="card" data-testid="chart-projects">
    <h2>Hours per week, by project</h2>
    {#if byProject.series.length === 0}
      <p class="muted">No tracked time in this range.</p>
    {:else}
      <WeekChart data={byProject} title="Hours per week, by project" />
    {/if}
  </section>
{/if}

{#if byCategory}
  <section class="card" data-testid="chart-categories">
    <div class="head">
      <h2>By category</h2>
      <label>Project
        <select value={chosen} onchange={(e) => (code = e.currentTarget.value)}>
          {#each codes as c (c)}<option value={c}>{c}</option>{/each}
        </select>
      </label>
    </div>
    <WeekChart data={byCategory} title="Hours per week of {chosen}, by category" />
  </section>
{/if}

<style>
  .planned {
    display: block;
    margin-top: 10px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  select {
    font: inherit;
    margin-left: 6px;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
  }
</style>
