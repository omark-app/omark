import { dayOfWeek, addDays } from './dates.ts';
import type { DateChoice } from './buckets.ts';
import type { WeekCtx } from './model.ts';
import { parseFields, ruleSpans } from './tasks-file.ts';

/**
 * Shortcut words typed into a new task's title (issue #19): the 3-letter form or the full word, in any
 * case. Weekdays are 0 = Monday … 6 = Sunday.
 */
const WORDS: readonly [short: string, full: string, kind: ShortcutKind, weekday?: number][] = [
  ['tod', 'today', 'today'],
  ['tom', 'tomorrow', 'tomorrow'],
  ['som', 'someday', 'someday'],
  ['imp', 'important', 'important'],
  ['hab', 'habit', 'habit'],
  ['mon', 'monday', 'weekday', 0],
  ['tue', 'tuesday', 'weekday', 1],
  ['wed', 'wednesday', 'weekday', 2],
  ['thu', 'thursday', 'weekday', 3],
  ['fri', 'friday', 'weekday', 4],
  ['sat', 'saturday', 'weekday', 5],
  ['sun', 'sunday', 'weekday', 6],
];

export type ShortcutKind = 'today' | 'tomorrow' | 'someday' | 'important' | 'habit' | 'weekday';

/** A shortcut word in the text: `text.slice(start, end) === word`. */
export interface ShortcutWord {
  start: number;
  end: number;
  word: string;
  kind: ShortcutKind;
  weekday?: number;
}

/** A word turned back into plain text (Backspace right after it), by where it starts and what it says. */
export interface Dismissed {
  start: number;
  word: string;
}

/** The shortcut words of `text`, in order, leaving out the dismissed ones and words in a typed 🔁 rule. */
export function shortcutWords(text: string, dismissed: readonly Dismissed[] = []): ShortcutWord[] {
  const out: ShortcutWord[] = [];
  const rules = ruleSpans(text);
  for (const m of text.matchAll(/\S+/g)) {
    if (rules.some(([s, e]) => m.index >= s && m.index < e)) continue;
    const word = m[0];
    const lower = word.toLowerCase();
    const hit = WORDS.find(([short, full]) => lower === short || lower === full);
    if (!hit || dismissed.some((d) => d.start === m.index && d.word === word)) continue;
    const [, , kind, weekday] = hit;
    out.push({ start: m.index, end: m.index + word.length, word, kind, ...(weekday !== undefined && { weekday }) });
  }
  return out;
}

export interface QuickAdd {
  /** The title without its shortcut words. */
  title: string;
  /** The last date word's choice; null when none was typed. */
  when: DateChoice | null;
  important: boolean;
  /** The `hab` word was typed (#44); the caller adds the 🌱 and, with no rule typed, `every day`. */
  habit: boolean;
}

/** What adding `text` means: the clean title, the date from the last date word, and the flag. */
export function readQuickAdd(text: string, ctx: WeekCtx, dismissed: readonly Dismissed[] = []): QuickAdd {
  const words = shortcutWords(text, dismissed);
  let when: DateChoice | null = null;
  let important = false;
  let habit = false;
  for (const w of words) {
    if (w.kind === 'important') important = true;
    else if (w.kind === 'habit') habit = true;
    else if (w.kind === 'weekday') when = { date: nextWeekday(w.weekday!, ctx) };
    else when = w.kind;
  }
  // Remove right to left so earlier offsets stay valid; each gap becomes one space.
  let title = text;
  for (const w of [...words].reverse()) {
    title = `${title.slice(0, w.start).trimEnd()} ${title.slice(w.end).trimStart()}`;
  }
  title = title.trim();
  // A 📅 date typed in the title is what the saved line keeps (issue #8), so it wins over a date word.
  const typedDate = parseFields(title, false).date;
  return { title, when: typedDate ? { date: typedDate } : when, important, habit };
}

/** The next `weekday` strictly after today, 1 to 7 days on. */
function nextWeekday(weekday: number, ctx: WeekCtx): string {
  return addDays(ctx.today, (weekday - dayOfWeek(ctx.today) + 7) % 7 || 7);
}

/**
 * The dismissals of `oldText` as they stand in `newText`: kept when the edit is after them (a space or more
 * text after the word), shifted when it is before them, dropped when it touches the word itself.
 */
export function carryDismissed(dismissed: readonly Dismissed[], oldText: string, newText: string): Dismissed[] {
  let p = 0;
  while (p < oldText.length && p < newText.length && oldText[p] === newText[p]) p++;
  let q = 0;
  while (q < oldText.length - p && q < newText.length - p && oldText.at(-1 - q) === newText.at(-1 - q)) q++;
  const editEnd = oldText.length - q;
  const delta = newText.length - oldText.length;
  return dismissed
    .map((d): Dismissed | null => {
      if (p >= d.start + d.word.length) return d;
      if (editEnd <= d.start) return { start: d.start + delta, word: d.word };
      return null;
    })
    .filter((d): d is Dismissed => d !== null && isWordAt(newText, d));
}

function isWordAt(text: string, d: Dismissed): boolean {
  const end = d.start + d.word.length;
  return text.slice(d.start, end) === d.word && !/\S/.test(text.charAt(d.start - 1)) && !/\S/.test(text.charAt(end));
}
