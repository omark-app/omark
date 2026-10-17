<script lang="ts">
  import { BUCKETS } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import Bucket from './Bucket.svelte';
  import AlwaysList from './AlwaysList.svelte';
  import Stats from './Stats.svelte';
  import Hints from './Hints.svelte';
  import StatusLine from './StatusLine.svelte';
  import Toast from './Toast.svelte';
  import AddInput from './AddInput.svelte';
  import TaskDetail from './TaskDetail.svelte';
  import { createCommands, createPhone, selectedTask } from '../lib/commands.svelte.ts';
  import type { OnCommand, OnDropPickDate } from '../lib/commands.svelte.ts';

  let { store, onCommand = () => {}, onDropPickDate = () => {} }: { store: AppStore; onCommand?: OnCommand; onDropPickDate?: OnDropPickDate } = $props();

  let addInput: AddInput | undefined = $state();
  let detail: TaskDetail | undefined = $state();
  const selected = $derived(selectedTask(store));

  // Under 720 px is "phone": a compact stats line on top instead of the tiles in the right pane.
  const phone = createPhone();
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
  {#if phone.value}<Stats stats={store.stats} variant="line" />{/if}
  <div class="frame">
    <!-- Double-click is a pointer convenience; the keyboard edits with Enter. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section class="pane tasks" {ondblclick}>
      <span class="legend">tasks</span>
      {#if !phone.value}<AddInput bind:this={addInput} {store} />{/if}
      <div class="buckets">
        {#each BUCKETS as b (b.key)}
          <Bucket {store} key={b.key} name={b.name} onpickdate={(id) => onCommand('pickDate', id)} ondroppickdate={onDropPickDate} />
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
  .under { display: flex; flex-direction: column; gap: 8px; }
  .lab { font: 500 11px var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
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
