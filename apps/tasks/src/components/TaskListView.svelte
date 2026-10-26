<script lang="ts">
  import { BUCKETS, IMPORTANT_GROUP } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import type { Updates } from '../lib/updates.svelte.ts';
  import Bucket from './Bucket.svelte';
  import Stats from './Stats.svelte';
  import Hints from './Hints.svelte';
  import StatusLine from './StatusLine.svelte';
  import DemoControls from './DemoControls.svelte';
  import { STORAGE_MODE } from '../env.ts';
  import SyncBanner from './SyncBanner.svelte';
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
    onSearch,
    updates,
    onUpdate,
  }: {
    store: AppStore;
    onCommand?: OnCommand;
    onDropPickDate?: OnDropPickDate;
    onSignIn?: () => void;
    onSearch?: () => void;
    updates?: Updates;
    onUpdate?: () => void;
  } = $props();

  let addInput: AddInput | undefined = $state();
  let detail: TaskDetail | undefined = $state();
  const selected = $derived(selectedTask(store));

  // Under 720 px is "phone" (spec 11.2): a compact stats line on top, Important, not urgent below the buckets, no add
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
  <SyncBanner {store} onsignin={onSignIn} />
  {#if store.cacheWarning}<p class="warn" role="status">{store.cacheWarning}</p>{/if}
  {#if store.configError}<ConfigBanner error={store.configError} />{/if}
  <!-- Phones have no footer: the save status sits beside the stats (problems are in the sync banner above). -->
  {#if phone.value}
    <div class="top">
      <Stats stats={store.stats} variant="line" />
      <span class="topr">
        <StatusLine status={store.status} {updates} onupdate={onUpdate} demoControls={false} />
        {#if onSearch}<button class="find" data-testid="search-open" aria-label="Search" onclick={onSearch}>🔍</button>{/if}
      </span>
      <!-- Too wide to sit beside the status on a phone. -->
      {#if STORAGE_MODE === 'demo'}<span class="demo-row"><DemoControls /></span>{/if}
    </div>
  {/if}
  <!-- Phone gestures cover both panes: Important, not urgent sits in the side pane (#38). -->
  <div
    class="frame"
    use:rowGestures={{
      enabled: phone.value,
      onswiperight: (id) => store.complete(id),
      onswipeleft: (id) => onCommand('move', id),
      ondrop: (id, target) => applyDrop(store, id, target, onDropPickDate),
    }}
  >
    <!-- Double-click is a pointer convenience; the keyboard edits with Enter. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section class="pane tasks" {ondblclick}>
      <span class="legend">tasks</span>
      {#if !phone.value}<AddInput bind:this={addInput} {store} />{/if}
      <div class="buckets">
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
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <aside class="pane side" {ondblclick}>
      {#if selected && !phone.value}
        <span class="legend">task</span>
        {#key selected.id}
          <TaskDetail bind:this={detail} {store} task={selected} oncommand={(c) => onCommand(c, selected.id)} />
        {/key}
      {:else}
        <span class="legend">not urgent</span>
      {/if}
      <!-- Important, not urgent: below the detail when a task is open, on its own otherwise (#38). -->
      <Bucket
        {store}
        key={IMPORTANT_GROUP.key}
        name={IMPORTANT_GROUP.name}
        onpickdate={(id) => onCommand('pickDate', id)}
        ondroppickdate={onDropPickDate}
        onopen={phone.value ? open : undefined}
      />
      {#if !phone.value}<Stats stats={store.stats} variant="box" />{/if}
    </aside>
  </div>
  {#if !phone.value}
    <footer class="foot">
      <Hints />
      <StatusLine status={store.status} {updates} onupdate={onUpdate} />
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
  .buckets { display: flex; flex-direction: column; gap: 12px; }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 10px 16px; flex-wrap: wrap; padding: 2px 8px; }
  @media (max-width: 719.98px) {
    .frame { grid-template-columns: 1fr; gap: 26px; padding: 0; background: transparent; box-shadow: none; border-radius: 0; }
    .pane { min-height: 0; border: 0; padding: 0; }
    .legend { position: static; padding: 0 8px; background: none; }
    .side { border-top: 1px solid var(--line); border-radius: 0; padding-top: 16px; }
    /* A swiped row slides past the edge without widening the page. */
    .frame { overflow-x: clip; }
  }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 14px; flex-wrap: wrap; }
  .demo-row { flex-basis: 100%; display: flex; justify-content: flex-end; }
  .topr { display: inline-flex; align-items: center; gap: 10px; margin-left: auto; }
  .find { width: 36px; height: 32px; margin: -8px -6px -8px 0; padding: 0; border: 0; border-radius: 8px; background: none; font-size: 16px; filter: grayscale(1); opacity: .7; cursor: pointer; }
  .find:active { background: var(--sel); }
</style>
