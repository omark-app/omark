<script lang="ts">
  import { formatHours } from '@omark/time-core';
  import type { WeeklySeries } from '@omark/time-core';

  /** Hours per week, one stacked bar per week, one colour per series; drawn here, so nothing is fetched. */
  let { data, title }: { data: WeeklySeries; title: string } = $props();

  const W = 640;
  const H = 220;
  const PAD = { top: 10, right: 8, bottom: 26, left: 40 };
  const COLOURS = 8;

  const totals = $derived(data.weeks.map((_, i) => data.series.reduce((sum, s) => sum + (s.hours[i] ?? 0), 0)));
  const max = $derived(Math.max(1, ...totals));
  /** A round step for the scale: 1, 2, 5, 10, 20, … hours. */
  const step = $derived([1, 2, 5, 10, 20, 50, 100].find((s) => max / s <= 5) ?? 200);
  const top = $derived(Math.ceil(max / step) * step);
  const ticks = $derived(Array.from({ length: top / step + 1 }, (_, i) => i * step));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = $derived(plotW / Math.max(1, data.weeks.length));
  const barW = $derived(Math.max(4, Math.min(40, band * 0.7)));
  const y = (h: number) => PAD.top + plotH - (h / top) * plotH;
  const colour = (i: number) => `var(--c${(i % COLOURS) + 1})`;
  const label = (week: string) => week.slice(5).replace('-', '/');
  /** Every other label when the weeks crowd. */
  const every = $derived(Math.max(1, Math.ceil(data.weeks.length / 12)));

  function stacks(i: number): { y: number; h: number; colour: string }[] {
    let base = 0;
    return data.series.map((s, j) => {
      const v = s.hours[i] ?? 0;
      const seg = { y: y(base + v), h: y(base) - y(base + v), colour: colour(j) };
      base += v;
      return seg;
    });
  }
</script>

<figure>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
    {#each ticks as t (t)}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} class="grid" />
      <text x={PAD.left - 6} y={y(t) + 4} text-anchor="end" class="axis">{t}</text>
    {/each}
    {#each data.weeks as week, i (week)}
      {#each stacks(i) as seg, j (j)}
        {#if seg.h > 0}<rect x={PAD.left + i * band + (band - barW) / 2} y={seg.y} width={barW} height={seg.h} fill={seg.colour} />{/if}
      {/each}
      {#if i % every === 0}
        <text x={PAD.left + i * band + band / 2} y={H - 8} text-anchor="middle" class="axis">{label(week)}</text>
      {/if}
    {/each}
  </svg>
  {#if data.series.length > 0}
    <ul class="legend">
      {#each data.series as s, j (s.key)}
        <li><span class="swatch" style="background: {colour(j)}"></span>{s.label || 'No category'}</li>
      {/each}
    </ul>
  {/if}
  <details>
    <summary>As a table</summary>
    <table data-testid="chart-table">
      <thead>
        <tr><th scope="col">Week of</th>{#each data.series as s (s.key)}<th scope="col">{s.label || 'No category'}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each data.weeks as week, i (week)}
          <tr><th scope="row">{week}</th>{#each data.series as s (s.key)}<td>{formatHours(s.hours[i] ?? 0)}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  figure {
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .axis {
    fill: var(--muted);
    font-size: 11px;
    font-family: var(--mono);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    list-style: none;
    padding: 0;
    margin: 8px 0;
    font-size: 14px;
  }
  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 6px;
  }
  details {
    font-size: 14px;
  }
  table {
    border-collapse: collapse;
    margin-top: 8px;
    font-family: var(--mono);
  }
  th,
  td {
    padding: 3px 8px;
    text-align: right;
    font-weight: normal;
  }
  th[scope='row'],
  thead th:first-child {
    text-align: left;
  }
</style>
