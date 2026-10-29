// The small pieces of syntax several modules share: dates, tags and project codes.
import type { ISODate } from './model.ts';

const DATE_AFTER = /^[ \t]*(\d{4}-\d{2}-\d{2})(?!\d)/;
export const VS16 = '️';

export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
}

export function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `today` moved back `n` calendar months, on the same day or the month's last. */
export function monthsBefore(today: ISODate, n: number): ISODate {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) - n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(d, daysIn(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The last valid date after `sign` in `text` and the span it takes, or null. Each sign is found with
 * indexOf and only the date after it with a regex, so no regex holds an emoji (as in tasks-core, #79).
 */
export function dateAfter(text: string, sign: string): { value: ISODate; span: [number, number] } | null {
  let found: { value: ISODate; span: [number, number] } | null = null;
  for (let at = text.indexOf(sign); at >= 0; at = text.indexOf(sign, at + sign.length)) {
    const from = at + sign.length + (text.startsWith(VS16, at + sign.length) ? VS16.length : 0);
    const m = DATE_AFTER.exec(text.slice(from));
    if (m && isRealDate(m[1]!)) found = { value: m[1]!, span: [at, from + m[0].length] };
  }
  return found;
}

/** A `#tag` that starts a word (after a space or an opening bracket), as Obsidian reads tags. */
export const TAG = /(?<![^\s([{])#([\p{L}\p{N}_/-]+)/gu;

/** Obsidian needs a tag to have something other than digits. */
export const notOnlyDigits = (tag: string): boolean => /[^\p{N}]/u.test(tag);

/** A project code as O.Time writes it (time-core's CODE_PATTERN), in upper case, as goals carry it. */
export const isCodeTag = (tag: string): boolean => /^[A-Za-z][A-Za-z0-9_]{1,19}$/.test(tag) && tag === tag.toUpperCase();

/** Text on one line: whitespace runs become one space, trimmed. */
export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
