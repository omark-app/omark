import type { DoneDoc, DoneEntry, DoneLine, HabitEnd, HabitMark, ISODate, Item, RepeatRule, State, Task } from './model.ts';
import { nextDate } from './recurrence.ts';
import { formatRepeat } from './repeat-format.ts';
import { blockEnd, DONE_LINE, isUsableHabitRule, noteLines, noteText, parseFields, toLines } from './tasks-file.ts';

const DROPPED_LINE = /^- \[-\](?=[ \t]|$)(.*)$/;

let lastId = 0;
const defaultNewId = (): string => `s${++lastId}`;

/**
 * Parses `done.md`. A line without a valid `- [x] … ✅ date` shape is kept as is with `entry: null`. The
 * indented lines under a done line are its notes: each stays a line of its own (entry null, never counted)
 * and their text is also on the entry's `notes`.
 */
export function parseDone(text: string): DoneDoc {
  const all = toLines(text);
  const lines: DoneLine[] = [];
  for (let i = 0; i < all.length; ) {
    const end = blockEnd(all, i);
    lines.push(...doneBlock(all.slice(i, end)));
    i = end;
  }
  return { lines };
}

/** Writes `done.md` with LF line endings and exactly one final newline (empty doc gives ''). */
export function serializeDone(doc: DoneDoc): string {
  if (doc.lines.length === 0) return '';
  const text = doc.lines.map((l) => l.raw).join('\n');
  return `${text}\n`;
}

/**
 * The canonical line for completing `task` today: `- [x] {title} 🔁 {rule} ✅ {today}`, with ⏫ and 🌱 (never
 * its goal) after the title. Its entry has the task's notes.
 */
export function doneLine(task: Task, today: ISODate): DoneLine {
  return canonical(task.title, task.repeat, today, task.notes, task.important === true, task.habit ? { goal: null } : null);
}

/** The habit end `line` is (#44), or null: a `- [x]` 🌱 line with a 🏆 date and no ✅, or a `- [-]` 🌱 line with a ❌ date. */
export function habitEnd(line: string): HabitEnd | null {
  const x = DONE_LINE.exec(line);
  const m = x ?? DROPPED_LINE.exec(line);
  if (!m) return null;
  const f = parseFields(m[1]!, true, x ? '🏆' : '❌');
  if (!f.habit || f.endOn === null || (x && f.doneOn !== null)) return null;
  return { kind: x ? 'formed' : 'dropped', title: f.title, on: f.endOn };
}

/** The line for a habit formed on `on`: `- [x] {title} 🌱 🏆 {on}`. */
export function formedLine(title: string, on: ISODate): DoneLine {
  return { entry: null, end: { kind: 'formed', title, on }, raw: `- [x] ${title} 🌱 🏆 ${on}` };
}

/** The line for a habit dropped on `on`: `- [-] {title} 🌱 ❌ {on}`. */
export function droppedLine(title: string, on: ISODate): DoneLine {
  return { entry: null, end: { kind: 'dropped', title, on }, raw: `- [-] ${title} 🌱 ❌ ${on}` };
}

/** What completing `task` today appends to `done.md`: `doneLine`, then the note lines `serializeTasks` writes for it. */
export function doneLines(task: Task, today: ISODate): DoneLine[] {
  return [doneLine(task, today), ...noteLines(task).map((raw) => ({ entry: null, raw }))];
}

/**
 * Moves every `- [x]` item out of the Tasks section into `done.md`, notes and all. Dated blocks are appended
 * unchanged (with Obsidian Tasks, which stamps the ✅ date, the next occurrence is already its own `- [ ]`
 * line); so is a habit end line (#44). Undated ones (ticked without the plugin) are written canonically, stamped with `today`, with their
 * note lines as read; a repeating one also stays where it is as an open task (same title, rule and notes)
 * on its next date, as if completed in the app. Null when there is nothing to sweep.
 */
export function sweepCompleted(state: State, today: ISODate, newId: () => string = defaultNewId): State | null {
  const appended: DoneLine[] = [];
  let swept = false;
  const items = state.doc.items.flatMap((item): Item[] => {
    if (item.kind !== 'done') return [item];
    swept = true;
    if (item.entry.doneOn !== null || habitEnd(item.raw[0]!)) {
      appended.push(...doneBlock(item.raw));
      return [];
    }
    const notes = item.raw.slice(1);
    appended.push(canonical(
      item.entry.title, item.entry.repeat, today, notes.map(noteText), item.entry.important === true,
      item.entry.habit ? { goal: null } : null,
    ));
    for (const raw of notes) appended.push({ entry: null, raw });
    if (!item.entry.repeat) return [];
    const task: Task = {
      id: newId(),
      title: item.entry.title,
      notes: notes.map(noteText),
      date: nextDate(item.entry.repeat, item.date, today),
      repeat: item.entry.repeat,
      ...(item.entry.important && { important: true }),
      ...(item.entry.habit && isUsableHabitRule(item.entry.repeat) && { habit: item.entry.habit }),
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

function canonical(
  title: string, repeat: RepeatRule | null, doneOn: ISODate, notes: string[], important: boolean,
  habit: HabitMark | null,
): DoneLine {
  const parts = ['- [x]', title];
  if (important) parts.push('⏫');
  if (habit) parts.push('🌱');
  if (repeat) parts.push(`🔁 ${formatRepeat(repeat)}`);
  parts.push(`✅ ${doneOn}`);
  const entry: DoneEntry = { title, repeat, doneOn, notes: [...notes], ...(important && { important: true }), ...(habit && { habit }) };
  return { entry, raw: parts.filter((p) => p !== '').join(' ') };
}

/** The lines of one `blockEnd` block of `done.md`; only the first can carry an entry. */
function doneBlock(block: string[]): DoneLine[] {
  const [head, ...rest] = block as [string, ...string[]];
  const end = habitEnd(head);
  return [{ entry: doneEntry(head, rest), ...(end && { end }), raw: head }, ...rest.map((raw) => ({ entry: null, raw }))];
}

function doneEntry(raw: string, noteRaw: string[]): DoneEntry | null {
  const m = DONE_LINE.exec(raw);
  if (!m) return null;
  const f = parseFields(m[1]!, true);
  if (f.doneOn === null) return null;
  return { title: f.title, repeat: f.repeat, doneOn: f.doneOn, notes: noteRaw.map(noteText),
    ...(f.important && { important: true }), ...(f.habit && { habit: f.habit }),
  };
}
