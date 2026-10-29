// Links and last activity per area, and "Needs update" (Goals spec 6).
import { areas } from './goals-file.ts';
import type { Area, GoalsDoc, ISODate } from './model.ts';
import { monthsBefore } from './syntax.ts';
import { titleTags } from './tags.ts';

/** A completion from `done.md`; tasks-core's `DoneEntry` fits. */
export interface DoneInput {
  title: string;
  doneOn: ISODate | null;
}

/** An open task or habit from `tasks.md`; tasks-core's `Task` fits. */
export interface OpenInput {
  title: string;
}

/** A row from `events-*.csv`; time-core's `EventRow` fits. */
export interface RowInput {
  date: string;
  project: string;
  known: boolean;
}

export interface ActivityInput {
  done?: readonly DoneInput[];
  open?: readonly OpenInput[];
  rows?: readonly RowInput[];
  today: ISODate;
  /** Goals' `stale_after`, in months. */
  staleAfter: number;
}

export interface AreaActivity {
  tag: string | null;
  /** The project codes on the area's goals, upper case, in file order. */
  codes: string[];
  /** The latest linked date up to today, or null. */
  lastActivity: ISODate | null;
  /** Anything links to the area: a goal, or a task, habit or completion with its tag. */
  linked: boolean;
  needsUpdate: boolean;
}

/** The project codes on an area's goals, upper case, without repeats. */
export function areaCodes(area: Area): string[] {
  return [...new Set(area.goals.flatMap((g) => (g.code ? [g.code.toUpperCase()] : [])))];
}

/** Whether a task title links to `area`: it has the area's tag or a code on the area's goals, ignoring case. */
export function linksArea(title: string, area: Area): boolean {
  return hasAny(title, keysOf(area));
}

/** One result per area, in file order. */
export function areaActivity(doc: GoalsDoc, input: ActivityInput): AreaActivity[] {
  const { today } = input;
  const done = (input.done ?? []).map((d) => ({ on: d.doneOn, tags: lowerTags(d.title) }));
  const open = (input.open ?? []).map((t) => lowerTags(t.title));
  const rows = input.rows ?? [];
  const cutoff = monthsBefore(today, input.staleAfter);
  return areas(doc).map((area) => {
    const tag = area.tag?.toLowerCase() ?? null;
    const codes = areaCodes(area);
    const keys = keysOf(area);
    let last: ISODate | null = null;
    const see = (d: ISODate | null) => {
      if (d !== null && d <= today && (last === null || d > last)) last = d;
    };
    for (const g of area.goals) {
      see(g.setOn);
      see(g.changedOn);
      if (g.achieved) see(g.doneOn);
    }
    for (const d of done) if (d.tags.some((t) => keys.has(t))) see(d.on);
    for (const r of rows) if (r.known && codes.includes(r.project.toUpperCase())) see(r.date);
    const linked = area.goals.length > 0
      || (tag !== null && (open.some((t) => t.includes(tag)) || done.some((d) => d.tags.includes(tag))));
    const lastActivity = last as ISODate | null;
    return { tag: area.tag, codes, lastActivity, linked, needsUpdate: linked && (lastActivity === null || lastActivity < cutoff) };
  });
}

const lowerTags = (title: string): string[] => titleTags(title).map((t) => t.toLowerCase());

function keysOf(area: Area): Set<string> {
  const keys = new Set(areaCodes(area).map((c) => c.toLowerCase()));
  if (area.tag) keys.add(area.tag.toLowerCase());
  return keys;
}

const hasAny = (title: string, keys: Set<string>): boolean => lowerTags(title).some((t) => keys.has(t));
