<script lang="ts">
  import { dayOfWeek, findTask } from '@taskapp/core';
  import type { RepeatRule } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';

  let { store, taskId, onclose }: { store: AppStore; taskId: string; onclose: () => void } = $props();

  type Kind = 'none' | RepeatRule['type'];

  const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const task = $derived(findTask(store.state, taskId));
  $effect(() => {
    if (!task) onclose();
  });

  // The form starts from the task's current rule; after that it is the user's to edit.
  // svelte-ignore state_referenced_locally
  const rule = task?.repeat ?? null;
  // svelte-ignore state_referenced_locally
  const anchor = task?.date ?? store.ctx.today;
  let kind = $state<Kind>(rule?.type ?? 'none');
  let days = $state<number[]>(rule?.type === 'weekly' ? [...rule.days] : [dayOfWeek(anchor)]);
  let weekN = $state(rule?.type === 'weekly' ? (rule.n ?? 1) : 1);
  let monthDay = $state(rule?.type === 'monthly' ? rule.day : Number(anchor.slice(8)));
  let monthN = $state(rule?.type === 'monthly' ? (rule.n ?? 1) : 1);
  let everyN = $state(rule?.type === 'every' ? rule.n : 2);
  let everyUnit = $state<Extract<RepeatRule, { type: 'every' }>['unit']>(rule?.type === 'every' ? rule.unit : 'days');
  let afterN = $state(rule?.type === 'after' ? rule.n : 3);

  function toggleDay(i: number): void {
    if (days.includes(i)) {
      if (days.length > 1) days = days.filter((d) => d !== i);
    } else {
      days = [...days, i].sort((a, b) => a - b);
    }
    kind = 'weekly';
  }

  const count = (n: number, max = Infinity): number => Math.min(max, Math.max(1, Math.trunc(n) || 1));
  // An interval of 1 is the plain weekly / monthly rule, which has no `n`.
  const interval = (n: number): { n?: number } => (count(n) > 1 ? { n: count(n) } : {});
  const plural = (n: number, unit: string): string => (count(n) === 1 ? unit : `${unit}s`);

  function save(): void {
    const rules: Record<Kind, RepeatRule | null> = {
      none: null,
      daily: { type: 'daily' },
      weekdays: { type: 'weekdays' },
      weekly: { type: 'weekly', days: [...days], ...interval(weekN) },
      monthly: { type: 'monthly', day: count(monthDay, 31), ...interval(monthN) },
      yearly: { type: 'yearly' },
      every: { type: 'every', n: count(everyN), unit: everyUnit },
      after: { type: 'after', n: count(afterN) },
    };
    store.setRepeat(taskId, rules[kind]);
    onclose();
  }

  // Focusing a rule's own field picks that rule.
  const pick = (k: Kind) => () => {
    kind = k;
  };
</script>

{#if task}
  <h3>{task.title}</h3>
  <div class="sub">Repeat</div>
  <form class="list" onsubmit={(e) => { e.preventDefault(); save(); }}>
    <label><input type="radio" name="rep" value="none" bind:group={kind} data-autofocus /> No repeat</label>
    <label><input type="radio" name="rep" value="daily" bind:group={kind} /> Every day</label>
    <label><input type="radio" name="rep" value="weekdays" bind:group={kind} /> Weekdays</label>
    <label>
      <input type="radio" name="rep" value="weekly" bind:group={kind} /> Every
      <input class="fld small" type="number" min="1" aria-label="Week interval" bind:value={weekN} onfocus={pick('weekly')} />
      {plural(weekN, 'week')} on
      <span class="days">
        {#each DAYS as d, i (i)}
          <button type="button" class:on={days.includes(i)} aria-pressed={days.includes(i)} onclick={() => toggleDay(i)}>{d}</button>
        {/each}
      </span>
    </label>
    <label>
      <input type="radio" name="rep" value="monthly" bind:group={kind} /> Every
      <input class="fld small" type="number" min="1" aria-label="Month interval" bind:value={monthN} onfocus={pick('monthly')} />
      {plural(monthN, 'month')} on day
      <input class="fld small" type="number" min="1" max="31" aria-label="Day of the month" bind:value={monthDay} onfocus={pick('monthly')} />
    </label>
    <label><input type="radio" name="rep" value="yearly" bind:group={kind} /> Every year</label>
    <label>
      <input type="radio" name="rep" value="every" bind:group={kind} /> Every
      <input class="fld small" type="number" min="1" aria-label="Repeat interval" bind:value={everyN} onfocus={pick('every')} />
      <select class="fld" aria-label="Interval unit" bind:value={everyUnit} onfocus={pick('every')}>
        <option value="days">days</option>
        <option value="weeks">weeks</option>
        <option value="months">months</option>
      </select>
    </label>
    <label>
      <input type="radio" name="rep" value="after" bind:group={kind} />
      <input class="fld small" type="number" min="1" aria-label="Days after completion" bind:value={afterN} onfocus={pick('after')} /> days after I complete it
    </label>
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>
{/if}

<style>
  .list { display: flex; flex-direction: column; gap: 4px; }
  label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 4px; font: 13.5px var(--mono); border-radius: 8px; }
  label:hover { background: var(--sel); }
  .days { display: flex; gap: 3px; }
  .days button { width: 30px; height: 26px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 6px; font: 11px var(--mono); cursor: pointer; padding: 0; }
  .days button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .actions { margin-top: 8px; }
</style>
