import { readSettings } from '@omark/settings';
import type { Values } from '@omark/settings';
import { TASKS_SCHEMA } from './settings-schema.ts';
import type { DateLabelStyle } from './labels.ts';
import type { MovableBucket } from './buckets.ts';
import type { BucketKey } from './model.ts';

export type Command =
  | 'focusAdd' | 'down' | 'up' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'pickDate' | 'someday'
  | 'repeat' | 'important' | 'complete' | 'edit' | 'delete' | 'deselect' | 'undo' | 'switchView' | 'search' | 'habit'
  | 'settings';

/** Values are `KeyboardEvent.key` strings. */
export type Shortcuts = Record<Command, string[]>;

export interface HabitConfig {
  /** Habits in progress at once; 0 = no limit. */
  maxInProgress: number;
  /** Repetitions to form a habit; a habit's own `🌱 N` wins. */
  goal: number;
  missesInARow: number;
  /** A count, or a share of the goal (rounded down). */
  missesPerAttempt: number | { percent: number };
}

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
  habits: HabitConfig;
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
    habit: ['h'],
    settings: [','],
  },
  defaultView: 'list',
  firstDayOfWeek: 0,
  foldedOnOpen: ['later', 'someday'],
  theme: 'system',
  dateLabels: 'short',
  newTaskBucket: 'today',
  saveDelaySeconds: 1,
  habits: { maxInProgress: 3, goal: 66, missesInARow: 1, missesPerAttempt: { percent: 10 } },
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
  habit: h
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

# Habits (a task with a seed mark becomes a habit; it forms after enough repetitions).
habits:
  # Habits in progress at once, 0 to 99 (0 = no limit).
  maxInProgress: 3
  # Repetitions to form a habit, 1 to 999. A habit's own seed number wins.
  goal: 66
  # Misses allowed in a row before the count restarts, 0 to 99.
  missesInARow: 1
  # Misses allowed in one attempt: a whole number (0 to 999) or a share of the goal like 10% (rounded down).
  missesPerAttempt: 10%
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
    habits: {
      maxInProgress: v['habits.maxInProgress'] as number,
      goal: v['habits.goal'] as number,
      missesInARow: v['habits.missesInARow'] as number,
      missesPerAttempt: missesPerAttempt(v['habits.missesPerAttempt'] as number | string),
    },
  };
}

/** The reader gives `6` or `'10%'`; a share of the goal is kept as `{ percent }`. */
function missesPerAttempt(v: number | string): HabitConfig['missesPerAttempt'] {
  return typeof v === 'number' ? v : { percent: Number(v.slice(0, -1)) };
}
