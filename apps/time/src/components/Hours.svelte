<script lang="ts">
  import { formatHours, summarise } from '@omark/time-core';
  import type { DateRange } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';
  import RangePicker from './RangePicker.svelte';

  /** Spec 9, Hours: per project with its categories, done and planned apart, and totals. */
  let { store }: { store: TimeStore } = $props();
  let range = $state<DateRange | null>(null);
  const summary = $derived(range ? summarise(store.allRows, range, store.nowMs()) : null);
  const describe = (code: string) => store.projects.find((p) => p.code === code)?.description ?? '';
  const h = (n: number) => `${formatHours(n)} h`;
</script>

<section class="card">
  <h2>Hours</h2>
  <RangePicker today={store.todayDate} weekStart={store.config?.weekStart ?? 'monday'} onchange={(r) => (range = r)} />
</section>

{#if summary}
  <section class="card" data-testid="hours">
    {#if summary.projects.length === 0}
      <p class="muted">No tracked time in this range.</p>
    {:else}
      <table>
        <thead>
          <tr><th scope="col">Project</th><th scope="col" class="n">Done</th><th scope="col" class="n">Planned</th></tr>
        </thead>
        {#each summary.projects as p (p.code)}
          <tbody data-testid="project-hours" data-code={p.code}>
            <tr class="project">
              <th scope="row"><span class="code">{p.code}</span> <span class="muted">{describe(p.code)}</span></th>
              <td class="n">{h(p.done)}</td>
              <td class="n">{p.planned > 0 ? h(p.planned) : ''}</td>
            </tr>
            {#each p.categories as c (c.name)}
              <tr class="category">
                <th scope="row">{c.name || 'No category'}</th>
                <td class="n">{h(c.done)}</td>
                <td class="n">{c.planned > 0 ? h(c.planned) : ''}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
        <tfoot>
          <tr><th scope="row">Total</th><td class="n" data-testid="total-done">{h(summary.done)}</td><td class="n">{summary.planned > 0 ? h(summary.planned) : ''}</td></tr>
        </tfoot>
      </table>
    {/if}
    {#if summary.unknown > 0}
      <p class="muted"><a href="#/fix">{h(summary.unknown)} with unknown codes</a> are not counted.</p>
    {/if}
  </section>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 6px 4px;
    font-weight: normal;
  }
  thead th {
    color: var(--muted);
    font-size: 13px;
  }
  .n {
    text-align: right;
    font-family: var(--mono);
    white-space: nowrap;
  }
  .project th,
  .project td {
    border-top: 1px solid var(--line);
    font-weight: 600;
  }
  .project .muted {
    font-weight: normal;
  }
  .category th {
    padding-left: 18px;
  }
  .category th,
  .category td {
    color: var(--muted);
  }
  .code {
    font-family: var(--mono);
  }
  tfoot th,
  tfoot td {
    border-top: 2px solid var(--line);
    font-weight: 600;
  }
  a {
    color: var(--accent);
  }
</style>
