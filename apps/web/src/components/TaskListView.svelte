<script lang="ts">
  import { BUCKETS } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import Bucket from './Bucket.svelte';
  import AlwaysList from './AlwaysList.svelte';
  import Stats from './Stats.svelte';
  import Hints from './Hints.svelte';
  import StatusLine from './StatusLine.svelte';
  import ConfigBanner from './ConfigBanner.svelte';
  import Toast from './Toast.svelte';
  import AddInput from './AddInput.svelte';
  import TaskDetail from './TaskDetail.svelte';
  import { createCommands, createPhone, selectedTask } from '../lib/commands.svelte.ts';
  import { rowGestures } from '../lib/gestures.ts';
  import { applyDrop } from '../lib/drag/drop-target.ts';
  import type { OnCommand, OnDropPickDate } from '../lib/commands.svelte.ts';

  let {
    store,
    onCommand = () => {},
    onDropPickDate = () => {},
    onSignIn,
  }: { store: AppStore; onCommand?: OnCommand; onDropPickDate?: OnDropPickDate; onSignIn?: () => void } = $props();

  let addInput: AddInput | undefined = $state();
  let detail: TaskDetail | undefined = $state();
  const selected = $derived(selectedTask(store));

  // Under 720 px is "phone" (spec 11.2): a compact stats line on top, ALWAYS below the buckets, no add
  // input, detail or hints; a tap opens the edit sheet and rows take swipes.
  const phone = createPhone();
  const open = (id: string): void => onCommand('edit', id);
  // svelte-ignore state_referenced_locally
  const { onkeydown, ondblclick } = createCommands({
    store,
    phone,
    focusAdd: () => addInput?.focus(),
    focusTitle: () => detail?.focusTitle(),
    onCommand: (command, id) => onCommand(command, id),
  });
</script>

<svelte:window {onkeydown} />

<div class="wrap">
  {#if store.cacheWarning}<p class="warn" role="status">{store.cacheWarning}</p>{/if}
  {#if store.configError}<ConfigBanner error={store.configError} />{/if}
  <!-- Phones have no footer: the save status sits beside the stats, so `sign in needed` is in reach. -->
  {#if phone.value}<div class="top"><Stats stats={store.stats} variant="line" /><StatusLine status={store.status} onsignin={onSignIn} /></div>{/if}
  <div class="frame">
    <!-- Double-click is a pointer convenience; the keyboard edits with Enter. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section class="pane tasks" {ondblclick}>
      <span class="legend">tasks</span>
      {#if !phone.value}<AddInput bind:this={addInput} {store} />{/if}
      <div
        class="buckets"
        use:rowGestures={{
          enabled: phone.value,
          onswiperight: (id) => store.complete(id),
          onswipeleft: (id) => onCommand('move', id),
          ondrop: (id, target) => applyDrop(store, id, target, onDropPickDate),
        }}
      >
        {#each BUCKETS as b (b.key)}
          <Bucket
            {store}
            key={b.key}
            name={b.name}
            onpickdate={(id) => onCommand('pickDate', id)}
            ondroppickdate={onDropPickDate}
            onopen={phone.value ? open : undefined}
          />
        {/each}
      </div>
    </section>
    <aside class="pane side">
      {#if selected && !phone.value}
        <span class="legend">task</span>
        {#key selected.id}
          <TaskDetail bind:this={detail} {store} task={selected} oncommand={(c) => onCommand(c, selected.id)} />
        {/key}
        <div class="under"><span class="lab">Always</span><AlwaysList {store} /></div>
      {:else}
        <span class="legend">always</span>
        <AlwaysList {store} />
      {/if}
      {#if !phone.value}<Stats stats={store.stats} variant="box" />{/if}
    </aside>
  </div>
  {#if !phone.value}
    <footer class="foot">
      <Hints />
      <StatusLine status={store.status} onsignin={onSignIn} />
    </footer>
  {/if}
</div>
<Toast {store} />

<style>
  .wrap { max-width: 1160px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
  .warn { margin: 0; font: 12px var(--mono); color: var(--danger); }
  .frame { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; background: var(--surface); border-radius: 14px; padding: 24px 22px 20px; box-shadow: var(--shadow); }
  .pane { position: relative; display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 600px; border: 1px solid var(--line); border-radius: 10px; padding: 24px 12px 14px; }
  .legend { position: absolute; top: -9px; left: 14px; padding: 0 8px; background: var(--surface); font: 12px var(--mono); color: var(--faint); }
  .under { display: flex; flex-direction: column; gap: 8px; }
  .lab { font: 500 11px var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
  .buckets { display: flex; flex-direction: column; gap: 12px; }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 10px 16px; flex-wrap: wrap; padding: 2px 8px; }
  @media (max-width: 719.98px) {
    .frame { grid-template-columns: 1fr; gap: 26px; padding: 0; background: transparent; box-shadow: none; border-radius: 0; }
    .pane { min-height: 0; border: 0; padding: 0; }
    .legend { position: static; padding: 0 8px; background: none; }
    .side { border-top: 1px solid var(--line); border-radius: 0; padding-top: 16px; }
    /* A swiped row slides past the edge without widening the page. */
    .buckets { overflow-x: clip; }
  }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 14px; flex-wrap: wrap; }
</style>
