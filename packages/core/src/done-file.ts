import type { DoneDoc, DoneEntry, DoneLine, ISODate, Item, RepeatRule, State, Task } from './model.ts';
import { nextDate } from './recurrence.ts';
import { formatRepeat } from './repeat-format.ts';
import { DONE_LINE, noteText, parseFields, toLines } from './tasks-file.ts';

let lastId = 0;
const defaultNewId = (): string => `s${++lastId}`;

/** Parses `done.md`. A line without a valid `- [x] … ✅ date` shape is kept as is with `entry: null`. */
export function parseDone(text: string): DoneDoc {
  const lines = toLines(text).map<DoneLine>((raw) => ({ entry: doneEntry(raw), raw }));
  return { lines };
}

/** Writes `done.md` with LF line endings and exactly one final newline (empty doc gives ''). */
export function serializeDone(doc: DoneDoc): string {
  if (doc.lines.length === 0) return '';
  const text = doc.lines.map((l) => l.raw).join('\n');
  return `${text}\n`;
}

/** The canonical line for completing `task` today: `- [x] {title} 🔁 {rule} ✅ {today}`. */
export function doneLine(task: Task, today: ISODate): DoneLine {
  return canonical(task.title, task.repeat, today);
}

/**
 * Moves every `- [x]` item out of the Tasks section into `done.md`. Dated lines are appended unchanged
 * (with Obsidian Tasks, which stamps the ✅ date, the next occurrence is already its own `- [ ]` line).
 * Undated ones (ticked without the plugin) are written canonically, stamped with `today`; a non-repeating
 * one takes its notes along, while a repeating one stays where it is as an open task (same title, rule and
 * notes) on its next date, as if completed in the app. Null when there is nothing to sweep.
 */
export function sweepCompleted(state: State, today: ISODate, newId: () => string = defaultNewId): State | null {
  const appended: DoneLine[] = [];
  let swept = false;
  const items = state.doc.items.flatMap((item): Item[] => {
    if (item.kind !== 'done') return [item];
    swept = true;
    if (item.entry.doneOn !== null) {
      for (const raw of item.raw) appended.push({ entry: doneEntry(raw), raw });
      return [];
    }
    appended.push(canonical(item.entry.title, item.entry.repeat, today));
    if (!item.entry.repeat) {
      for (const raw of item.raw.slice(1)) appended.push({ entry: doneEntry(raw), raw });
      return [];
    }
    const task: Task = {
      id: newId(),
      title: item.entry.title,
      notes: item.raw.slice(1).map(noteText),
      date: nextDate(item.entry.repeat, item.date, today),
      repeat: item.entry.repeat,
      raw: item.raw,
      rawKey: null,
    };
    return [{ kind: 'task', task }];
  });
  if (!swept) return null;
  return {
    doc: { ...state.doc, items },
    done: { lines: [...state.done.lines, ...appended] },
  };
}

function canonical(title: string, repeat: RepeatRule | null, doneOn: ISODate): DoneLine {
  const parts = ['- [x]', title];
  if (repeat) parts.push(`🔁 ${formatRepeat(repeat)}`);
  parts.push(`✅ ${doneOn}`);
  const entry: DoneEntry = { title, repeat, doneOn };
  return { entry, raw: parts.filter((p) => p !== '').join(' ') };
}

function doneEntry(raw: string): DoneEntry | null {
  const m = DONE_LINE.exec(raw);
  if (!m) return null;
  const f = parseFields(m[1]!, true);
  return f.doneOn === null ? null : { title: f.title, repeat: f.repeat, doneOn: f.doneOn };
}
