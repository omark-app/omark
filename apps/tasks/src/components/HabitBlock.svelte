<script lang="ts">
  import { dayMonth, daysBetween, formedEstimate, isUsableHabitRule } from '@omark/tasks-core';
  import type { HabitProgress, PeriodMark, Task } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import { habitWarning } from '../lib/habit-text.ts';

  let {
    store,
    task,
    progress,
    keys = true,
    act = (run) => run(),
  }: {
    store: AppStore;
    task: Task;
    progress: HabitProgress;
    /** Show the key beside Not a habit (the desktop detail). */
    keys?: boolean;
    /** Runs Not a habit or Drop habit; the edit sheet saves the typed text first and closes after. */
    act?: (run: () => void) => void;
  } = $props();

  const TIPS: Record<PeriodMark, string> = {
    done: 'done',
    missed: 'missed',
    restart: 'restart',
    idle: 'no attempt running',
    today: 'today',
  };

  const p = $derived(progress);
  const estimate = $derived.by(() => {
    const rule = task.repeat && isUsableHabitRule(task.repeat) ? task.repeat : null;
    const d = rule ? formedEstimate(p, rule, store.ctx.today) : null;
    return d ? dayMonth(d, store.ctx) : null;
  });
  const warning = $derived(habitWarning(p));
  /** `Last 28 days`, `Last 12 weeks`, or periods for any other length. */
  const span = $derived.by(() => {
    const n = p.marks.length;
    const len = daysBetween(p.period.start, p.period.end) + 1;
    const unit = len === 1 ? 'day' : len === 7 ? 'week' : 'period';
    return `Last ${n} ${unit}${n === 1 ? '' : 's'}`;
  });
  const attempt = $derived(p.bestAttempt === null ? `${p.attempt}` : `${p.attempt} · best ${p.best} (attempt ${p.bestAttempt})`);

  let editing = $state(false);
  let goalText = $state('');

  function editGoal(): void {
    goalText = task.habit?.goal != null ? String(task.habit.goal) : '';
    editing = true;
  }

  /**
   * Saves the typed goal: empty is the configured one; anything outside 1–999 is left alone. A setting, not
   * an action: the edit sheet stays open and keeps what is typed in it.
   */
  function saveGoal(): void {
    if (!editing) return;
    editing = false;
    const text = goalText.trim();
    const goal = text === '' ? null : Number(text);
    if (goal !== null && !(Number.isInteger(goal) && goal >= 1 && goal <= 999)) return;
    if (goal === (task.habit?.goal ?? null)) return;
    store.setHabitGoal(task.id, goal);
  }

  function goalKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      saveGoal();
    } else if (e.key === 'Escape') {
      // Esc leaves the field only, not the detail or the sheet.
      e.preventDefault();
      e.stopPropagation();
      editing = false;
    }
  }
</script>

<div class="hb" data-testid="habit-block">
  <div class="head">
    <span class="count">{p.count} <span class="of">of {p.rules.goal}</span></span>
    {#if estimate}<span class="est">formed ~ {estimate} if no misses</span>{/if}
  </div>
  <span class="bar" aria-hidden="true"><span style="width: {Math.min(100, (p.count / p.rules.goal) * 100)}%"></span></span>
  {#if warning}<div class="warn" class:restarted={p.restarted} data-testid="habit-warning">{warning}</div>{/if}

  <div class="marks">
    <span class="lab">{span}</span>
    <div class="grid">
      {#each p.marks as m (m.period.start)}
        <span class="sq {m.mark}" data-testid="habit-period" data-mark={m.mark} title={TIPS[m.mark]}></span>
      {/each}
    </div>
    <div class="legend" aria-hidden="true">
      <span><span class="sq done"></span> done</span>
      <span><span class="sq missed"></span> missed</span>
      <span><span class="sq restart"></span> restart</span>
      <span><span class="sq today"></span> today</span>
    </div>
  </div>

  <div class="kvs">
    <div class="kv"><span>Misses in a row</span><span>{p.missesInARow} of {p.rules.missesInARow} allowed</span></div>
    <div class="kv"><span>Misses this attempt</span><span>{p.missesThisAttempt} of {p.rules.missesPerAttempt} allowed</span></div>
    <div class="kv"><span>Attempt</span><span>{attempt}</span></div>
    {#if p.since}<div class="kv"><span>Counting since</span><span>{dayMonth(p.since, store.ctx)}</span></div>{/if}
  </div>

  <div class="goal">
    <span class="lab k">Goal</span>
    {#if editing}
      <input
        {@attach (el) => el.focus()}
        bind:value={goalText}
        class="gfield"
        inputmode="numeric"
        maxlength="3"
        placeholder={String(store.config.habits.goal)}
        aria-label="Goal"
        onkeydown={goalKey}
        onblur={saveGoal}
      />
    {:else}
      <button class="hbtn" data-testid="habit-goal" onclick={editGoal}>{task.habit?.goal ?? `${store.config.habits.goal} (default)`}</button>
    {/if}
    <span class="hint">{editing ? 'empty is the default' : 'change for this habit'}</span>
  </div>

  <div class="acts">
    <button class="hbtn habit" onclick={() => act(() => store.setHabit(task.id, false))}>Not a habit{keys ? ' (h)' : ''}</button>
    <button class="hbtn danger" onclick={() => act(() => store.remove(task.id))}>Drop habit</button>
  </div>
</div>

<style>
  .hb { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--habit) 30%, var(--line)); border-radius: 10px; background: color-mix(in srgb, var(--habit-soft) 45%, var(--surface)); }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .count { font: 600 26px var(--sans); color: var(--habit-ink); font-variant-numeric: tabular-nums; }
  .of { font-size: 15px; font-weight: 500; color: var(--muted); }
  .est { font: 12.5px var(--sans); color: var(--muted); }
  .bar { display: block; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--habit) 18%, transparent); }
  .bar > span { display: block; height: 100%; border-radius: 3px; background: var(--habit); }
  .warn { font: 500 12.5px var(--sans); color: var(--danger); }
  .warn.restarted { color: var(--muted); }
  .marks { display: flex; flex-direction: column; gap: 6px; }
  .lab { font: 600 11.5px var(--sans); letter-spacing: .04em; text-transform: uppercase; color: var(--faint); }
  .grid { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 4px; }
  .sq { display: block; aspect-ratio: 1; border-radius: 3px; box-sizing: border-box; }
  .sq.done { background: var(--habit); }
  .sq.missed { border: 1.5px solid var(--danger); }
  .sq.restart { background: var(--danger); }
  .sq.idle { background: var(--line); }
  .sq.today { border: 1.5px dashed var(--habit); }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font: 11.5px var(--sans); color: var(--muted); }
  .legend > span { display: inline-flex; align-items: center; gap: 5px; }
  .legend .sq { width: 9px; height: 9px; border-radius: 2px; }
  .kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); font: 13px var(--sans); color: var(--ink); }
  .kv:last-child { border-bottom: 0; }
  .kv > span:last-child { font-weight: 500; text-align: right; }
  .goal { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .goal .k { width: 46px; flex: none; }
  .hint { font: 12px var(--sans); color: var(--muted); }
  .gfield { width: 72px; box-sizing: border-box; border: 1px solid var(--accent); border-radius: 7px; background: var(--surface); color: var(--ink); padding: 5px 8px; font: 13px var(--mono); outline: 0; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .hbtn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 7px; padding: 6px 11px; font: 500 12.5px var(--sans); cursor: pointer; }
  .hbtn:hover { border-color: var(--faint); }
  .hbtn.habit { color: var(--habit-ink); border-color: color-mix(in srgb, var(--habit) 30%, var(--line)); }
  .hbtn.danger { color: var(--danger); margin-left: auto; }
  /* iOS zooms the page in when a field under 16px takes focus. */
  @media (max-width: 719.98px) {
    .gfield { font-size: 16px; }
  }
</style>
