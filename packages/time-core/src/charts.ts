// Weekly series for the hours charts.
import { groupCategories } from './categories.ts';
import type { WeekStart } from './config.ts';
import { roundHours } from './hours.ts';
import { compareText, type EventRow } from './rows.ts';
import { inRange, isDone, weekStartOf, type DateRange } from './summary.ts';
import { addDays, daysBetween } from './zone.ts';

export interface WeeklySeries {
  /** Start date of every week, first to last. */
  weeks: string[];
  series: { key: string; label: string; hours: number[] }[];
}

function weeksOf(range: DateRange, weekStart: WeekStart): string[] {
  const last = weekStartOf(range.to, weekStart);
  const weeks: string[] = [];
  for (let w = weekStartOf(range.from, weekStart); w <= last; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

function hoursPerWeek(rows: EventRow[], weeks: string[], weekStart: WeekStart): number[] {
  const first = weeks[0];
  if (first === undefined) return [];
  const sums = weeks.map(() => 0);
  for (const r of rows) {
    const i = daysBetween(first, weekStartOf(r.date, weekStart)) / 7;
    if (i >= 0 && i < sums.length) sums[i]! += r.hours;
  }
  return sums.map(roundHours);
}

const total = (hours: number[]) => hours.reduce((a, b) => a + b, 0);

function counted(rows: EventRow[], range: DateRange, nowMs: number, includePlanned: boolean): EventRow[] {
  return rows.filter((r) => r.known && inRange(r, range) && (includePlanned || isDone(r, nowMs)));
}

/** One series per known project; done hours only unless `includePlanned`. */
export function weeklyByProject(
  rows: EventRow[],
  range: DateRange,
  weekStart: WeekStart,
  nowMs: number,
  includePlanned = false,
): WeeklySeries {
  const weeks = weeksOf(range, weekStart);
  const byProject = new Map<string, EventRow[]>();
  for (const r of counted(rows, range, nowMs, includePlanned)) {
    const list = byProject.get(r.project);
    if (list) list.push(r);
    else byProject.set(r.project, [r]);
  }
  const series = [...byProject].map(([code, list]) => ({
    key: code,
    label: code,
    hours: hoursPerWeek(list, weeks, weekStart),
  }));
  series.sort((a, b) => total(b.hours) - total(a.hours) || compareText(a.key, b.key));
  return { weeks, series };
}

/** One series per category of one project; the no-category series has label `''` and comes last. */
export function weeklyByCategory(
  rows: EventRow[],
  code: string,
  range: DateRange,
  weekStart: WeekStart,
  nowMs: number,
  includePlanned = false,
): WeeklySeries {
  const weeks = weeksOf(range, weekStart);
  const upper = code.toUpperCase();
  const mine = counted(rows, range, nowMs, includePlanned).filter((r) => r.project.toUpperCase() === upper);
  const series = [...groupCategories(mine)].map(([key, g]) => ({
    key,
    label: g.name,
    hours: hoursPerWeek(g.rows, weeks, weekStart),
  }));
  series.sort((a, b) => {
    if ((a.key === '') !== (b.key === '')) return a.key === '' ? 1 : -1;
    return total(b.hours) - total(a.hours) || compareText(a.key, b.key);
  });
  return { weeks, series };
}
