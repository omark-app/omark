<script lang="ts">
  import TimeApp from 'time/src/App.svelte';
  import { timeDeps } from 'time/src/lib/boot.ts';
  import { TimeStore } from 'time/src/lib/store.svelte.ts';
  import type { Place } from '../lib/places.ts';
  import { registry } from '../lib/registry.svelte.ts';

  /** Omark Time as a part: on the `time/` folder the shell opened, with the calendar sign-in (U.4). */
  let { place, openSettings }: { place: Place; openSettings?: () => void } = $props();

  async function open(): Promise<TimeStore> {
    const store = new TimeStore(timeDeps({ ...(await place.time()), ...(openSettings && { openSettings }) }));
    void store.start();
    registry.time = mine = store;
    return store;
  }
  let mine: TimeStore | null = null;
  // Gone with its part (sign-out, another storage): the Settings page must not show a store of another folder.
  $effect(() => () => {
    if (registry.time === mine) registry.time = null;
  });
  // One store per place: switching tabs keeps it, a new storage gets a new one.
  const store = $derived(open());
</script>

<div class="time-part">
  {#await store}
    <p class="muted">Opening…</p>
  {:then s}
    <TimeApp store={s} />
  {:catch e}
    <p role="alert">{e instanceof Error ? e.message : String(e)}</p>
  {/await}
</div>

<style>
  .time-part {
    max-width: 1040px;
    margin-inline: auto;
    padding: 24px max(16px, env(safe-area-inset-right, 0px)) 48px max(16px, env(safe-area-inset-left, 0px));
    font-family: var(--sans);
    color: var(--ink);
  }
</style>
