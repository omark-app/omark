<script lang="ts">
  import { bucketOf, dateForBucket, dayMonth, describeRepeat, movableBuckets, weekdayShort } from '@taskapp/core';
  import type { MovableBucket, Task, WeekCtx } from '@taskapp/core';

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

  const current = $derived(bucketOf(task, ctx));

  /** Where a move lands: `Fri` for Today, `Sun 18 Oct` for a week, `no date` for Someday. */
  function landing(key: MovableBucket): string {
    const d = dateForBucket(key, ctx);
    if (d === null) return 'no date';
    return key === 'today' ? weekdayShort(d) : `${weekdayShort(d)} ${dayMonth(d, ctx)}`;
  }

  // Spec 9.2: Today, This week, Next week, Pick a date…, Someday, Repeat… (Pick a date… sits just before Someday).
  const options = $derived<Option[]>([
    ...movableBuckets(ctx).flatMap((b): Option[] => {
      const move = { label: b.name, detail: landing(b.key), current: current === b.key, run: () => onmove(b.key) };
      return b.key === 'someday' ? [{ label: 'Pick a date…', detail: task.date ? dayMonth(task.date, ctx) : 'no date', run: onpickdate }, move] : [move];
    }),
    { label: 'Repeat…', detail: task.repeat ? describeRepeat(task.repeat) : 'none', run: onrepeat },
  ]);
</script>

<div class="opts">
  {#each options as o (o.label)}
    <button type="button" class="opt" onclick={o.run}><span>{o.label}{o.current ? ' ✓' : ''}</span> <span class="r">{o.detail}</span></button>
  {/each}
</div>
