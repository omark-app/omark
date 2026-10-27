<script lang="ts">
  import type { TimeStore } from '../lib/store.svelte.ts';

  let { store }: { store: TimeStore } = $props();
  let picked = $state<string[] | null>(null);
  // The primary calendar is ticked until the user changes the ticks.
  const chosen = $derived(picked ?? store.calendars.filter((c) => c.primary).map((c) => c.id));

  function toggle(id: string, on: boolean) {
    picked = on ? [...chosen, id] : chosen.filter((c) => c !== id);
  }
</script>

{#if store.error}
  <p class="card" role="alert">{store.error}</p>
{/if}

{#if store.phase === 'storage'}
  <section class="card">
    <h2>Where should the files go?</h2>
    <p class="muted">Omark Time keeps projects.csv, config.yaml and one CSV of hours per year, in a folder "Omark Time" in Google Drive, or in a folder you pick.</p>
    <div class="choices">
      <button class="primary" onclick={() => store.chooseStorage('google-drive')}>Google Drive</button>
      <button class="secondary" disabled title="Coming soon">OneDrive</button>
      {#if store.canPickFolder}
        <button class="secondary" onclick={() => store.chooseStorage('local-folder')}>A folder on this computer</button>
      {/if}
    </div>
  </section>
{:else}
  <section class="card">
    <h2>Which calendars count?</h2>
    {#if store.calendarsError}
      <p role="alert">{store.calendarsError}</p>
      <button class="secondary" onclick={() => store.loadCalendars()}>Try again</button>
    {:else if store.calendars.length === 0}
      <p class="muted">Reading your calendars…</p>
    {:else}
      <ul>
        {#each store.calendars as calendar (calendar.id)}
          <li>
            <label>
              <input
                type="checkbox"
                checked={chosen.includes(calendar.id)}
                onchange={(e) => toggle(calendar.id, e.currentTarget.checked)}
              />
              {calendar.name}
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="muted">
      Later, in Settings, Omark Time can also colour your events: green for a known project, red for an unknown code. That
      needs edit access to your events, so it is off for now.
    </p>
    <button class="primary" disabled={chosen.length === 0} onclick={() => store.chooseCalendars(chosen)}>Start</button>
  </section>
{/if}

<style>
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }
  li {
    padding: 6px 0;
  }
</style>
