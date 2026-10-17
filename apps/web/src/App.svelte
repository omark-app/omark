<script lang="ts">
  import type { ISODate } from '@taskapp/core';
  import { boot } from './lib/boot.ts';
  import type { BootResult } from './lib/boot.ts';
  import TaskListView from './components/TaskListView.svelte';
  import WeekBoardView from './components/WeekBoardView.svelte';
  import { createPhone } from './lib/commands.svelte.ts';
  import type { ShellCommand } from './lib/commands.svelte.ts';
  import Sheet from './components/Sheet.svelte';
  import DatePicker from './components/DatePicker.svelte';
  import RepeatPicker from './components/RepeatPicker.svelte';
  import AddSheet from './components/AddSheet.svelte';
  import EditSheet from './components/EditSheet.svelte';
  import MoveSheet from './components/MoveSheet.svelte';
  import Fab from './components/Fab.svelte';

  /** The open sheet. A drop on Later sets `suggested` and `beforeId`. Add, edit and move are phone sheets. */
  type OpenSheet =
    | { kind: 'date'; id: string; suggested?: ISODate; beforeId?: string }
    | { kind: 'repeat'; id: string }
    | { kind: 'add' }
    | { kind: 'edit'; id: string }
    | { kind: 'move'; id: string };

  let result = $state.raw<BootResult | null>(null);
  let error = $state<string | null>(null);
  let signInError = $state<string | null>(null);
  let sheet = $state<OpenSheet | null>(null);
  // Phones always get the Task list (whatever the view), with the + button.
  const phone = createPhone();

  const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  boot().then(
    (r) => {
      result = r;
    },
    (e: unknown) => {
      error = message(e);
    },
  );

  function openSheet(command: ShellCommand, id: string): void {
    if (command === 'pickDate') sheet = { kind: 'date', id };
    else if (command === 'repeat') sheet = { kind: 'repeat', id };
    else if (command === 'move') sheet = { kind: 'move', id };
    // On desktop, edit means the detail's title field, which the view focuses itself.
    else if (command === 'edit' && phone.value) sheet = { kind: 'edit', id };
  }

  const closeSheet = (): void => {
    sheet = null;
  };

  function openDropDate(id: string, suggested: ISODate, beforeId: string | null): void {
    sheet = { kind: 'date', id, suggested, beforeId: beforeId ?? undefined };
  }

  async function signIn(): Promise<void> {
    if (result?.kind !== 'signin') return;
    try {
      await result.auth.signIn();
    } catch (e) {
      signInError = message(e);
    }
  }
</script>

{#if error !== null}
  <p class="notice" role="alert">TaskApp could not start: {error}</p>
{:else if result === null}
  <p class="notice">Loading…</p>
{:else if result.kind === 'signin'}
  <div class="notice">
    <button class="signin" onclick={signIn}>Sign in with Microsoft</button>
    {#if signInError}<p role="alert">Sign-in failed: {signInError}</p>{/if}
  </div>
{:else}
  {@const store = result.store}
  {#if store.view === 'board' && !phone.value}
    <WeekBoardView {store} onCommand={openSheet} onDropPickDate={openDropDate} />
  {:else}
    <TaskListView {store} onCommand={openSheet} onDropPickDate={openDropDate} />
  {/if}
  {#if phone.value}<Fab onclick={() => (sheet = { kind: 'add' })} />{/if}
  <!-- One sheet per kind, so a sheet opened from another (move → date) gets its own focus and backdrop guard. -->
  {#key sheet?.kind}
    <Sheet open={sheet !== null} onclose={closeSheet}>
      {#if sheet?.kind === 'date'}
        <DatePicker {store} taskId={sheet.id} suggested={sheet.suggested} beforeId={sheet.beforeId} onclose={closeSheet} />
      {:else if sheet?.kind === 'repeat'}
        <RepeatPicker {store} taskId={sheet.id} onclose={closeSheet} />
      {:else if sheet?.kind === 'add'}
        <AddSheet {store} onclose={closeSheet} />
      {:else if sheet?.kind === 'edit'}
        {@const id = sheet.id}
        <EditSheet {store} taskId={id} oncommand={(c) => openSheet(c, id)} onclose={closeSheet} />
      {:else if sheet?.kind === 'move'}
        {@const id = sheet.id}
        <MoveSheet {store} taskId={id} oncommand={(c) => openSheet(c, id)} onclose={closeSheet} />
      {/if}
    </Sheet>
  {/key}
{/if}

<style>
  .notice { max-width: 420px; margin: 20vh auto 0; font: 14px var(--mono); color: var(--muted); }
  .signin { border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); border-radius: 8px; padding: 9px 16px; font: 500 14px var(--sans); cursor: pointer; }
</style>
