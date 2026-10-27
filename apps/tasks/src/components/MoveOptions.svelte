<script lang="ts">
  import { currentChoice, dateChoices, dateForChoice, dayMonth, describeRepeat, weekdayShort } from '@omark/tasks-core';
  import type { ChoiceKey, Task, WeekCtx } from '@omark/tasks-core';

  let {
    task,
    ctx,
    onmove,
    onpickdate,
    onrepeat,
    onimportant,
    onhabit,
  }: {
    task: Task;
    ctx: WeekCtx;
    onmove: (choice: ChoiceKey) => void;
    onpickdate: () => void;
    onrepeat: () => void;
    onimportant: () => void;
    onhabit: () => void;
  } = $props();

  type Option = { label: string; detail: string; current?: boolean; run: () => void };

  const current = $derived(currentChoice(task, ctx));

  /** Where a move lands: `Fri` for Today, `Sun 18 Oct` for a week or Tomorrow, `no date` for Someday. */
  function landing(key: ChoiceKey): string {
    const d = dateForChoice(key, ctx);
    if (d === null) return 'no date';
    return key === 'today' ? weekdayShort(d) : `${weekdayShort(d)} ${dayMonth(d, ctx)}`;
  }

  // Spec 9.2: Today, Tomorrow, This week, Next week, Pick a date…, Someday, Repeat…, Important, Habit (Pick a date…
  // sits just before Someday).
  const options = $derived<Option[]>([
    ...dateChoices(ctx).flatMap((b): Option[] => {
      const move = { label: b.name, detail: landing(b.key), current: current === b.key, run: () => onmove(b.key) };
      return b.key === 'someday' ? [{ label: 'Pick a date…', detail: task.date ? dayMonth(task.date, ctx) : 'no date', run: onpickdate }, move] : [move];
    }),
    { label: 'Repeat…', detail: task.repeat ? describeRepeat(task.repeat) : 'none', run: onrepeat },
    { label: task.important ? 'Not important' : 'Mark important', detail: task.important ? '' : 'imp', run: onimportant },
    { label: task.habit ? 'Not a habit' : 'Make it a habit', detail: task.habit ? '' : 'hab', run: onhabit },
  ]);
</script>

<div class="opts">
  {#each options as o (o.label)}
    <button type="button" class="opt" class:imp={o.run === onimportant} class:hab={o.run === onhabit} onclick={o.run}><span>{o.label}{o.current ? ' ✓' : ''}</span> <span class="r">{o.detail}</span></button>
  {/each}
</div>

<style>
  .opt.imp > span:first-child { color: var(--imp); }
  .opt.hab > span:first-child { color: var(--habit-ink); }
</style>
