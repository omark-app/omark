<script lang="ts">
  import { boot } from './lib/boot.ts';
  import type { BootResult } from './lib/boot.ts';
  import TaskListView from './components/TaskListView.svelte';
  import WeekBoardView from './components/WeekBoardView.svelte';
  import type { ShellCommand } from './lib/commands.svelte.ts';
  import Sheet from './components/Sheet.svelte';
  import DatePicker from './components/DatePicker.svelte';
  import RepeatPicker from './components/RepeatPicker.svelte';

  /** The open picker. Task 26 sets `suggested` and `beforeId` when a task is dropped on Later. */
  type OpenSheet = { kind: 'date'; id: string; suggested?: string; beforeId?: string } | { kind: 'repeat'; id: string };

  let result = $state.raw<BootResult | null>(null);
  let error = $state<string | null>(null);
  let signInError = $state<string | null>(null);
  let sheet = $state<OpenSheet | null>(null);

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
  {#if result.store.view === 'board'}
    <WeekBoardView store={result.store} onCommand={openSheet} />
  {:else}
    <TaskListView store={result.store} onCommand={openSheet} />
  {/if}
  <Sheet open={sheet !== null} onclose={() => (sheet = null)}>
    {#if sheet?.kind === 'date'}
      <DatePicker store={result.store} taskId={sheet.id} suggested={sheet.suggested} beforeId={sheet.beforeId} onclose={() => (sheet = null)} />
    {:else if sheet?.kind === 'repeat'}
      <RepeatPicker store={result.store} taskId={sheet.id} onclose={() => (sheet = null)} />
    {/if}
  </Sheet>
{/if}

<style>
  .notice { max-width: 420px; margin: 20vh auto 0; font: 14px var(--mono); color: var(--muted); }
  .signin { border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); border-radius: 8px; padding: 9px 16px; font: 500 14px var(--sans); cursor: pointer; }
</style>
