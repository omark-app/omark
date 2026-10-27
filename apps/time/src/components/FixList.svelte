<script lang="ts">
  import { buildFixList, formatHours } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';
  import { eventLink } from '../lib/views.ts';

  /** Spec 9, Fix list: red events and overlapping days. */
  let { store }: { store: TimeStore } = $props();
  const fix = $derived(buildFixList(store.allRows));
  const time = (t: string) => t.slice(11, 16);

  function addProject(code: string) {
    store.newCode = code;
    location.hash = '#/projects';
  }
</script>

<section class="card">
  <h2>Fix list</h2>
  {#if fix.count === 0}
    <p class="muted">Nothing to fix.</p>
  {:else}
    <p class="muted">Events with a code that isn't a project, and days where events overlap.</p>
  {/if}
</section>

{#if fix.unknown.length > 0}
  <section class="card">
    <h2>Unknown codes</h2>
    <ul>
      {#each fix.unknown as u (`${u.calendar} ${u.eventId}`)}
        {@const link = eventLink(store.links, u.calendar, u.eventId)}
        <li data-testid="unknown" data-code={u.code}>
          <div><span class="date">{u.dates[0]}{u.dates.length > 1 ? ` – ${u.dates.at(-1)}` : ''}</span> {u.title} <span class="muted">· {formatHours(u.hours)} h</span></div>
          <div class="actions">
            <button class="secondary" onclick={() => addProject(u.code)}>Add {u.code} as a project</button>
            {#if link}<a href={link} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>{/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if fix.overlaps.length > 0}
  <section class="card">
    <h2>Overlapping events</h2>
    <ul>
      {#each fix.overlaps as day (day.date)}
        <li data-testid="overlap">
          <div class="date">{day.date}</div>
          <ul class="rows">
            {#each day.rows as r (`${r.calendar} ${r.eventId}`)}
              <li>{time(r.start)}–{time(r.end)} <span class="code">{r.project}</span> {r.category}</li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  li:first-child {
    border-top: 0;
  }
  .rows li {
    border: 0;
    padding: 2px 0 2px 12px;
  }
  .date,
  .code {
    font-family: var(--mono);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-top: 8px;
  }
  a {
    color: var(--accent);
  }
</style>
