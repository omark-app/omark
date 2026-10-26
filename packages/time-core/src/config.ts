import { isMap, isNode, isScalar, LineCounter, parseDocument } from 'yaml';
import type { Problem } from './projects.ts';

export type WeekStart = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface TimeConfig {
  /** Google calendar ids to read. */
  calendars: string[];
  /** First day that counts, YYYY-MM-DD. */
  trackFrom: string;
  /** Hours an all-day event counts for. */
  allDayHours: number;
  weekStart: WeekStart;
  colourEvents: boolean;
}

const DAYS: readonly WeekStart[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const KEYS = {
  calendars: 'calendars',
  trackFrom: 'track_from',
  allDayHours: 'all_day_hours',
  weekStart: 'week_start',
  colourEvents: 'colour_events',
} as const satisfies Record<keyof TimeConfig, string>;

const MESSAGES = {
  calendars: 'calendars must be a list of calendar ids',
  trackFrom: 'track_from must be a date (YYYY-MM-DD)',
  allDayHours: 'all_day_hours must be a number from 0.25 to 24',
  weekStart: 'week_start must be a day of the week, like monday',
  colourEvents: 'colour_events must be true or false',
} as const satisfies Record<keyof TimeConfig, string>;

function firstOfYear(today: string): string {
  return `${today.slice(0, 4)}-01-01`;
}

export function defaultTimeConfig(today: string): TimeConfig {
  return {
    calendars: ['primary'],
    trackFrom: firstOfYear(today),
    allDayHours: 8,
    weekStart: 'monday',
    colourEvents: false,
  };
}

/** The commented file of spec 7.2, with `track_from` set to 1 January of this year. */
export function defaultTimeConfigText(today: string): string {
  return `calendars: [primary]   # Google calendar ids to read
track_from: ${firstOfYear(today)} # first day that counts
all_day_hours: 8
week_start: monday
colour_events: false  # set by the "Colour my events" setting
`;
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Returns the value, or null when it is not valid. */
function readValue<K extends keyof TimeConfig>(key: K, raw: unknown): TimeConfig[K] | null {
  const value = readAny(key, raw);
  return value as TimeConfig[K] | null;
}

function readAny(key: keyof TimeConfig, raw: unknown): unknown {
  switch (key) {
    case 'calendars': {
      const list = typeof raw === 'string' ? [raw] : raw;
      const ok = Array.isArray(list) && list.length > 0 && list.every((c) => typeof c === 'string' && c !== '');
      return ok ? list : null;
    }
    case 'trackFrom': {
      // YAML 1.2 reads a date as a string; a YAML 1.1 reader would give a Date.
      const s = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw;
      return typeof s === 'string' && isRealDate(s) ? s : null;
    }
    case 'allDayHours':
      return typeof raw === 'number' && raw >= 0.25 && raw <= 24 ? raw : null;
    case 'weekStart': {
      const day = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return (DAYS as readonly string[]).includes(day) ? day : null;
    }
    case 'colourEvents':
      return typeof raw === 'boolean' ? raw : null;
  }
}

/** Never throws: bad values fall back to the default and are reported with their line. */
export function parseTimeConfig(text: string, today: string): { config: TimeConfig; problems: Problem[] } {
  const config = defaultTimeConfig(today);
  const problems: Problem[] = [];
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: false });
  const lineAt = (offset: number | undefined): number | null => (offset === undefined ? null : lc.linePos(offset).line);

  const first = doc.errors[0];
  if (first) {
    const lastText = Math.max(text.replace(/\s+$/, '').split('\n').length, 1);
    const raw = first.linePos?.[0]?.line ?? lineAt(first.pos?.[0]);
    const line = raw === null || raw === undefined ? null : Math.min(raw, lastText);
    return { config, problems: [{ line, message: first.message.split('\n')[0]! }] };
  }
  if (doc.contents === null) return { config, problems };
  if (!isMap(doc.contents)) {
    return { config, problems: [{ line: 1, message: 'config.yaml must be a map of settings' }] };
  }

  const target = config as unknown as Record<string, unknown>;
  for (const key of Object.keys(KEYS) as (keyof TimeConfig)[]) {
    const node: unknown = doc.contents.get(KEYS[key], true);
    if (node === undefined) continue;
    const raw: unknown = isNode(node) ? node.toJSON() : node;
    if (raw === null) continue;
    const value = readValue(key, raw);
    if (value === null) {
      problems.push({ line: isNode(node) ? lineAt(node.range?.[0]) : null, message: MESSAGES[key] });
    } else {
      target[key] = value;
    }
  }
  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { config, problems };
}

function isPlainId(id: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9_.@+-]*$/.test(id);
}

/** The YAML text of one value; calendars are a flow list like `[primary]`. */
function valueText<K extends keyof TimeConfig>(key: K, value: TimeConfig[K]): string {
  if (key === 'calendars') {
    const ids = (value as string[]).map((id) => (isPlainId(id) ? id : JSON.stringify(id)));
    return `[${ids.join(', ')}]`;
  }
  return String(value);
}

function parseForEdit(text: string) {
  const doc = parseDocument(text, { prettyErrors: false });
  const first = doc.errors[0];
  if (first) throw new Error(first.message.split('\n')[0]!);
  if (!isMap(doc.contents)) throw new Error('config.yaml must be a map of settings');
  return doc.contents;
}

/**
 * Sets only the given keys and returns the new text. Only the changed value is rewritten, so every other
 * line, comment and unknown key stays byte for byte as it was.
 * Throws an Error with the parser's message when the text is not valid YAML.
 */
export function setTimeConfig(text: string, changes: Partial<TimeConfig>, today: string): string {
  let out = text.trim() === '' ? defaultTimeConfigText(today) : text;
  parseForEdit(out);
  for (const key of Object.keys(KEYS) as (keyof TimeConfig)[]) {
    const value = changes[key];
    if (value === undefined) continue;
    const name = KEYS[key];
    const newText = valueText(key, value);
    const pair = parseForEdit(out).items.find((p) => isScalar(p.key) && p.key.value === name);
    const keyRange = isScalar(pair?.key) ? pair.key.range : null;
    if (!pair || !keyRange) {
      const eol = out.includes('\r\n') ? '\r\n' : '\n';
      out = `${out}${out.endsWith('\n') ? '' : eol}${name}: ${newText}${eol}`;
      continue;
    }
    const valueRange = isNode(pair.value) ? pair.value.range : null;
    // An empty value (`week_start:`) ends at the colon.
    const empty = !valueRange || (isScalar(pair.value) && pair.value.value === null);
    const end = empty ? keyRange[1] + 1 : valueRange[1];
    out = `${out.slice(0, keyRange[1])}: ${newText}${out.slice(end)}`;
  }
  return out;
}
