// Date ranges and the hours summary.
import { groupCategories } from './categories.ts';
import type { WeekStart } from './config.ts';
import { rowSeconds, secondsToHours } from './hours.ts';
import { compareText, type EventRow } from './rows.ts';
import { addDays, parseInstant, weekday } from './zone.ts';

export type RangeName = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
/** Dates are YYYY-MM-DD; both ends are included. */
export interface DateRange {
  from: string;
  to: string;
}

const WEEK_DAYS: Record<WeekStart, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/** The first day of the week that contains `date`. */
export function weekStartOf(date: string, weekStart: WeekStart): string {
  return addDays(date, -((weekday(date) - WEEK_DAYS[weekStart] + 7) % 7));
}

function monthRange(year: number, month: number): DateRange {
  const p = (n: number) => String(n).padStart(2, '0');
  const y = (n: number) => String(n).padStart(4, '0');
  const next = month === 12 ? `${y(year + 1)}-01-01` : `${y(year)}-${p(month + 1)}-01`;
  return { from: `${y(year)}-${p(month)}-01`, to: addDays(next, -1) };
}

export function namedRange(name: RangeName, today: string, weekStart: WeekStart): DateRange {
  if (name === 'thisWeek' || name === 'lastWeek') {
    const start = weekStartOf(today, weekStart);
    const from = name === 'thisWeek' ? start : addDays(start, -7);
    return { from, to: addDays(from, 6) };
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (name === 'thisMonth') return monthRange(year, month);
  return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1);
}

/** The row has ended: its end is at or before now. */
export function isDone(row: EventRow, nowMs: number): boolean {
  return parseInstant(row.end) <= nowMs;
}

/** The row's date is inside the range. */
export function inRange(row: EventRow, range: DateRange): boolean {
  return range.from <= row.date && row.date <= range.to;
}

export interface CategoryHours {
  name: string;
  done: number;
  planned: number;
}
export interface ProjectHours {
  code: string;
  done: number;
  planned: number;
  categories: CategoryHours[];
}
export interface Summary {
  projects: ProjectHours[];
  done: number;
  planned: number;
  /** Hours of rows whose project is not in projects.csv, done and planned together. */
  unknown: number;
}

/** Done and planned hours, added up in seconds. */
function split(rows: EventRow[], nowMs: number): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  for (const r of rows) {
    if (isDone(r, nowMs)) done += rowSeconds(r);
    else planned += rowSeconds(r);
  }
  return { done: secondsToHours(done), planned: secondsToHours(planned) };
}

/** Hours per project and category inside the range. */
export function summarise(rows: EventRow[], range: DateRange, nowMs: number): Summary {
  const inside = rows.filter((r) => inRange(r, range));
  const known = inside.filter((r) => r.known);
  const byProject = new Map<string, EventRow[]>();
  for (const r of known) {
    const list = byProject.get(r.project);
    if (list) list.push(r);
    else byProject.set(r.project, [r]);
  }
  const projects: ProjectHours[] = [];
  for (const [code, list] of byProject) {
    const categories = [...groupCategories(list).values()]
      .map((g) => {
        const s = split(g.rows, nowMs);
        return { name: g.name, ...s };
      })
      .sort((a, b) => {
        if ((a.name === '') !== (b.name === '')) return a.name === '' ? 1 : -1;
        return b.done + b.planned - (a.done + a.planned) || compareText(a.name, b.name);
      });
    const s = split(list, nowMs);
    projects.push({ code, ...s, categories });
  }
  projects.sort((a, b) => b.done + b.planned - (a.done + a.planned) || compareText(a.code, b.code));
  const all = split(known, nowMs);
  const unknown = inside.filter((r) => !r.known).reduce((sum, r) => sum + rowSeconds(r), 0);
  return { projects, ...all, unknown: secondsToHours(unknown) };
}
