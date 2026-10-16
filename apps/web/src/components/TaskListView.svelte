<script lang="ts">
  import { BUCKETS } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import Bucket from './Bucket.svelte';
  import AlwaysList from './AlwaysList.svelte';
  import Stats from './Stats.svelte';
  import Hints from './Hints.svelte';
  import StatusLine from './StatusLine.svelte';
  import Toast from './Toast.svelte';

  let { store }: { store: AppStore } = $props();

  // Under 720 px is "phone": a compact stats line on top instead of the tiles in the right pane.
  const query = window.matchMedia('(max-width: 719.98px)');
  let phone = $state(query.matches);
  $effect(() => {
    const on = (): void => {
      phone = query.matches;
    };
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  });
</script>

<div class="wrap">
  {#if store.cacheWarning}<p class="warn" role="status">{store.cacheWarning}</p>{/if}
  {#if phone}<Stats stats={store.stats} variant="line" />{/if}
  <div class="frame">
    <section class="pane tasks">
      <span class="legend">tasks</span>
      <div class="buckets">
        {#each BUCKETS as b (b.key)}
          <Bucket {store} key={b.key} name={b.name} />
        {/each}
      </div>
    </section>
    <aside class="pane side">
      <span class="legend">always</span>
      <AlwaysList lines={store.state.doc.always} />
      {#if !phone}<Stats stats={store.stats} variant="box" />{/if}
    </aside>
  </div>
  <footer class="foot">
    <Hints />
    <StatusLine status={store.status} />
  </footer>
</div>
<Toast {store} />

<style>
  .wrap { max-width: 1160px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
  .warn { margin: 0; font: 12px var(--mono); color: var(--danger); }
  .frame { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; background: var(--surface); border-radius: 14px; padding: 24px 22px 20px; box-shadow: var(--shadow); }
  .pane { position: relative; display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 600px; border: 1px solid var(--line); border-radius: 10px; padding: 24px 12px 14px; }
  .legend { position: absolute; top: -9px; left: 14px; padding: 0 8px; background: var(--surface); font: 12px var(--mono); color: var(--faint); }
  .buckets { display: flex; flex-direction: column; gap: 12px; }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 10px 16px; flex-wrap: wrap; padding: 2px 8px; }
  @media (max-width: 719.98px) {
    .frame { grid-template-columns: 1fr; gap: 26px; padding: 0; background: transparent; box-shadow: none; border-radius: 0; }
    .pane { min-height: 0; border: 0; padding: 0; }
    .legend { position: static; padding: 0 8px; background: none; }
    .side { border-top: 1px solid var(--line); padding-top: 16px; }
    .foot { display: none; }
  }
</style>
