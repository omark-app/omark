import { Document, isCollection, isMap, isNode, parseDocument, visit } from 'yaml';
import type { Pair, YAMLMap } from 'yaml';
import type { Path } from './schema.ts';

const MISTAKE = 'config.yaml has a mistake; fix it as text first';

/** Punctuation-only strings and words YAML 1.1 reads as true, false or null (n, yes, off). */
const NEEDS_QUOTES = /^(?:[^A-Za-z0-9]*|y|yes|n|no|on|off|true|false|null|~)$/i;

/** One value as flow YAML: dark, [x1, x2], {b: z}, ['/', 'n']. */
function format(value: unknown): string {
  const doc = new Document(value);
  visit(doc, {
    Scalar(_, node) {
      if (typeof node.value === 'string' && NEEDS_QUOTES.test(node.value)) node.type = 'QUOTE_SINGLE';
    },
  });
  return doc.toString({ collectionStyle: 'flow', flowCollectionPadding: false, singleQuote: true }).trimEnd();
}

function keyName(key: unknown): string {
  return String(isNode(key) ? (key as { value?: unknown }).value : key);
}

function range(node: unknown): [number, number, number] {
  const r = isNode(node) ? node.range : null;
  if (!r) throw new Error('setSetting: a node has no position');
  return r;
}

const nest = (keys: Path, value: unknown): unknown => keys.reduceRight((inner, k) => ({ [k]: inner }), value);

/** What the file should read as after the change; used to check the written text. */
function expected(before: unknown, path: Path, value: unknown): unknown {
  const root = (before ?? {}) as Record<string, unknown>;
  const chain: Record<string, unknown>[] = [root];
  for (const key of path.slice(0, -1)) {
    const parent = chain[chain.length - 1]!;
    let child = parent[key];
    if (child === null || typeof child !== 'object' || Array.isArray(child)) {
      if (value === undefined) return root;
      child = parent[key] = {};
    }
    chain.push(child as Record<string, unknown>);
  }
  const last = path[path.length - 1]!;
  if (value !== undefined) {
    chain[chain.length - 1]![last] = value;
    return root;
  }
  delete chain[chain.length - 1]![last];
  // A map left empty goes too, like the text edit does.
  for (let i = chain.length - 1; i > 0 && Object.keys(chain[i]!).length === 0; i--) delete chain[i - 1]![path[i - 1]!];
  return root;
}

/**
 * Sets one key in config.yaml text, or removes it when `value` is undefined.
 * Every other byte stays as it was: comments, quotes, spacing and line endings.
 */
export function setSetting(text: string, path: Path, value: unknown): string {
  const doc = parseDocument(text);
  const root = doc.contents;
  if (doc.errors.length > 0 || (root !== null && !isMap(root))) throw new Error(MISTAKE);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';

  const lineStart = (pos: number): number => text.lastIndexOf('\n', pos - 1) + 1;
  /** Just past the newline that ends the pair's last line (or the end of the text). */
  const pairEnd = (pair: Pair): number => {
    const end = range(isNode(pair.value) && pair.value.range ? pair.value : pair.key)[1];
    if (text[end - 1] === '\n') return end;
    const nl = text.indexOf('\n', end);
    return nl < 0 ? text.length : nl + 1;
  };
  const blockLines = (keys: Path, v: unknown, indent: number): string =>
    keys
      .map((k, i) => ' '.repeat(indent + 2 * i) + format(k) + ':' + (i === keys.length - 1 ? ` ${format(v)}` : ''))
      .join(eol) + eol;
  const append = (pos: number, lines: string): string => {
    const gap = pos === text.length && text !== '' && !text.endsWith('\n') ? eol : '';
    return text.slice(0, pos) + gap + lines + text.slice(pos);
  };
  const splice = (start: number, end: number, insert: string): string => text.slice(0, start) + insert + text.slice(end);
  /** Writes a flow map in place of `map`. */
  const rewriteFlow = (map: YAMLMap, json: Record<string, unknown>): string => {
    const [start, end] = range(map);
    return splice(start, end, format(json));
  };

  const replace = (pair: Pair, v: unknown): string => {
    const node = pair.value;
    if (isCollection(node) && !node.flow) {
      // A block list or map becomes one flow value on the key's line; a comment on that line stays.
      const keyEnd = range(pair.key)[1];
      const end = range(node)[1];
      const keyLine = text.slice(keyEnd, range(node)[0]).split('\n')[0]!;
      const comment = /[ \t]+#[^\r\n]*/.exec(keyLine)?.[0] ?? '';
      return splice(keyEnd, end, `: ${format(v)}${comment}${text[end - 1] === '\n' ? eol : ''}`);
    }
    const [start, end] = range(node);
    if (start === end) {
      // An empty value (`theme:`, `theme:   # c`): write it right after the colon.
      const colon = text.indexOf(':', range(pair.key)[1]) + 1;
      return splice(colon, colon, ` ${format(v)}`);
    }
    // A block scalar (`|`, `>`) ends past its last newline; keep one.
    return splice(start, end, format(v) + (text[end - 1] === '\n' ? eol : ''));
  };

  // maps[i] holds path[i]; pairs[i] is that key's pair, when present.
  const maps: YAMLMap[] = [];
  const pairs: Pair[] = [];
  let map: YAMLMap | null = root;
  for (const key of path) {
    if (!map) break;
    maps.push(map);
    const pair: Pair | undefined = map.items.find((p) => keyName(p.key) === key);
    if (!pair) break;
    pairs.push(pair);
    map = isMap(pair.value) ? pair.value : null;
  }

  let out: string;
  const d = pairs.length;
  if (value === undefined) {
    if (d < path.length) return text;
    // Removing the last key of a map removes the map's own key too, up to the root.
    let i = d - 1;
    while (i > 0 && maps[i]!.items.length === 1) i--;
    const from = maps[i]!;
    const pair = pairs[i]!;
    if (from.flow) {
      const json = from.toJSON() as Record<string, unknown>;
      delete json[path[i]!];
      out = rewriteFlow(from, json);
    } else {
      out = splice(lineStart(range(pair.key)[0]), pairEnd(pair), '');
    }
  } else if (d === path.length) {
    out = replace(pairs[d - 1]!, value);
  } else if (maps.length === d && d > 0) {
    // The parent is there but holds a plain value, not a map.
    out = replace(pairs[d - 1]!, nest(path.slice(d), value));
  } else if (maps.length === 0) {
    out = append(text.length, blockLines(path, value, 0));
  } else {
    const into = maps[d]!;
    if (into.flow) {
      out = rewriteFlow(into, { ...(into.toJSON() as Record<string, unknown>), ...(nest(path.slice(d), value) as object) });
    } else {
      const first = range(into.items[0]!.key)[0];
      const last = into.items[into.items.length - 1]!;
      out = append(pairEnd(last), blockLines(path.slice(d), value, first - lineStart(first)));
    }
  }

  const check = parseDocument(out);
  const want = JSON.stringify(expected(doc.toJS(), path, value));
  if (check.errors.length > 0 || JSON.stringify(check.toJS() ?? {}) !== want) {
    throw new Error(`setSetting could not write ${path.join('.')} safely`);
  }
  return out;
}
