// Tag suggestions in quick add (Goals spec 9): `#` offers the project codes and the area tags.

const TAG_CHAR = /[\p{L}\p{N}_/-]/u;

/** The `#tag` being typed at the caret, which must end it: where its `#` is and what follows so far; null when none. */
export function tagAtCaret(text: string, caret: number | null): { start: number; query: string } | null {
  if (caret === null) return null;
  // The caret in the middle of a word (`#CL|IMB`) is not a tag being typed.
  if (TAG_CHAR.test(text.charAt(caret))) return null;
  const m = /(?:^|[\s([{])#([\p{L}\p{N}_/-]*)$/u.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[1]!.length - 1, query: m[1]! };
}

const MAX = 6;

/**
 * The tags that start with `query`, ignoring case, in the order given, each once (at most six). None when the query
 * already is a tag, so Enter adds the task rather than turn `#home` into a longer `#HOMELAB`.
 */
export function matchTags(query: string, tags: readonly string[]): string[] {
  const q = query.toLowerCase();
  if (tags.some((t) => t.toLowerCase() === q)) return [];
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (t === '' || !key.startsWith(q) || seen.has(key)) continue;
    seen.add(key);
    hits.push(t);
  }
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
