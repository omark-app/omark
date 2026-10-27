/** A piece of a title or note: plain text, or a link to open (`href` is always http or https). */
export interface LinkPart {
  text: string;
  href?: string;
}

// A Markdown link `[label](https://…)`, a bare `http(s)://…` link, or a bare `www.…` one. A bare link
// starts a word, so `ftp://www.…` and `me@www.…` are not links.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)|(?<![^\s([{<*_`'"])(?:https?:\/\/|www\.)[^\s<>]+/gi;

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * Cuts trailing punctuation and Markdown marks, and closing brackets that have no opening one inside the
 * link (so `(https://x.com/a)` keeps the bracket out, `…/Foo_(bar)` keeps it in).
 */
function trimEnd(url: string): string {
  for (;;) {
    const last = url.at(-1);
    if (last === undefined) return url;
    const open = PAIRS[last];
    if (open !== undefined ? url.split(open).length < url.split(last).length : '.,;:!?\'"*_`…>，。、；：！？'.includes(last)) {
      url = url.slice(0, -1);
    } else return url;
  }
}

/** Splits text into plain parts and links, for showing it with the links clickable. */
export function linkParts(text: string): LinkPart[] {
  const out: LinkPart[] = [];
  let at = 0;
  const plain = (end: number) => {
    if (end > at) out.push({ text: text.slice(at, end) });
  };
  for (const m of text.matchAll(LINK)) {
    let part: LinkPart;
    let end: number;
    if (m[1] !== undefined) {
      part = { text: m[1], href: m[2]! };
      end = m.index + m[0].length;
    } else {
      const url = trimEnd(m[0]);
      if (!/^(https?:\/\/|www\.)[^./]/i.test(url)) continue;
      part = { text: url, href: /^www\./i.test(url) ? `https://${url}` : url };
      end = m.index + url.length;
    }
    plain(m.index);
    out.push(part);
    at = end;
  }
  plain(text.length);
  return out;
}

/** The text as shown, with each Markdown link by its label (e.g. for a screen reader's label). */
export function linkText(text: string): string {
  return linkParts(text)
    .map((p) => p.text)
    .join('');
}

/** The links in text, each href once, in order. */
export function findLinks(text: string): Required<LinkPart>[] {
  const seen = new Set<string>();
  const out: Required<LinkPart>[] = [];
  for (const p of linkParts(text)) {
    if (p.href === undefined || seen.has(p.href)) continue;
    seen.add(p.href);
    out.push({ text: p.text, href: p.href });
  }
  return out;
}
