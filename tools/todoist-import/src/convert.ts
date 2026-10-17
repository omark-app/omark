import { serializeTasks } from '@taskapp/core';
import type { ISODate, Item, RepeatRule, TasksDoc } from '@taskapp/core';

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

function parseRule(raw: string): RepeatRule | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'every day') return { type: 'daily' };
  if (s === 'every weekday' || s === 'every workday') return { type: 'weekdays' };
  if (s === 'every year') return { type: 'yearly' };
  let m = /^every! (?:(\d+) )?days?$/.exec(s);
  if (m) return { type: 'after', n: Number(m[1] ?? 1) };
  m = /^every (\d+) (days?|weeks?)$/.exec(s);
  if (m && Number(m[1]) >= 1) {
    return { type: 'every', n: Number(m[1]), unit: m[2]!.startsWith('day') ? 'days' : 'weeks' };
  }
  m = /^every (\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) return { type: 'monthly', day: Number(m[1]) };
  m = /^every (.+)$/.exec(s);
  if (m) {
    const days = m[1]!.split(/\s*(?:,|\band\b|&)\s*/).map((n) => DAYS[n]);
    if (days.length > 0 && days.every((d) => d !== undefined)) {
      return { type: 'weekly', days: [...new Set(days as number[])].sort((a, b) => a - b) };
    }
  }
  return null;
}

export function convertDue(
  due: TodoistTask['due'],
): { date: ISODate | null; repeat: RepeatRule | null; warning: string | null } {
  if (!due) return { date: null, repeat: null, warning: null };
  const date = /^\d{4}-\d{2}-\d{2}/.test(due.date) ? due.date.slice(0, 10) : null;
  if (!due.is_recurring) return { date, repeat: null, warning: null };
  const repeat = parseRule(due.string);
  return {
    date,
    repeat,
    warning: repeat ? null : `unsupported repeat "${due.string}" (date kept, no repeat)`,
  };
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function buildTasksMd(tasks: TodoistTask[]): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const ids = new Set(tasks.map((t) => t.id));
  const isSub = (t: TodoistTask): boolean => t.parent_id !== null && ids.has(t.parent_id);
  const subs = new Map<string, TodoistTask[]>();
  for (const t of tasks) {
    if (isSub(t)) subs.set(t.parent_id!, [...(subs.get(t.parent_id!) ?? []), t]);
  }
  const items: Item[] = [];
  let n = 0;
  for (const t of tasks) {
    if (isSub(t)) continue;
    const { date, repeat, warning } = convertDue(t.due);
    if (warning) warnings.push(`"${oneLine(t.content)}": ${warning}`);
    const notes = [
      ...t.description.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== ''),
      ...(subs.get(t.id) ?? []).map((s) => oneLine(s.content)),
    ];
    items.push({
      kind: 'task',
      task: { id: `i${++n}`, title: oneLine(t.content), notes, date, repeat, raw: null, rawKey: null },
    });
  }
  const doc: TasksDoc = { preamble: [], always: [], items, alwaysRaw: null };
  return { text: serializeTasks(doc), warnings };
}
