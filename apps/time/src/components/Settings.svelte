<script lang="ts">
  import { isRealDate } from '@omark/time-core';
  import type { WeekStart } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';
  import { TASKS_SETTINGS_URL } from '../lib/views.ts';

  /**
   * Spec 9, Settings. Time's own page: the shared settings page (`@omark/settings`) refuses keys outside its schema,
   * and Time's calendar list, track-from date and colouring switch don't fit its field types.
   */
  /** `inPage`: shown inside the one Omark app's Settings page, which has its own heading. */
  let { store, inPage = false }: { store: TimeStore; inPage?: boolean } = $props();

  /** The one Omark app's Settings page, through its router: no reload, and its back link comes back here. */
  function toSettings(e: MouseEvent): void {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    store.openSettings();
  }
  const chosen = $derived(store.config?.calendars ?? []);
  const DAYS: WeekStart[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let trackError = $state<string | null>(null);
  let allDayError = $state<string | null>(null);

  function toggleCalendar(id: string, on: boolean) {
    void store.setCalendars(on ? [...chosen, id] : chosen.filter((c) => c !== id));
  }

  function setTrackFrom(value: string) {
    trackError = isRealDate(value) ? null : 'Track from must be a date';
    if (!trackError) void store.setConfig({ trackFrom: value });
  }

  function setAllDay(value: string) {
    const hours = Number(value.replace(',', '.'));
    allDayError = Number.isFinite(hours) && hours >= 0.25 && hours <= 24 ? null : 'All-day hours must be a number from 0.25 to 24';
    if (!allDayError) void store.setConfig({ allDayHours: hours });
  }
</script>

{#if !inPage}
  <section class="card">
    <div class="head">
      <h2>Settings</h2>
      {#if store.embedded}
        <a href="/settings" onclick={toSettings}>All Omark settings</a>
      {:else}
        <a href={TASKS_SETTINGS_URL}>Omark Tasks settings ↗</a>
      {/if}
    </div>
    <p class="muted small">Settings are kept in config.yaml in your files, so they follow you to every device.</p>
  </section>
{/if}

<section class="card">
  <h2>Your files</h2>
  <p class="muted small" data-testid="storage">In {store.storageName}</p>
  <p data-testid="rows">{store.rows} {store.rows === 1 ? 'row' : 'rows'} of tracked time</p>
  <div class="row">
    <button class="secondary" disabled={store.sync === 'syncing'} onclick={() => store.rebuild()}>Rebuild</button>
    {#if !store.embedded}<button class="secondary" onclick={() => store.signOut()}>Sign out</button>{/if}
  </div>
  <p class="muted small">Rebuild reads your whole calendar again and rewrites the hour files.</p>
</section>

<section class="card">
  <fieldset>
    <legend>Calendars</legend>
    {#each store.calendars as calendar (calendar.id)}
      <label>
        <input type="checkbox" checked={chosen.includes(calendar.id)} onchange={(e) => toggleCalendar(calendar.id, e.currentTarget.checked)} />
        {calendar.name}
      </label>
    {/each}
  </fieldset>
  <label class="switch">
    <input type="checkbox" checked={store.config?.colourEvents ?? false} onchange={(e) => store.setColouring(e.currentTarget.checked)} />
    Colour my events
  </label>
  <p class="muted small">Green for a known project, red for an unknown code. Needs edit access to your events.</p>
</section>

<section class="card">
  <h2>Counting</h2>
  <label class="field">
    Track from
    <input type="date" value={store.config?.trackFrom ?? ''} onchange={(e) => setTrackFrom(e.currentTarget.value)} />
    <span class="muted small">Nothing before this day is read, coloured or written.</span>
    {#if trackError}<span class="error" role="alert">{trackError}</span>{/if}
  </label>
  <label class="field">
    Hours an all-day event counts for
    <input inputmode="decimal" value={String(store.config?.allDayHours ?? 8)} onchange={(e) => setAllDay(e.currentTarget.value)} />
    {#if allDayError}<span class="error" role="alert">{allDayError}</span>{/if}
  </label>
  <label class="field">
    Week starts on
    <select value={store.config?.weekStart ?? 'monday'} onchange={(e) => store.setConfig({ weekStart: e.currentTarget.value as WeekStart })}>
      {#each DAYS as d (d)}<option value={d}>{d[0]!.toUpperCase() + d.slice(1)}</option>{/each}
    </select>
  </label>
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  a {
    color: var(--accent);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 12px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  fieldset label,
  .switch {
    display: block;
    padding: 6px 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
  }
  input:not([type='checkbox']),
  select {
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    max-width: 220px;
  }
  .small {
    font-size: 13px;
    margin-top: 2px;
  }
  .error {
    color: var(--danger);
  }
</style>
