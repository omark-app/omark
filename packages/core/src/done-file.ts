import type { DoneDoc, DoneEntry, DoneLine, ISODate, RepeatRule, State, Task } from './model.ts';
import { formatRepeat } from './repeat-format.ts';
import { DONE_LINE, parseFields, toLines } from './tasks-file.ts';

/** Parses `done.md`. A line without a valid `- [x] … ✅ date` shape is kept as is with `entry: null`. */
export function parseDone(text: string): DoneDoc {
  const lines = toLines(text).map<DoneLine>((raw) => ({ entry: doneEntry(raw), raw }));
  const doc: DoneDoc = { lines };
  if (lines.length > 0 && !/\n$/.test(text.replace(/\r\n/g, '\n'))) doc.unterminated = true;
  return doc;
}

/** Writes `done.md` with LF line endings; lines are written exactly as read. */
export function serializeDone(doc: DoneDoc): string {
  if (doc.lines.length === 0) return '';
  const text = doc.lines.map((l) => l.raw).join('\n');
  return doc.unterminated ? text : `${text}\n`;
}

/** The canonical line for completing `task` today: `- [x] {title} 🔁 {rule} ✅ {today}`. */
export function doneLine(task: Task, today: ISODate): DoneLine {
  return canonical(task.title, task.repeat, today);
}

/**
 * Moves every `- [x]` item out of the Tasks section into `done.md`. Dated lines are appended unchanged;
 * undated ones (ticked in Obsidian) are written canonically, stamped with `today`. Null when there is nothing to sweep.
 */
export function sweepCompleted(state: State, today: ISODate): State | null {
  const appended: DoneLine[] = [];
  const items = state.doc.items.filter((item) => {
    if (item.kind !== 'done') return true;
    if (item.entry.doneOn === null) {
      appended.push(canonical(item.entry.title, item.entry.repeat, today));
    } else {
      for (const raw of item.raw) appended.push({ entry: doneEntry(raw), raw });
    }
    return false;
  });
  if (appended.length === 0) return null;
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
