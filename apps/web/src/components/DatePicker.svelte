<script lang="ts">
  import { addDays, describeRepeat, endOfNextWeek, endOfWeek, findTask, hasWeekLeft, weekdayShort } from '@taskapp/core';
  import type { ISODate } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';

  let {
    store,
    taskId,
    suggested,
    beforeId,
    onclose,
  }: {
    store: AppStore;
    taskId: string;
    /** Pre-fills the date field (a drop on Later suggests the first day of Later). */
    suggested?: ISODate;
    /** Places the task before this one when the date is set. */
    beforeId?: string;
    onclose: () => void;
  } = $props();

  const task = $derived(findTask(store.state, taskId));
  // The sheet only edits a task that still exists; if sync removed it, there is nothing left to pick for.
  $effect(() => {
    if (!task) onclose();
  });

  // The field starts from the suggestion or the current date; it is the user's to edit after that.
  // svelte-ignore state_referenced_locally
  let picked = $state(suggested ?? task?.date ?? '');

  const ctx = $derived(store.ctx);
  const chips = $derived([
    { label: 'Today', date: ctx.today as ISODate | null },
    { label: `Tomorrow · ${weekdayShort(addDays(ctx.today, 1))}`, date: addDays(ctx.today, 1) },
    ...(hasWeekLeft(ctx) ? [{ label: `This week · ${weekdayShort(endOfWeek(ctx))}`, date: endOfWeek(ctx) }] : []),
    { label: `Next week · ${weekdayShort(endOfNextWeek(ctx))}`, date: endOfNextWeek(ctx) },
    { label: 'Someday', date: null },
  ]);

  function set(date: ISODate | null): void {
    store.setDate(taskId, date, beforeId);
    onclose();
  }
</script>

{#if task}
  <h3>{task.title}</h3>
  <div class="sub">{suggested ? 'Pick a date in Later' : 'Pick a date'}{task.repeat ? ` · repeats ${describeRepeat(task.repeat)}` : ''}</div>
  <div class="chips">
    {#each chips as chip (chip.label)}
      <button class="chip" onclick={() => set(chip.date)}>{chip.label}</button>
    {/each}
  </div>
  <form class="row" onsubmit={(e) => { e.preventDefault(); set(picked || null); }}>
    <input type="date" class="fld" data-autofocus aria-label="Due date" bind:value={picked} />
    <button type="submit" class="btn primary">Set date</button>
  </form>
  <div class="actions"><button class="btn ghost" onclick={onclose}>Cancel</button></div>
{/if}

<style>
  h3 { margin: 0; font: 600 15px var(--mono); overflow-wrap: anywhere; }
  .sub { font: 12px var(--mono); color: var(--muted); margin-top: -8px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 5px 10px; font: 12.5px var(--mono); cursor: pointer; }
  .chip:hover { border-color: var(--faint); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .fld { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); padding: 8px 10px; font: 14px var(--mono); outline: 0; min-width: 0; }
  .fld:focus { border-color: var(--accent); }
  .btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 7px 13px; font: 500 13px var(--sans); cursor: pointer; }
  .btn:hover { border-color: var(--faint); }
  .btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .btn.ghost { border-color: transparent; color: var(--muted); }
  .actions { display: flex; justify-content: flex-end; }
</style>
