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
  import SignIn from './components/SignIn.svelte';

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

  const LOSE_EDITS =
    "You have changes that aren't saved to OneDrive yet. Signing in again will lose them. Continue?";

  /**
   * Signs in by redirect, which leaves the page. Pending edits go to the cache first; if some would
   * still be lost (memory-only cache, or the cache write failed), the user decides.
   */
  async function signIn(): Promise<void> {
    if (result === null || !result.auth) return;
    signInError = null;
    if (result.kind === 'ready') {
      try {
        await result.store.flush();
      } catch (e) {
        signInError = `Could not save your changes before signing in: ${message(e)}`;
        return;
      }
      if (result.store.wouldLoseEdits() && !window.confirm(LOSE_EDITS)) return;
    }
    try {
      await result.auth.signIn();
    } catch (e) {
      signInError = `Sign-in failed: ${message(e)}`;
    }
  }

  // config.yaml's theme forces light or dark; `system` leaves it to the device (tokens.css).
  $effect(() => {
    const theme = result?.kind === 'ready' ? result.store.config.theme : 'system';
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });
</script>

{#if error !== null}
  <div class="notice">
    <p role="alert">TaskApp could not start: {error}</p>
    <!-- A fresh start re-runs sign-in from scratch (a stale redirect, a cache that failed to open). -->
    <button type="button" class="retry" onclick={() => window.location.reload()}>Try again</button>
  </div>
{:else if result === null}
  <p class="notice">Loading…</p>
{:else if result.kind === 'signin'}
  <SignIn onsignin={signIn} error={signInError} />
{:else}
  {@const store = result.store}
  {@const onSignIn = result.auth ? signIn : undefined}
  {#if signInError}<p class="signin-error" role="alert">{signInError}</p>{/if}
  {#if store.view === 'board' && !phone.value}
    <WeekBoardView {store} onCommand={openSheet} onDropPickDate={openDropDate} {onSignIn} />
  {:else}
    <TaskListView {store} onCommand={openSheet} onDropPickDate={openDropDate} {onSignIn} />
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
  .retry { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 7px 14px; font: 500 14px var(--sans); cursor: pointer; }
  .signin-error { max-width: 1160px; margin: 0 auto 12px; font: 12px var(--mono); color: var(--danger); }
</style>
