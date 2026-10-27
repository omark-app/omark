<script lang="ts">
  import { buildReport, formatHours, reportToCsv, reportToMarkdown } from '@omark/time-core';
  import type { DateRange, ReportOptions, Rounding } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';
  import { reportFileName } from '../lib/views.ts';
  import RangePicker from './RangePicker.svelte';

  /** Spec 9, Report export: one client, or one or more projects, and a range; CSV of the rows or Markdown. */
  let { store }: { store: TimeStore } = $props();
  let range = $state<DateRange | null>(null);
  let by = $state<'projects' | 'client'>('projects');
  let picked = $state<string[] | null>(null);
  let client = $state('');
  let rounding = $state<Rounding>(0);
  let planned = $state(false);

  const active = $derived(store.projects.filter((p) => p.archived === ''));
  const clients = $derived([...new Set(store.projects.map((p) => p.client).filter((c) => c !== ''))].sort());
  // Every active project is ticked until the user changes the ticks.
  const codes = $derived(picked ?? active.map((p) => p.code));
  const chosenClient = $derived(clients.includes(client) ? client : (clients[0] ?? ''));
  const options = $derived<ReportOptions | null>(
    range === null
      ? null
      : {
          range,
          ...(by === 'client' ? { client: chosenClient } : { codes }),
          rounding,
          includePlanned: planned,
          nowMs: store.nowMs(),
        },
  );
  const report = $derived(options ? buildReport(store.allRows, store.projects, options) : null);
  const money = (m: { amount: number; currency: string }) => `${m.amount.toFixed(2)} ${m.currency}`;

  function toggle(code: string, on: boolean) {
    picked = on ? [...codes, code] : codes.filter((c) => c !== code);
  }

  /** A file to save, made in the browser: nothing leaves it. */
  function download(ext: 'csv' | 'md') {
    if (!options || !report) return;
    const text = ext === 'csv' ? reportToCsv(store.allRows, store.projects, options) : reportToMarkdown(report);
    const url = URL.createObjectURL(new Blob([text], { type: ext === 'csv' ? 'text/csv' : 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(ext, options.range, by === 'client' ? { client: chosenClient } : { codes });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<section class="card">
  <h2>Report</h2>
  <RangePicker today={store.todayDate} weekStart={store.config?.weekStart ?? 'monday'} initial="lastMonth" onchange={(r) => (range = r)} />
</section>

<section class="card">
  <fieldset>
    <legend>For</legend>
    <label><input type="radio" bind:group={by} value="projects" /> Projects</label>
    <label><input type="radio" bind:group={by} value="client" disabled={clients.length === 0} /> A client</label>
  </fieldset>
  {#if by === 'projects'}
    <div class="ticks">
      {#each active as p (p.code)}
        <label><input type="checkbox" checked={codes.includes(p.code)} onchange={(e) => toggle(p.code, e.currentTarget.checked)} /> {p.code}</label>
      {/each}
    </div>
  {:else}
    <label>Client
      <select value={chosenClient} onchange={(e) => (client = e.currentTarget.value)}>
        {#each clients as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
  {/if}
  <div class="options">
    <label>Round each event up to
      <select bind:value={rounding}>
        <option value={0}>no rounding</option>
        <option value={5}>5 minutes</option>
        <option value={15}>15 minutes</option>
        <option value={30}>30 minutes</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={planned} /> Include planned time</label>
  </div>
</section>

{#if report}
  <section class="card" data-testid="report">
    {#if report.projects.length === 0}
      <p class="muted">Nothing to report in this range.</p>
    {:else}
      <table>
        <tbody>
        {#each report.projects as p (p.code)}
          <tr><th scope="row"><span class="mono">{p.code}</span> {p.description}</th><td class="n">{formatHours(p.hours)} h</td><td class="n">{p.money ? money(p.money) : ''}</td></tr>
        {/each}
        </tbody>
        <tfoot>
          <tr class="total"><th scope="row">Total</th><td class="n" data-testid="report-hours">{formatHours(report.hours)} h</td><td class="n">{report.money.map(money).join(' · ')}</td></tr>
        </tfoot>
      </table>
    {/if}
    <div class="actions">
      <button class="primary" onclick={() => download('md')}>Download Markdown</button>
      <button class="secondary" onclick={() => download('csv')}>Download CSV</button>
    </div>
  </section>
{/if}

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 10px;
    display: flex;
    gap: 16px;
    align-items: center;
  }
  legend {
    float: left;
    font-weight: 600;
    margin-right: 8px;
  }
  .ticks,
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 10px 0;
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
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 6px 4px;
    font-weight: normal;
    border-top: 1px solid var(--line);
  }
  .n {
    text-align: right;
    font-family: var(--mono);
    white-space: nowrap;
  }
  .mono {
    font-family: var(--mono);
  }
  .total th,
  .total td {
    font-weight: 600;
    border-top: 2px solid var(--line);
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
</style>
