<script lang="ts">
  import type { TimeStore } from '../lib/store.svelte.ts';

  let { store }: { store: TimeStore } = $props();

  const status = $derived.by(() => {
    const fix = store.fixCount === 1 ? '1 to fix' : `${store.fixCount} to fix`;
    switch (store.sync) {
      case 'syncing':
        return 'Syncing…';
      case 'offline':
        return `Offline · ${fix}`;
      case 'signin':
        return 'Sign in again to sync';
      case 'failed':
        return `Sync failed: ${store.error ?? 'unknown error'}`;
      default:
        return `Synced ${store.syncedAt ? new Date(store.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} · ${fix}`;
    }
  });
  const chosen = $derived(store.config?.calendars ?? []);

  function toggleCalendar(id: string, on: boolean) {
    void store.setCalendars(on ? [...chosen, id] : chosen.filter((c) => c !== id));
  }
</script>

<section class="card status">
  <p data-testid="status" role="status">{status}</p>
  <button class="secondary" disabled={store.sync === 'syncing'} onclick={() => store.syncNow()}>Sync now</button>
</section>

{#if store.signOutPending}
  <section class="card" role="alert">
    <h2>Some changes are not saved yet</h2>
    <p>A settings change has not reached your storage yet. Signing out now drops it from this device.</p>
    <div class="row">
      <button class="primary" onclick={() => store.syncNow()}>Sync now</button>
      <button class="secondary" onclick={() => store.signOut({ anyway: true })}>Sign out anyway</button>
    </div>
  </section>
{/if}

{#if store.sync === 'signin'}
  <section class="card" role="alert">
    <p>Your Google sign-in has lapsed.</p>
    <button class="primary" onclick={() => store.signIn()}>Sign in with Google</button>
  </section>
{/if}

{#if store.colour === 'needs-edit'}
  <section class="card" role="alert">
    <h2>Colouring needs edit access</h2>
    <p>This device's Google sign-in can only read your calendar. Give Omark Time edit access to colour your events here.</p>
    <button class="primary" onclick={() => store.giveEditAccess()}>Give edit access</button>
  </section>
{/if}

{#if store.clearOffer !== null}
  <section class="card" role="alert">
    <h2>Clear the colours Omark Time set?</h2>
    <p>{store.clearOffer} {store.clearOffer === 1 ? 'event has' : 'events have'} a colour Omark Time set. Colours you set yourself stay.</p>
    <div class="row">
      <button class="primary" onclick={() => store.answerClear(true)}>Clear them</button>
      <button class="secondary" onclick={() => store.answerClear(false)}>Keep them</button>
    </div>
  </section>
{/if}

<section class="card">
  <h2>Your files</h2>
  <p data-testid="rows">{store.rows} {store.rows === 1 ? 'row' : 'rows'} of tracked time</p>
  {#if store.colour === 'running'}
    <p data-testid="colouring">Colouring events… {store.colourLeft > 0 ? `${store.colourLeft} left` : ''}</p>
  {/if}
</section>

<section class="card settings">
  <h2>Settings</h2>
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
    <input
      type="checkbox"
      checked={store.config?.colourEvents ?? false}
      onchange={(e) => store.setColouring(e.currentTarget.checked)}
    />
    Colour my events
  </label>
  <p class="muted small">Green for a known project, red for an unknown code. Needs edit access to your events.</p>
  <div class="row">
    <button class="secondary" disabled={store.sync === 'syncing'} onclick={() => store.rebuild()}>Rebuild</button>
    <button class="secondary" onclick={() => store.signOut()}>Sign out</button>
  </div>
  <p class="muted small">Rebuild reads your whole calendar again and rewrites the hour files.</p>
</section>

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .status p {
    margin: 0;
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
  .small {
    font-size: 13px;
    margin-top: 2px;
  }
</style>
