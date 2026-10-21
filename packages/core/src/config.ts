import { isMap, isNode, LineCounter, parseDocument } from 'yaml';
import type { DateLabelStyle } from './labels.ts';
import type { BucketKey } from './model.ts';

export type Command =
  | 'focusAdd' | 'down' | 'up' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'pickDate' | 'someday'
  | 'repeat' | 'important' | 'complete' | 'edit' | 'delete' | 'deselect' | 'undo' | 'switchView' | 'search';

/** Values are `KeyboardEvent.key` strings. */
export type Shortcuts = Record<Command, string[]>;

export interface Config {
  shortcuts: Shortcuts;
  defaultView: 'list' | 'board';
  /** 0 = Monday … 6 = Sunday. */
  firstDayOfWeek: number;
  foldedOnOpen: BucketKey[];
  theme: 'system' | 'light' | 'dark';
  dateLabels: DateLabelStyle;
  newTaskBucket: Exclude<BucketKey, 'later'>;
  saveDelaySeconds: number;
}

export interface ConfigError {
  /** 1-based, null if unknown. */
  line: number | null;
  message: string;
}

export const DEFAULT_CONFIG: Config = {
  shortcuts: {
    focusAdd: ['/', 'n'],
    down: ['j', 'ArrowDown'],
    up: ['k', 'ArrowUp'],
    today: ['t'],
    tomorrow: ['m'],
    thisWeek: ['w'],
    nextWeek: ['e'],
    pickDate: ['d'],
    someday: ['s'],
    repeat: ['r'],
    important: ['i'],
    complete: ['x'],
    edit: ['Enter'],
    delete: ['Delete', 'Backspace'],
    deselect: ['Escape'],
    undo: ['z'],
    switchView: ['v'],
    search: ['f'],
  },
  defaultView: 'list',
  firstDayOfWeek: 0,
  foldedOnOpen: ['later', 'someday'],
  theme: 'system',
  dateLabels: 'short',
  newTaskBucket: 'today',
  saveDelaySeconds: 1,
};

export const DEFAULT_CONFIG_YAML = `# Omark Tasks settings.
# This file only needs the settings you want to change; anything missing uses the built-in default.
# If this file has a mistake, the app shows a banner and uses the defaults until it is fixed.
# Obsidian hides .yaml files unless Settings > Files and links > "Detect all file extensions" is on.

# Keyboard shortcuts: each command takes one key or a list of keys (KeyboardEvent.key names, e.g. Enter, Escape, ArrowDown).
# A key can only be bound to one command.
shortcuts:
  focusAdd: ['/', 'n']
  down: ['j', 'ArrowDown']
  up: ['k', 'ArrowUp']
  today: t
  tomorrow: m
  thisWeek: w
  nextWeek: e
  pickDate: d
  someday: s
  repeat: r
  important: i
  complete: x
  edit: Enter
  delete: ['Delete', 'Backspace']
  deselect: Escape
  undo: z
  switchView: v
  search: f

# View shown on desktop when the app opens: list or board.
defaultView: list

# First day of the week: monday, tuesday, wednesday, thursday, friday, saturday or sunday.
firstDayOfWeek: monday

# Buckets that start folded when the app opens: any of today, tomorrow, week, next, later, someday.
# Empty buckets always start folded.
foldedOnOpen: [later, someday]

# Colour theme: system, light or dark.
theme: system

# How dates are shown on tasks: short (Thu, 12 Nov) or iso (2026-11-12).
dateLabels: short

# Bucket for tasks added with the add box: today, tomorrow, week, next or someday.
newTaskBucket: today

# Seconds to wait after you stop typing before saving (0 or more).
saveDelaySeconds: 1
`;

const COMMANDS = Object.keys(DEFAULT_CONFIG.shortcuts) as Command[];
/**
 * Commands added after configs were already written (issue #19). Left unset, their default keys give way
 * to a key the file binds to another command, so an older config never starts failing.
 */
const YIELDING: readonly Command[] = ['tomorrow', 'important'];
const BUCKETS: BucketKey[] = ['today', 'tomorrow', 'week', 'next', 'later', 'someday'];
/** Buckets an older config may still name; they read without an error and do nothing (Overdue is in Today since #26). */
const RETIRED = ['overdue'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

class ConfigFailure extends Error {
  readonly line: number | null;
  constructor(line: number | null, message: string) {
    super(message);
    this.line = line;
  }
}

function oneOf<T extends string>(name: string, v: unknown, allowed: readonly T[]): T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
}

function keyName(key: unknown): string {
  return String(isNode(key) ? (key as { value?: unknown }).value : key);
}

/** Never throws: any problem returns the defaults plus the first error found. */
export function parseConfig(text: string): { config: Config; error: ConfigError | null } {
  try {
    return { config: parse(text), error: null };
  } catch (e) {
    const error: ConfigError =
      e instanceof ConfigFailure
        ? { line: e.line, message: e.message }
        : { line: null, message: e instanceof Error ? e.message : String(e) };
    return { config: cloneDefaults(), error };
  }
}

function parse(text: string): Config {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: false });
  const lineOf = (node: unknown): number | null => {
    const range = isNode(node) ? node.range : null;
    return range ? lc.linePos(range[0]).line : null;
  };

  const first = doc.errors[0];
  if (first) {
    const raw = first.linePos?.[0]?.line ?? (first.pos ? lc.linePos(first.pos[0]).line : null);
    // Errors found at end of input (unclosed bracket) are reported on the last line that has text.
    const lastText = text.replace(/\s+$/, '').split('\n').length;
    const line = raw === null ? null : Math.min(raw, Math.max(lastText, 1));
    throw new ConfigFailure(line, first.message.split('\n')[0]!);
  }
  if (doc.contents === null) return cloneDefaults();
  if (!isMap(doc.contents)) {
    throw new ConfigFailure(lineOf(doc.contents), 'The file must be a list of "setting: value" lines');
  }

  const config: Config = cloneDefaults();
  const shortcutLines = new Map<Command, number | null>();
  let shortcutsLine: number | null = null;

  for (const pair of doc.contents.items) {
    const name = keyName(pair.key);
    const valueNode = pair.value;
    const raw: unknown = isNode(valueNode) ? valueNode.toJSON() : valueNode;
    try {
      switch (name) {
        case 'shortcuts': {
          shortcutsLine = lineOf(pair.key);
          if (!isMap(valueNode)) throw new Error('shortcuts must be a list of "command: key" lines');
          for (const sp of valueNode.items) {
            const cmd = keyName(sp.key);
            const line = lineOf(sp.key);
            if (!(COMMANDS as string[]).includes(cmd)) throw new ConfigFailure(line, `Unknown shortcut command "${cmd}"`);
            const v: unknown = isNode(sp.value) ? sp.value.toJSON() : sp.value;
            const keys = typeof v === 'string' ? [v] : v;
            if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === 'string' && k !== '')) {
              throw new ConfigFailure(line, `Shortcut "${cmd}" must be a key or a non-empty list of keys`);
            }
            config.shortcuts[cmd as Command] = keys as string[];
            shortcutLines.set(cmd as Command, line);
          }
          break;
        }
        case 'defaultView':
          config.defaultView = oneOf(name, raw, ['list', 'board']);
          break;
        case 'firstDayOfWeek': {
          const idx = typeof raw === 'string' ? DAYS.indexOf(raw.toLowerCase()) : -1;
          if (idx < 0) throw new Error(`firstDayOfWeek must be a day name: ${DAYS.join(', ')}`);
          config.firstDayOfWeek = idx;
          break;
        }
        case 'foldedOnOpen':
          if (!Array.isArray(raw)) throw new Error(`foldedOnOpen must be a list of: ${BUCKETS.join(', ')}`);
          config.foldedOnOpen = raw.filter((b) => !RETIRED.includes(b)).map((b) => oneOf('foldedOnOpen', b, BUCKETS));
          break;
        case 'theme':
          config.theme = oneOf(name, raw, ['system', 'light', 'dark']);
          break;
        case 'dateLabels':
          config.dateLabels = oneOf(name, raw, ['short', 'iso']);
          break;
        case 'newTaskBucket':
          config.newTaskBucket = oneOf(name, raw, ['today', 'tomorrow', 'week', 'next', 'someday']);
          break;
        case 'saveDelaySeconds':
          if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
            throw new Error('saveDelaySeconds must be a number ≥ 0');
          }
          config.saveDelaySeconds = raw;
          break;
        default:
          throw new ConfigFailure(lineOf(pair.key), `Unknown setting "${name}"`);
      }
    } catch (e) {
      if (e instanceof ConfigFailure) throw e;
      throw new ConfigFailure(lineOf(valueNode) ?? lineOf(pair.key), e instanceof Error ? e.message : String(e));
    }
  }

  const taken = new Set([...shortcutLines.keys()].flatMap((cmd) => config.shortcuts[cmd]));
  for (const cmd of YIELDING) {
    if (!shortcutLines.has(cmd)) config.shortcuts[cmd] = config.shortcuts[cmd].filter((k) => !taken.has(k));
  }

  const owner = new Map<string, Command>();
  for (const cmd of COMMANDS) {
    for (const key of config.shortcuts[cmd]) {
      const other = owner.get(key);
      if (other !== undefined && other !== cmd) {
        const line = shortcutLines.get(cmd) ?? shortcutLines.get(other) ?? shortcutsLine;
        throw new ConfigFailure(line, `Key "${key}" is bound to both ${other} and ${cmd}`);
      }
      owner.set(key, cmd);
    }
  }
  return config;
}

function cloneDefaults(): Config {
  const d = DEFAULT_CONFIG;
  const shortcuts = {} as Shortcuts;
  for (const c of COMMANDS) shortcuts[c] = [...d.shortcuts[c]];
  return { ...d, shortcuts, foldedOnOpen: [...d.foldedOnOpen] };
}
