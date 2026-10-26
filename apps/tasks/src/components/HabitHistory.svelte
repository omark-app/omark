<script lang="ts">
  import { dayMonth, describeRepeat, formedEstimate, habitsInProgress } from '@omark/tasks-core';
  import type { ISODate } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import Sheet from './Sheet.svelte';

  let {
    store,
    variant,
    onclose,
  }: {
    store: AppStore;
    /** A bottom sheet on the phone, a dialog on desktop. */
    variant: 'sheet' | 'dialog';
    onclose: () => void;
  } = $props();

  const ctx = $derived(store.ctx);
  const habits = $derived(habitsInProgress(store.state.doc));
  const history = $derived(store.history);
  const day = (d: ISODate): string => dayMonth(d, ctx);
  const times = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

  /** `31 of 66 · every day · misses 1/6 · formed ~ 30 Nov`. */
  function progressLine(id: string): string {
    const task = habits.find((t) => t.id === id);
    const p = store.habits.get(id);
    if (!task || !p) return '';
    const parts = [`${p.count} of ${p.rules.goal}`, describeRepeat(task.repeat ?? { type: 'daily' }), `misses ${p.missesThisAttempt}/${p.rules.missesPerAttempt}`];
    if (p.attempt > 1) parts.push(`attempt ${p.attempt} (best ${p.best})`);
    const estimate = p.doneThisPeriod && task.repeat ? formedEstimate(p, task.repeat, ctx.today) : null;
    if (estimate) parts.push(`formed ~ ${day(estimate)}`);
    return parts.join(' · ');
  }

  /** Opens the native dialog as a modal: Esc closes it, and it traps focus. */
  function modal(node: HTMLDialogElement): void {
    node.showModal();
  }
  function backdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) onclose();
  }
</script>

{#snippet body()}
  <div class="hist" data-testid="habit-history">
    <div class="head">
      <h3>Habits</h3>
      <button class="btn" onclick={onclose}>Close</button>
    </div>
    <span class="lbl">In progress {habits.length}{store.habitCount.max > 0 ? ` of ${store.habitCount.max}` : ''}</span>
    <div>
      {#each habits as task (task.id)}
        {@const p = store.habits.get(task.id)}
        <div class="item">
          <span class="ti habit">{task.title}</span>
          <span class="sub">{#if p?.lastChance}<span class="red">last chance</span> · {/if}{progressLine(task.id)}</span>
        </div>
      {:else}
        <div class="sub">None.</div>
      {/each}
    </div>
    <span class="lbl">Formed {history.formed.length}</span>
    <div>
      {#each history.formed as h, i (i)}
        <div class="item">
          <span class="ti">{h.title}</span>
          <span class="sub">{times(h.goal, 'time')} · {day(h.first)} → {day(h.last)} ({times(h.days, 'day')}) · {times(h.attempts, 'attempt')}</span>
        </div>
      {:else}
        <div class="sub">None yet.</div>
      {/each}
    </div>
    <span class="lbl">Dropped {history.dropped.length}</span>
    <div>
      {#each history.dropped as h, i (i)}
        <div class="item">
          <span class="ti dim">{h.title}</span>
          <span class="sub">best {h.best} · {times(h.attempts, 'attempt')} · dropped {day(h.on)}</span>
        </div>
      {:else}
        <div class="sub">None.</div>
      {/each}
    </div>
    <p class="foot">Formed and dropped habits live in <code>done.md</code>. Restarting a dropped one is just adding it again.</p>
  </div>
{/snippet}

{#if variant === 'sheet'}
  <Sheet open={true} {onclose}>{@render body()}</Sheet>
{:else}
  <!-- Esc is the dialog's own; a click on the backdrop (the dialog element itself) closes it too. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <dialog use:modal {onclose} onclick={backdrop}>{@render body()}</dialog>
{/if}

<style>
  dialog { width: min(560px, calc(100% - 32px)); max-height: 80vh; padding: 20px 22px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
  dialog::backdrop { background: rgba(8, 12, 20, .38); }
  .hist { display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .lbl { margin-top: 6px; font: 600 11.5px var(--sans); letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .item { display: flex; flex-direction: column; gap: 3px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .ti { font: 13.5px var(--mono); }
  .ti.habit { color: var(--habit-ink); }
  .ti.dim { color: var(--muted); }
  .sub { font: 12px var(--sans); color: var(--muted); }
  .red { color: var(--danger); }
  .foot { margin: 6px 0 0; font: 12px/1.5 var(--sans); color: var(--muted); }
  code { font-family: var(--mono); }
  h3 { margin: 0; font: 600 17px var(--sans); }
  .btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 5px 11px; font: 500 12.5px var(--sans); cursor: pointer; }
</style>
