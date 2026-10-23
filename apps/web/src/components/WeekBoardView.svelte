<script lang="ts">
  import { bucketName, dayMonth, IMPORTANT_GROUP, weekdayShort } from '@omark/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import type { Updates } from '../lib/updates.svelte.ts';
  import { BRAND } from '../brand.ts';
  import Bucket from './Bucket.svelte';
  import Stats from './Stats.svelte';
  import Hints from './Hints.svelte';
  import StatusLine from './StatusLine.svelte';
  import SyncBanner from './SyncBanner.svelte';
  import ConfigBanner from './ConfigBanner.svelte';
  import Toast from './Toast.svelte';
  import AddInput from './AddInput.svelte';
  import TaskDetail from './TaskDetail.svelte';
  import { createCommands, createPhone, selectedTask } from '../lib/commands.svelte.ts';
  import type { OnCommand, OnDropPickDate } from '../lib/commands.svelte.ts';

  let {
    store,
    onCommand = () => {},
    onDropPickDate = () => {},
    onSignIn,
    updates,
    onUpdate,
  }: {
    store: AppStore;
    onCommand?: OnCommand;
    onDropPickDate?: OnDropPickDate;
    onSignIn?: () => void;
    updates?: Updates;
    onUpdate?: () => void;
  } = $props();

  let addInput: AddInput | undefined = $state();
  let detail: TaskDetail | undefined = $state();
  const selected = $derived(selectedTask(store));
  const today = $derived(`${weekdayShort(store.ctx.today)} ${dayMonth(store.ctx.today, store.ctx)}`);

  const phone = createPhone();
  // svelte-ignore state_referenced_locally
  const { onkeydown, ondblclick } = createCommands({
    store,
    phone,
    focusAdd: () => addInput?.focus(),
    focusTitle: () => detail?.focusTitle(),
    onCommand: (command, id) => onCommand(command, id),
  });
  const pick = (id: string): void => onCommand('pickDate', id);
</script>

<svelte:window {onkeydown} />

<div class="vc">
  <aside class="rail" data-testid="rail">
    <div class="brand">{BRAND.app.toLowerCase()} <span>· {today}</span></div>
    <Stats stats={store.stats} variant="rail" />
    <!-- The open task's detail, or Important, not urgent (#38) in its place: both at once would make the
         rail taller than the window, and editing a low row would scroll the board away. -->
    {#if selected}
      <div class="rblock">
        {#key selected.id}
          <TaskDetail bind:this={detail} {store} task={selected} oncommand={(c) => onCommand(c, selected.id)} />
        {/key}
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="rblock group" {ondblclick}>
        <Bucket {store} key={IMPORTANT_GROUP.key} name={IMPORTANT_GROUP.name} onpickdate={pick} ondroppickdate={onDropPickDate} />
      </div>
    {/if}
    <Hints />
    <StatusLine status={store.status} {updates} onupdate={onUpdate} />
  </aside>
  <div class="main">
    <SyncBanner {store} onsignin={onSignIn} />
    {#if store.cacheWarning}<p class="warn" role="status">{store.cacheWarning}</p>{/if}
    {#if store.configError}<ConfigBanner error={store.configError} />{/if}
    <AddInput bind:this={addInput} {store} />
    <!-- Double-click is a pointer convenience; the keyboard edits with Enter. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="board" data-testid="board" {ondblclick}>
      <!-- Four columns packed from the buckets in order when the board is shown, then kept (store.boardColumns). -->
      {#each store.boardColumns as col, i (i)}
        <div class="col" data-testid="board-col">
          {#each col as key (key)}
            <Bucket {store} {key} name={bucketName(key)} onpickdate={pick} ondroppickdate={onDropPickDate} />
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>
<Toast {store} />

<style>
  .vc { max-width: 1480px; margin: 0 auto; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 26px; align-items: start; }
  /* The rail stays pinned while the board scrolls. It has no scrollbar of its own: a rail taller than the
     window shows its end when the page reaches its end. */
  .rail { position: sticky; top: calc(16px + env(safe-area-inset-top, 0px)); display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .brand { font: 600 15px var(--mono); letter-spacing: -.01em; }
  .brand span { color: var(--faint); font-weight: 400; }
  .rblock { display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 8px; }
  .group { padding: 8px 4px 10px; }
  .group :global(.task) { grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; padding: 6px 4px 6px 8px; }
  .group :global(.task .title) { font-size: 14px; }
  .group :global(.bhead .name) { font-size: 15px; }
  .main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .warn { margin: 0; font: 12px var(--mono); color: var(--danger); }
  .board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-items: stretch; }
  .col { display: flex; flex-direction: column; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 8px 4px 10px; min-width: 0; }
  .col > :global(.bucket:only-child) { flex: 1; min-height: 160px; }
  .col :global(.task) { grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; padding: 6px 4px 6px 8px; }
  .col :global(.task .title) { font-size: 14px; }
  .col :global(.bhead .name) { font-size: 15px; }
  @media (max-width: 1180px) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
