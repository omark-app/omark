/** A piece of a title or note: plain text, or a link to open (`href` is always http or https). */
export interface LinkPart {
  text: string;
  href?: string;
}

// A Markdown link `[label](https://…)`, a bare `http(s)://…` link, or a bare `www.…` one.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)|\b(?:https?:\/\/|www\.)[^\s<>]+/gi;

/** Cuts trailing punctuation and closing brackets that have no opening one inside the link. */
function trimEnd(url: string): string {
  for (;;) {
    const last = url.at(-1);
    if (last === undefined) return url;
    if ('.,;:!?\'"'.includes(last)) url = url.slice(0, -1);
    else if (last === ')' && url.split('(').length < url.split(')').length) url = url.slice(0, -1);
    else return url;
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
