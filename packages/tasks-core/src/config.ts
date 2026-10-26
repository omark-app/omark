import { readSettings } from '@omark/settings';
import type { Values } from '@omark/settings';
import { TASKS_SCHEMA } from './settings-schema.ts';
import type { DateLabelStyle } from './labels.ts';
import type { MovableBucket } from './buckets.ts';
import type { BucketKey } from './model.ts';

export type Command =
  | 'focusAdd' | 'down' | 'up' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'pickDate' | 'someday'
  | 'repeat' | 'important' | 'complete' | 'edit' | 'delete' | 'deselect' | 'undo' | 'switchView' | 'search'
  | 'settings';

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
  newTaskBucket: MovableBucket;
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
    settings: [','],
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
  settings: ','

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

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Never throws: any problem returns the defaults plus the first error found. */
export function parseConfig(text: string): { config: Config; error: ConfigError | null } {
  const { values, error } = readSettings(TASKS_SCHEMA, text);
  return { config: toConfig(values), error };
}

/** The values the schema reads, as a Config. A new settings section adds its lines here. */
function toConfig(v: Values): Config {
  return {
    shortcuts: v.shortcuts as Shortcuts,
    defaultView: v.defaultView as Config['defaultView'],
    firstDayOfWeek: DAYS.indexOf(v.firstDayOfWeek as string),
    foldedOnOpen: v.foldedOnOpen as BucketKey[],
    theme: v.theme as Config['theme'],
    dateLabels: v.dateLabels as DateLabelStyle,
    newTaskBucket: v.newTaskBucket as MovableBucket,
    saveDelaySeconds: v.saveDelaySeconds as number,
  };
}
