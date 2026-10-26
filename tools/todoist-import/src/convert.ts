import { formatRepeat, parseRepeat, serializeTasks } from '@omark/tasks-core';
import type { ISODate, Item, RepeatRule, TasksDoc } from '@omark/tasks-core';

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  parent_id: string | null;
  due: { date: string; string: string; is_recurring: boolean } | null;
}

/** 0 = Monday … 6 = Sunday, as in core's RepeatRule. */
const DAYS: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};

/** A trailing time of day (`at 7am`, `at 6:00 pm`, `at 18:00`); TaskApp has no times. */
const TIME = /\s+at\s+\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?$/i;

/** `{ n }` for an interval above 1, else nothing: N = 1 is the plain weekly / monthly rule. */
const interval = (n: number): { n?: number } => (n > 1 ? { n } : {});

/** `mon, thu` / `Monday and Thursday` as sorted day numbers, or null if any name is not a day. */
function parseDays(list: string): number[] | null {
  const days = list.split(/\s*(?:,|\band\b|&)\s*/).map((n) => DAYS[n]);
  if (days.length === 0 || days.some((d) => d === undefined)) return null;
  return [...new Set(days as number[])].sort((a, b) => a - b);
}

function parseRule(raw: string, date: ISODate | null): RepeatRule | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'every day') return { type: 'daily' };
  if (s === 'every weekday' || s === 'every workday') return { type: 'weekdays' };
  if (s === 'every year') return { type: 'yearly' };
  if (s === 'every week' && date) {
    return { type: 'weekly', days: [(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] };
  }
  if (s === 'every month' && date) return { type: 'monthly', day: Number(date.slice(8, 10)) };
  let m = /^every! (?:(\d+) )?days?$/.exec(s);
  if (m) return { type: 'after', n: Number(m[1] ?? 1) };
  m = /^every (\d+) (day|week|month)s?$/.exec(s);
  if (m && Number(m[1]) >= 1) {
    return { type: 'every', n: Number(m[1]), unit: `${m[2] as 'day' | 'week' | 'month'}s` };
  }
  // `every 2 weeks fri`, `every 2 weeks on mon, thu`, `every week on fri`.
  m = /^every (?:(\d+) )?weeks? (?:on )?(.+)$/.exec(s);
  if (m && Number(m[1] ?? 1) >= 1) {
    const days = parseDays(m[2]!);
    if (days) return { type: 'weekly', days, ...interval(Number(m[1] ?? 1)) };
  }
  // `every 3 months on the 18th` or `every 18th every 3 months`.
  const onThe = /^every (\d+) months? on the (\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
  const nthEvery = /^every (\d{1,2})(?:st|nd|rd|th)? every (\d+) months?$/.exec(s);
  const [n, day] = onThe ? [onThe[1], onThe[2]] : nthEvery ? [nthEvery[2], nthEvery[1]] : [];
  if (n !== undefined && day !== undefined && Number(n) >= 1 && Number(day) >= 1 && Number(day) <= 31) {
    return { type: 'monthly', day: Number(day), ...interval(Number(n)) };
  }
  m = /^every (\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) return { type: 'monthly', day: Number(m[1]) };
  m = /^every (.+)$/.exec(s);
  if (m) {
    const days = parseDays(m[1]!);
    if (days) return { type: 'weekly', days };
  }
  return null;
}

export function convertDue(
  due: TodoistTask['due'],
): { date: ISODate | null; repeat: RepeatRule | null; warning: string | null } {
  if (!due) return { date: null, repeat: null, warning: null };
  const date = /^\d{4}-\d{2}-\d{2}/.test(due.date) ? due.date.slice(0, 10) : null;
  if (!due.is_recurring) return { date, repeat: null, warning: null };
  const text = due.string.trim().replace(/\s+/g, ' ');
  const time = TIME.exec(text);
  const rule = parseRule(time ? text.slice(0, time.index) : text, date);
  // Only rules the app reads back (e.g. N within MAX_INTERVAL); anything else would be title text.
  const repeat = rule && parseRepeat(formatRepeat(rule)) ? rule : null;
  let warning: string | null = null;
  if (!repeat) warning = `unsupported repeat "${due.string}" (date kept, no repeat)`;
  else if (time) warning = `time "${time[0].trim()}" dropped from repeat "${due.string}" (TaskApp has no times)`;
  return { date, repeat, warning };
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function buildTasksMd(tasks: TodoistTask[]): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const ids = new Set(tasks.map((t) => t.id));
  const children = new Map<string, TodoistTask[]>();
  const roots: TodoistTask[] = [];
  for (const t of tasks) {
    if (t.parent_id !== null && t.parent_id !== t.id && ids.has(t.parent_id)) {
      children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t]);
    } else {
      roots.push(t);
    }
  }
  const seen = new Set<string>();
  /** Depth-first descendants in Todoist order; `seen` also guards against parent cycles. */
  const descendants = (t: TodoistTask): TodoistTask[] =>
    (children.get(t.id) ?? []).flatMap((c) => (seen.has(c.id) ? [] : (seen.add(c.id), [c, ...descendants(c)])));
  const items: Item[] = [];
  const build = (t: TodoistTask): void => {
    seen.add(t.id);
    const { date, repeat, warning } = convertDue(t.due);
    if (warning) warnings.push(`"${oneLine(t.content)}": ${warning}`);
    const subs = descendants(t);
    for (const s of subs) {
      if (s.description.trim() !== '' || s.due !== null) {
        warnings.push(`"${oneLine(s.content)}": subtask became a note under "${oneLine(t.content)}"; its description and due date were dropped`);
      }
    }
    const notes = [
      ...t.description.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== ''),
      ...subs.map((s) => oneLine(s.content)),
    ];
    items.push({
      kind: 'task',
      task: { id: `i${items.length + 1}`, title: oneLine(t.content), notes, date, repeat, raw: null, rawKey: null },
    });
  };
  for (const t of roots) build(t);
  // Members of a parent cycle have no root above them; keep them as top-level tasks.
  for (const t of tasks) if (!seen.has(t.id)) build(t);
  const doc: TasksDoc = { preamble: [], items };
  return { text: serializeTasks(doc), warnings };
}
