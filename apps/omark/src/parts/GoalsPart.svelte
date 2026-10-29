<script lang="ts">
  import { IdbBlobs, IdbCache, MemoryBlobs, MemoryCache } from '@omark/storage';
  import { toISODate } from '@omark/tasks-core';
  import { STORAGE_MODE } from '../env.ts';
  import type { Place } from '../lib/places.ts';
  import { registry } from '../lib/registry.svelte.ts';
  import Board from './goals/Board.svelte';
  import { Pictures } from './goals/pictures.svelte.ts';
  import { GoalsStore } from './goals/store.svelte.ts';

  /** Omark Goals as a part (roadmap G.2): its `goals/` folder, reading Tasks', Time's and the top's files. */
  let { place, active = true, openSettings }: { place: Place; openSettings?: () => void; active?: boolean } = $props();

  // One store per place: switching tabs keeps it, a new storage gets a new one.
  const store = $derived.by(() => {
    const s = new GoalsStore({
      goals: place.part('goals'),
      top: place.root,
      tasks: place.part('tasks'),
      time: place.part('time'),
      // The fake build's folders live in memory, so its copy does too.
      cache: STORAGE_MODE === 'fake' ? new MemoryCache() : new IdbCache(`omark-goals-${place.key}`),
      today: () => toISODate(new Date()),
    });
    void s.open();
    return s;
  });
  const pictures = $derived(
    new Pictures(place.pictures(), STORAGE_MODE === 'fake' ? new MemoryBlobs() : new IdbBlobs(`omark-pictures-${place.key}`)),
  );
  // Published for the one Settings page; gone with its part, so the page never shows another folder's store.
  $effect(() => {
    const mine = store;
    registry.goals = mine;
    return () => {
      if (registry.goals === mine) registry.goals = null;
    };
  });

  // Shown again (its tab): what changed in the other parts meanwhile shows.
  let shown = false;
  $effect(() => {
    if (active && shown) void store.refresh();
    shown ||= active;
  });
</script>

<!-- Another part's changes (a ticked habit, new hours) show when Goals is looked at again. -->
<svelte:window onfocus={() => void store.refresh()} />

<Board {store} {pictures} {openSettings} />
