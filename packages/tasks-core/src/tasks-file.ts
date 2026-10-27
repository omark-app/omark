import type { DoneEntry, HabitMark, ISODate, Item, RepeatRule, Task, TasksDoc } from './model.ts';
import { formatRepeat, parseRepeat } from './repeat-format.ts';

let lastId = 0;
const defaultNewId = (): string => `t${++lastId}`;

const ALWAYS_HEADING = /^#[ \t]+always[ \t]*$/i;
const TASKS_HEADING = /^#[ \t]+tasks[ \t]*$/i;
const OPEN_LINE = /^- \[ \](?=[ \t]|$)(.*)$/;
export const DONE_LINE = /^- \[[xX]\](?=[ \t]|$)(.*)$/;
const INDENTED = /^[ \t]+\S/;
const NOTE_MARKER = /^[-*+][ \t]+/;

const DUE = '📅';
const DONE = '✅';
const REPEAT = '🔁';
/** Obsidian Tasks' high priority, which TaskApp reads as Important (issue #19). */
const IMPORTANT = '⏫';
/** The habit mark (#44). */
const HABIT = '🌱';
/** Emoji presentation selector: some editors write it after a field emoji, where it changes nothing. */
const VS16 = '\uFE0F';
/** Where a 🔁 rule's text ends: a ` #tag`, or any Obsidian Tasks field emoji. */
const RULE_END = /[ \t]#[^\s#]|📅|✅|🔁|⏳|🛫|➕|❌|🆔|⛔|🏁|⏫|🔼|🔽|⏬|🔺|🌱|🏆/u;

/** Stable text of a task's semantic fields; equal keys mean nothing the file stores has changed. */
export function taskKey(t: Pick<Task, 'title' | 'notes' | 'date' | 'repeat' | 'important' | 'habit'>): string {
  const key: unknown[] = [t.title, t.notes, t.date, t.repeat ? formatRepeat(t.repeat) : null];
  if (t.important) key.push(true);
  if (t.habit) key.push(`${HABIT}${t.habit.goal ?? ''}`);
  return JSON.stringify(key);
}

/**
 * Parses `tasks.md`. Anything that isn't a `- [ ]` task or a `- [x]` line is kept as raw lines. A file
 * from before #38 may have a `# Always` section above `# Tasks`: each of its `- ` lines (with any indented
 * lines under it as notes) becomes an important task with no date (Important, not urgent), at the top of
 * the items in the same order. `- [ ]` and `- [x]` lines there are read as they are anywhere else. Other
 * non-blank lines, and `- ` lines that are only field text, join the preamble; the heading and blank
 * lines go.
 */
export function parseTasks(text: string, newId: () => string = defaultNewId): TasksDoc {
  const lines = toLines(text);
  const { alwaysAt, tasksAt } = sections(lines);
  const items = tasksAt < 0 && alwaysAt >= 0 ? [] : parseItems(lines.slice(tasksAt + 1), newId);
  if (alwaysAt < 0) return { preamble: tasksAt < 0 ? [] : lines.slice(0, tasksAt), items };

  const section = lines.slice(alwaysAt + 1, tasksAt < 0 ? lines.length : tasksAt);
  const kept: string[] = [];
  const migrated: Item[] = [];
  for (let i = 0; i < section.length; ) {
    if (OPEN_LINE.test(section[i]!) || DONE_LINE.test(section[i]!)) {
      const end = blockEnd(section, i);
      migrated.push(...parseItems(section.slice(i, end), newId));
      i = end;
      continue;
    }
    const entry = alwaysEntry(section[i]!);
    if (entry === null) {
      if (section[i]!.trim() !== '') kept.push(section[i]!);
      i++;
      continue;
    }
    let notesEnd = i + 1;
    while (notesEnd < section.length && INDENTED.test(section[notesEnd]!)) notesEnd++;
    const notes = section.slice(i + 1, notesEnd).map(noteText);
    const task = readBack({ id: newId(), title: entry, notes, date: null, repeat: null, important: true, raw: null, rawKey: null });
    if (task.title === '') kept.push(...section.slice(i, notesEnd));
    else migrated.push({ kind: 'task', task });
    i = notesEnd;
  }
  return { preamble: [...lines.slice(0, alwaysAt), ...kept], items: [...migrated, ...items] };
}

/** Writes `tasks.md` with LF line endings. Unchanged tasks and unknown lines are written exactly as read. */
export function serializeTasks(doc: TasksDoc): string {
  const out = [...doc.preamble, '# Tasks'];
  for (const item of doc.items) {
    if (item.kind === 'raw') out.push(...item.lines);
    else if (item.kind === 'done') out.push(...item.raw);
    else out.push(...taskLines(item.task));
  }
  return out.map((l) => `${l}\n`).join('');
}

/** True when `text` still has the old `# Always` section above `# Tasks` (before #38). */
export function hasAlwaysSection(text: string): boolean {
  return sections(toLines(text)).alwaysAt >= 0;
}

/** Indexes of the old `# Always` heading and the `# Tasks` heading as `parseTasks` reads them; -1 when absent. */
function sections(lines: string[]): { alwaysAt: number; tasksAt: number } {
  const tasksAt = lines.findIndex((l) => TASKS_HEADING.test(l));
  const firstAlways = lines.findIndex((l) => ALWAYS_HEADING.test(l));
  // `# Always` only opens the Always section before `# Tasks`; after it, it's an ordinary raw line.
  const alwaysAt = tasksAt >= 0 && firstAlways > tasksAt ? -1 : firstAlways;
  return { alwaysAt, tasksAt };
}

/** Index of the first line `parseTasks` reads as a Tasks-section item; `lines.length` when there are none. */
export function itemsStart(lines: string[]): number {
  const { alwaysAt, tasksAt } = sections(lines);
  if (tasksAt >= 0) return tasksAt + 1;
  return alwaysAt < 0 ? 0 : lines.length;
}

/**
 * End (exclusive) of the Tasks-section block starting at `lines[i]`, as `parseTasks` groups them: a
 * `- [ ]` or `- [x]` line takes the indented lines after it; any other line is a block of its own.
 */
export function blockEnd(lines: string[], i: number): number {
  const line = lines[i]!;
  if (!OPEN_LINE.test(line) && !DONE_LINE.test(line)) return i + 1;
  let end = i + 1;
  while (end < lines.length && INDENTED.test(lines[end]!)) end++;
  return end;
}

export function toLines(text: string): string[] {
  const s = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (s === '') return [];
  const lines = s.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** The text of a `- ` line in an old `# Always` section; null for any other line. */
function alwaysEntry(line: string): string | null {
  if (!line.startsWith('- ')) return null;
  const text = line.slice(2).trim();
  return text === '' ? null : text;
}

function parseItems(lines: string[], newId: () => string): Item[] {
  const items: Item[] = [];
  const pushRaw = (block: string[]) => {
    const last = items.at(-1);
    if (last?.kind === 'raw') last.lines.push(...block);
    else items.push({ kind: 'raw', lines: [...block] });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = OPEN_LINE.exec(line);
    const done = open ? null : DONE_LINE.exec(line);
    if (!open && !done) {
      pushRaw([line]);
      i++;
      continue;
    }
    const end = blockEnd(lines, i);
    const block = lines.slice(i, end);
    i = end;

    if (open) {
      const f = parseFields(open[1]!, false);
      const task: Task = {
        id: newId(),
        title: f.title,
        notes: block.slice(1).map(noteText),
        date: f.date,
        repeat: f.repeat,
        ...(f.important && { important: true }),
        ...(f.habit && { habit: f.habit }),
        raw: block,
        rawKey: null,
      };
      task.rawKey = taskKey(task);
      items.push({ kind: 'task', task });
    } else {
      // An undated `- [x]` (ticked in Obsidian without a ✅ date) is still done; doneOn is null.
      const f = parseFields(done![1]!, true);
      const notes = block.slice(1).map(noteText);
      const entry: DoneEntry = {
        title: f.title, repeat: f.repeat, doneOn: f.doneOn, notes,
        ...(f.important && { important: true }), ...(f.habit && { habit: f.habit }),
      };
      items.push({ kind: 'done', entry, date: f.date, raw: block });
    }
  }
  return items;
}

/** A note line's text as the app shows it: trimmed, without its `-`, `*` or `+` marker. */
export function noteText(line: string): string {
  return line.trim().replace(NOTE_MARKER, '');
}

/**
 * The lines `serializeTasks` writes for `t`: its raw block while unchanged, else the canonical task line
 * followed by `noteLines(t)`.
 */
export function taskLines(t: Task): string[] {
  if (t.raw && t.rawKey !== null && taskKey(t) === t.rawKey) return t.raw;
  const head = ['- [ ]', t.title];
  if (t.important) head.push(IMPORTANT);
  if (t.habit) head.push(t.habit.goal === null ? HABIT : `${HABIT} ${t.habit.goal}`);
  if (t.repeat) head.push(`${REPEAT} ${formatRepeat(t.repeat)}`);
  if (t.date) head.push(`${DUE} ${t.date}`);
  return [head.filter((p) => p !== '').join(' '), ...noteLines(t)];
}

/**
 * `t` as its task line reads back: the title, 📅 date, 🔁 rule and ⏫ flag `parseTasks` takes from the line
 * `taskLines` writes. Rule or date text typed into a title thus becomes that field, as every other device
 * reads it (issue #8). Returns `t` itself when nothing differs.
 */
export function readBack(t: Task): Task {
  const f = parseFields(OPEN_LINE.exec(taskLines(t)[0]!)![1]!, false);
  const { important: _, habit: __, ...rest } = t;
  const read: Task = {
    ...rest, title: f.title, date: f.date, repeat: f.repeat,
    ...(f.important && { important: true }), ...(f.habit && { habit: f.habit }),
  };
  return taskKey(read) === taskKey(t) ? t : read;
}

/**
 * The note lines of `t`: as read while its notes are unchanged (keeping nesting, tabs and markers), or
 * canonical `    - {note}` lines once they were edited (or for a task the app created).
 */
export function noteLines(t: Task): string[] {
  const raw = t.raw?.slice(1) ?? null;
  const unchanged =
    raw !== null && raw.length === t.notes.length && raw.every((line, i) => noteText(line) === t.notes[i]);
  return unchanged ? raw : t.notes.map((n) => `    - ${n}`);
}

export interface Fields {
  title: string;
  date: ISODate | null;
  repeat: RepeatRule | null;
  doneOn: ISODate | null;
  important: boolean;
  /** The 🌱 field; on a task line only with a usable 🔁 rule, on a done line always. */
  habit: HabitMark | null;
  /** The date after the end mark `parseFields` was given (🏆 or ❌), on done lines. */
  endOn: ISODate | null;
}

/** A 🌱 habit needs a rule that repeats on a schedule; `when done` rules have no periods to count. */
export function isUsableHabitRule(rule: RepeatRule | null): boolean {
  return rule !== null && rule.type !== 'after';
}

/**
 * Pulls the 📅 date, the 🔁 rule, the ⏫ flag and (on done lines) the ✅ date out of a task line's text, wherever
 * they sit. When a field appears more than once, the last valid one wins (as in Obsidian Tasks, which
 * reads fields from the end) and earlier ones stay in the title; this also means a canonical rewrite,
 * which appends the fields, always reads back as written. A 🔁 rule runs to the next ` #tag`, the next
 * field emoji or the end of the line, and is taken only when `parseRepeat` accepts it. Other emoji and
 * tags stay in the title. Every 🌱 is the habit mark, the last `🌱 N` (1–999) giving its goal, but only on a
 * done line or with a usable rule (#44). `endMark` also takes that emoji's date, for habit end lines.
 */
export function parseFields(text: string, isDone: boolean, endMark?: '🏆' | '❌'): Fields {
  const spans: [number, number][] = [];

  const takeDate = (emoji: string): ISODate | null => {
    const re = new RegExp(`${emoji}${VS16}?[ \\t]*(\\d{4}-\\d{2}-\\d{2})(?!\\d)`, 'gu');
    let found: { value: ISODate; span: [number, number] } | null = null;
    for (const m of text.matchAll(re)) {
      if (isRealDate(m[1]!)) found = { value: m[1]!, span: [m.index, m.index + m[0].length] };
    }
    if (!found) return null;
    spans.push(found.span);
    return found.value;
  };

  const date = takeDate(DUE);
  const doneOn = isDone ? takeDate(DONE) : null;
  const endOn = isDone && endMark ? takeDate(endMark) : null;

  let rule: { value: RepeatRule; span: [number, number] } | null = null;
  for (let at = text.indexOf(REPEAT); at >= 0; at = text.indexOf(REPEAT, at + REPEAT.length)) {
    const from = at + REPEAT.length + (text.startsWith(VS16, at + REPEAT.length) ? VS16.length : 0);
    const stop = RULE_END.exec(text.slice(from));
    const end = stop ? from + stop.index : text.length;
    const value = parseRepeat(text.slice(from, end));
    if (value) rule = { value, span: [at, end] };
  }
  if (rule) spans.push(rule.span);
  const repeat = rule?.value ?? null;

  // Every ⏫ is the flag (it has no value for a later one to win over), so clearing it leaves none behind.
  let important = false;
  for (let at = text.indexOf(IMPORTANT); at >= 0; at = text.indexOf(IMPORTANT, at + IMPORTANT.length)) {
    important = true;
    const end = at + IMPORTANT.length;
    spans.push([at, text.startsWith(VS16, end) ? end + VS16.length : end]);
  }

  let habit: HabitMark | null = null;
  if (isDone || isUsableHabitRule(repeat)) {
    for (let at = text.indexOf(HABIT); at >= 0; at = text.indexOf(HABIT, at + HABIT.length)) {
      habit ??= { goal: null };
      let end = at + HABIT.length;
      if (text.startsWith(VS16, end)) end += VS16.length;
      const goal = /^[ \t]*(\d{1,3})(?!\d)/.exec(text.slice(end));
      if (goal && Number(goal[1]) >= 1) {
        habit = { goal: Number(goal[1]) };
        end += goal[0].length;
      }
      spans.push([at, end]);
    }
  }

  // Remove right to left so earlier offsets stay valid; each gap becomes one space.
  let title = text;
  for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) {
    title = `${title.slice(0, s).trimEnd()} ${title.slice(e).trimStart()}`;
  }
  return { title: title.trim(), date, repeat, doneOn, important, habit, endOn };
}

/** Where 🔁 rule text runs in `text`: from each 🔁 to the next ` #tag`, field emoji or the end. */
export function ruleSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (let at = text.indexOf(REPEAT); at >= 0; at = text.indexOf(REPEAT, at + REPEAT.length)) {
    const from = at + REPEAT.length;
    const stop = RULE_END.exec(text.slice(from));
    spans.push([at, stop ? from + stop.index : text.length]);
  }
  return spans;
}

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
