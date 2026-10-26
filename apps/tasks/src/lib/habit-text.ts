import { dayMonth, describeRepeat, formedEstimate } from '@omark/tasks-core';
import type { HabitProgress, Task, WeekCtx } from '@omark/tasks-core';

/** A rule's short wording: `Mon, Wed, Fri` for plain weekly days, else the picker's. */
function shortRule(task: Task): string | null {
  const rule = task.repeat;
  if (!rule || rule.type === 'daily') return null;
  const text = describeRepeat(rule);
  return rule.type === 'weekly' && (rule.n ?? 1) === 1 ? text.replace(/^every /, '') : text;
}

/**
 * The one line under a habit in the Habits group and History (habits spec 9.3), parts joined by ` · `:
 * the rule when it is not daily, the status (last chance or done), the misses, the attempt, the estimate.
 */
export function habitStateLine(task: Task, p: HabitProgress, ctx: WeekCtx): string {
  const attempt = `attempt ${p.attempt} (best ${p.best})`;
  if (p.restarted) return attempt;
  const day = p.period.start === p.period.end;
  const parts: string[] = [];
  const rule = shortRule(task);
  if (rule) parts.push(rule);
  if (p.lastChance) parts.push(`missed ${day ? 'yesterday' : 'last time'} · one more miss restarts`);
  else if (p.doneThisPeriod) parts.push(day ? 'done today' : 'done this period');
  parts.push(`misses ${p.missesThisAttempt}/${p.rules.missesPerAttempt}`);
  if (p.attempt > 1) parts.push(attempt);
  if (p.doneThisPeriod && task.repeat) {
    const estimate = formedEstimate(p, task.repeat, ctx.today);
    if (estimate) parts.push(`formed ~ ${dayMonth(estimate, ctx)}`);
  }
  return parts.join(' · ');
}
