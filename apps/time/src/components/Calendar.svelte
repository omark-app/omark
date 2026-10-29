<script lang="ts">
  import { addDays, localDate, parseInstant, weekStartOf } from '@omark/time-core';
  import type { CalendarEvent } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';

  /**
   * The demo's calendar strip (spec 12): one week, a column per day, each event in the colour Omark Time gave it
   * (green, red, or the calendar's own grey). In the real app this is Google Calendar's job.
   */
  let { store }: { store: TimeStore } = $props();
  let offset = $state(0);
  let week = $state<{ events: CalendarEvent[]; ids: { green: string; red: string } } | null>(null);

  const first = $derived(addDays(weekStartOf(store.todayDate, store.config?.weekStart ?? 'monday'), offset * 7));
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(first, i)));

  /** Only the latest answer counts: an older one, for this week or another, may arrive after it. */
  let asked = 0;
  $effect(() => {
    const from = first;
    // Again after each sync and colour pass, so a change shows here.
    void store.syncedAt;
    void store.colour;
    const n = ++asked;
    store.weekEvents(from, addDays(from, 7)).then((w) => {
      if (n === asked) week = w;
    });
  });

  const dayOf = (e: CalendarEvent) => {
    const start = e.start!;
    return 'date' in start ? start.date : localDate(parseInstant(start.dateTime), store.timeZone);
  };
  const timeOf = (e: CalendarEvent) =>
    e.start && 'dateTime' in e.start ? new Date(parseInstant(e.start.dateTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: store.timeZone }) : 'All day';
  const colourOf = (e: CalendarEvent) => (!week ? 'none' : e.colorId === week.ids.green ? 'green' : e.colorId === week.ids.red ? 'red' : 'none');
  /** All-day events first, then by start time (the formatted time can't be sorted as text in a 12-hour locale). */
  const startOf = (e: CalendarEvent) => (e.start && 'dateTime' in e.start ? parseInstant(e.start.dateTime) : -Infinity);
  const onDay = (day: string) =>
    (week?.events ?? [])
      .filter((e) => e.status !== 'cancelled' && e.start && dayOf(e) === day)
      .sort((a, b) => startOf(a) - startOf(b));
  const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

<section class="card">
  <div class="head">
    <h2>Calendar</h2>
    <div class="nav">
      <button class="secondary" onclick={() => offset--} aria-label="Previous week">‹</button>
      <button class="secondary" onclick={() => (offset = 0)}>This week</button>
      <button class="secondary" onclick={() => offset++} aria-label="Next week">›</button>
    </div>
  </div>
  <p class="muted small">
    The demo's calendar, coloured as Omark Time colours yours in Google Calendar: green for a known project, red for
    an unknown code. Events without a code keep their colour.
  </p>
</section>

<section class="card week" data-testid="week">
  {#each days as day (day)}
    <div class="day" class:today={day === store.todayDate}>
      <h3>{label(day)}</h3>
      {#each onDay(day) as e (e.id)}
        <div class="event {colourOf(e)}" data-testid="event" data-colour={colourOf(e)}>
          <span class="time">{timeOf(e)}</span>
          <span class="title">{e.title}</span>
          {#if e.response === 'declined'}<span class="note">declined</span>{:else if e.response === 'needsAction'}<span class="note">not answered</span>{/if}
        </div>
      {/each}
    </div>
  {/each}
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .nav {
    display: flex;
    gap: 6px;
  }
  .small {
    font-size: 13px;
  }
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }
  .day h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 6px;
    color: var(--muted);
  }
  .day.today h3 {
    color: var(--accent);
  }
  .event {
    border-radius: 6px;
    padding: 4px 6px;
    margin-bottom: 4px;
    font-size: 12px;
    line-height: 1.3;
    background: var(--chip);
    border-left: 4px solid var(--faint);
    overflow-wrap: anywhere;
  }
  .event.green {
    background: color-mix(in srgb, var(--good) 18%, var(--surface));
    border-left-color: var(--good);
  }
  .event.red {
    background: color-mix(in srgb, var(--danger) 16%, var(--surface));
    border-left-color: var(--danger);
  }
  .time {
    display: block;
    font-family: var(--mono);
    color: var(--muted);
  }
  .note {
    display: block;
    color: var(--muted);
    font-style: italic;
  }
  @media (max-width: 719.98px) {
    .week {
      grid-template-columns: 1fr;
    }
    .day h3 {
      margin-top: 6px;
    }
  }
</style>
