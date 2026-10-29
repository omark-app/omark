// Tag suggestions in quick add (Goals spec 9): `#` offers the project codes and the area tags.

/** The `#tag` being typed at the caret: where its `#` is and what follows it so far; null when none. */
export function tagAtCaret(text: string, caret: number | null): { start: number; query: string } | null {
  if (caret === null) return null;
  const before = text.slice(0, caret);
  const m = /(?:^|[\s([{])#([\p{L}\p{N}_/-]*)$/u.exec(before);
  if (!m) return null;
  // The caret must end the word: `#CLIMB now` with the caret after `now` is not a tag being typed.
  return { start: caret - m[1]!.length - 1, query: m[1]! };
}

const MAX = 6;

/** The tags that start with `query`, ignoring case, in the order given (at most six); the exact tag alone is none. */
export function matchTags(query: string, tags: readonly string[]): string[] {
  const q = query.toLowerCase();
  const hits = tags.filter((t) => t.toLowerCase().startsWith(q));
  if (hits.length === 1 && hits[0]!.toLowerCase() === q) return [];
  return hits.slice(0, MAX);
}

/** `text` with the tag at `at` replaced by `tag`, a space after it, and the caret after that space. */
export function completeTag(text: string, at: { start: number; query: string }, tag: string): { text: string; caret: number } {
  const end = at.start + 1 + at.query.length;
  const rest = text.slice(end);
  const spaced = rest.startsWith(' ') ? rest : ` ${rest}`;
  const head = `${text.slice(0, at.start)}#${tag}`;
  return { text: head + spaced, caret: head.length + 1 };
}
