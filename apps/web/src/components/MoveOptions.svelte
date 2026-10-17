<script lang="ts">
  import { bucketOf, dayMonth, describeRepeat, endOfNextWeek, endOfWeek, hasWeekLeft, weekdayShort } from '@taskapp/core';
  import type { ISODate, Task, WeekCtx } from '@taskapp/core';
  import type { MovableBucket } from '../lib/store.svelte.ts';

  let {
    task,
    ctx,
    onmove,
    onpickdate,
    onrepeat,
  }: {
    task: Task;
    ctx: WeekCtx;
    onmove: (bucket: MovableBucket) => void;
    onpickdate: () => void;
    onrepeat: () => void;
  } = $props();

  type Option = { label: string; detail: string; current?: boolean; run: () => void };

  const full = (d: ISODate): string => `${weekdayShort(d)} ${dayMonth(d, ctx)}`;
  const current = $derived(bucketOf(task, ctx));
  const move = (key: MovableBucket, label: string, detail: string): Option => ({ label, detail, current: current === key, run: () => onmove(key) });

  // Spec 9.2: Today, This week, Next week, Pick a date…, Someday, Repeat… (This week is gone on its last day).
  const options = $derived<Option[]>([
    move('today', 'Today', weekdayShort(ctx.today)),
    ...(hasWeekLeft(ctx) ? [move('week', 'This week', full(endOfWeek(ctx)))] : []),
    move('next', 'Next week', full(endOfNextWeek(ctx))),
    { label: 'Pick a date…', detail: task.date ? dayMonth(task.date, ctx) : 'no date', run: onpickdate },
    move('someday', 'Someday', 'no date'),
    { label: 'Repeat…', detail: task.repeat ? describeRepeat(task.repeat) : 'none', run: onrepeat },
  ]);
</script>

<div class="opts">
  {#each options as o (o.label)}
    <button type="button" class="opt" onclick={o.run}><span>{o.label}{o.current ? ' ✓' : ''}</span> <span class="r">{o.detail}</span></button>
  {/each}
</div>
