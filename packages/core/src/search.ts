import type { DoneDoc, DoneEntry, Task } from './model.ts';

/** Text with the `[start, end)` ranges a query matched, sorted and merged, for highlighting. */
export interface Marked {
  text: string;
  marks: [number, number][];
}

/**
 * How well an item matched: 0 every word is in the title, 1 some are, 2 none are (a note-only match).
 * Better tiers sort first.
 */
export type SearchTier = 0 | 1 | 2;

/** `note` is the best matching note line, set only when a word matched outside the title. */
interface Hit {
  tier: SearchTier;
  title: Marked;
  note: Marked | null;
}

export interface TaskHit extends Hit {
  task: Task;
}

/** `index` is the entry's line in `done.md`. */
export interface DoneHit extends Hit {
  entry: DoneEntry;
  index: number;
}

/**
 * A done entry's notes. `DoneEntry` carries none yet; once it has a `notes` field this becomes `e.notes`.
 */
export const doneNotes = (e: DoneEntry): readonly string[] => (e as DoneEntry & { notes?: string[] }).notes ?? [];

/** One character, lowercased with its diacritics stripped. `ł` has no decomposition, so it is mapped by hand. */
const foldChar = (ch: string): string =>
  ch.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');

/** Case- and diacritic-insensitive form of `s`: `Zwłóknienia` → `zwloknienia`. */
export function foldText(s: string): string {
  return fold(s).text;
}

/** The folded text, and for each of its positions (plus its end) the position in `s` it came from. */
function fold(s: string): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  let i = 0;
  for (const ch of s) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) at.push(i);
    text += f;
    i += ch.length;
  }
  at.push(s.length);
  return { text, at };
}

/** The query's distinct words, folded. */
export function queryWords(query: string): string[] {
  return [...new Set(foldText(query).split(/\s+/).filter((w) => w !== ''))];
}

/** Every place one of `words` occurs in `text`, as merged ranges of the original text. */
function mark(text: string, words: readonly string[]): Marked {
  const { text: folded, at } = fold(text);
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + 1)) {
      // End after the whole source character, also when its fold is longer than one character.
      let j = i + w.length;
      while (j < folded.length && at[j] === at[j - 1]) j++;
      ranges.push([at[i]!, at[j]!]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const marks: [number, number][] = [];
  for (const r of ranges) {
    const last = marks[marks.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else marks.push([r[0], r[1]]);
  }
  return { text, marks };
}

/** Matches one item: every word must be in the title or a note. Null when one is in neither. */
function match(title: string, notes: readonly string[], words: readonly string[]): Hit | null {
  if (words.length === 0) return null;
  const t = foldText(title);
  const ns = notes.map(foldText);
  const inTitle = words.filter((w) => t.includes(w));
  if (!words.every((w) => t.includes(w) || ns.some((n) => n.includes(w)))) return null;
  const tier: SearchTier = inTitle.length === words.length ? 0 : inTitle.length > 0 ? 1 : 2;
  let note: Marked | null = null;
  if (tier > 0) {
    // The note line holding the most words (the first one on a tie).
    let best = -1;
    let count = 0;
    ns.forEach((n, i) => {
      const c = words.filter((w) => n.includes(w)).length;
      if (c > count) [best, count] = [i, c];
    });
    note = mark(notes[best]!, words);
  }
  return { tier, title: mark(title, words), note };
}

/**
 * Open tasks matching `query` (spec 9.3): each word, in any order, in the title or the notes. Title
 * matches first, then earliest date (no date last), then the order given. Empty for a blank query.
 */
export function searchTasks(tasks: readonly Task[], query: string): TaskHit[] {
  const words = queryWords(query);
  const hits: TaskHit[] = [];
  for (const task of tasks) {
    const h = match(task.title, task.notes, words);
    if (h) hits.push({ ...h, task });
  }
  return hits.sort((a, b) => a.tier - b.tier || dateOrder(a.task.date, b.task.date));
}

const dateOrder = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);

/** Completions in `done.md` matching `query`, title matches first, then newest first. */
export function searchDone(done: DoneDoc, query: string): DoneHit[] {
  const words = queryWords(query);
  const hits: DoneHit[] = [];
  done.lines.forEach(({ entry }, index) => {
    if (!entry) return;
    const h = match(entry.title, doneNotes(entry), words);
    if (h) hits.push({ ...h, entry, index });
  });
  // done.md is a log, oldest first, so a later line is the newer one on the same day.
  return hits.sort(
    (a, b) => a.tier - b.tier || (b.entry.doneOn ?? '').localeCompare(a.entry.doneOn ?? '') || b.index - a.index,
  );
}

/** `m` cut into plain and marked runs, in order, for rendering. */
export function markedParts(m: Marked): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of m.marks) {
    if (s > pos) parts.push({ text: m.text.slice(pos, s), hit: false });
    parts.push({ text: m.text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < m.text.length) parts.push({ text: m.text.slice(pos), hit: false });
  return parts;
}
