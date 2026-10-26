/** Calendar date as `YYYY-MM-DD` in the device's local time zone. */
export type ISODate = string;

/** `weekStart` uses 0 = Monday … 6 = Sunday. */
export interface WeekCtx {
  today: ISODate;
  weekStart: number;
}

/**
 * Today also holds overdue tasks (#26). `important` is the Important, not urgent group (#38): open tasks
 * with ⏫ and no date, which Someday then leaves out.
 */
export type BucketKey = 'today' | 'tomorrow' | 'week' | 'next' | 'later' | 'someday' | 'important';

/**
 * A repeat rule from the 🔁 field of a task. Weekly `days`: 0 = Monday … 6 = Sunday, sorted, non-empty.
 * Weekly and monthly take an optional interval `n` (every n-th week or month, counted from the due date's
 * week or month); it is absent for the plain every-week / every-month rules, and parsing never sets it to 1.
 * `every` is a plain stride of n days, weeks or calendar months from the due date.
 */
export type RepeatRule =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekly'; days: number[]; n?: number }
  | { type: 'monthly'; day: number /* 1–31 */; n?: number }
  | { type: 'yearly' }
  | { type: 'every'; n: number; unit: 'days' | 'weeks' | 'months' }
  | { type: 'after'; n: number };

/**
 * An open task in `tasks.md`. `raw`/`rawKey` are the block as read and its `taskKey`; null for tasks the
 * app created. A task made from a swept recurring `- [x]` block keeps that block as `raw` (so its note
 * lines are written as read) with `rawKey` null (so its task line is always written canonically).
 */
export interface Task {
  id: string;
  title: string;
  notes: string[];
  date: ISODate | null;
  repeat: RepeatRule | null;
  /** The ⏫ field (issue #19). Absent or false: not important. */
  important?: boolean;
  raw: string[] | null;
  rawKey: string | null;
}

/**
 * One completion, as written to `done.md` (Task 9). `doneOn` is null for a `- [x]` line with no ✅ date.
 * `notes` are the indented lines under it as `noteText` reads them (empty for a one-line entry).
 */
export interface DoneEntry {
  title: string;
  repeat: RepeatRule | null;
  doneOn: ISODate | null;
  notes: string[];
  /** The ⏫ field; absent when the line has none. */
  important?: boolean;
}

/**
 * A block of the Tasks section, in file order. `raw` lines are kept exactly as read. A done item keeps
 * the 📅 `date` its line carried (null when none), so an undated recurring tick can be moved on from it.
 */
export type Item =
  | { kind: 'task'; task: Task }
  | { kind: 'done'; entry: DoneEntry; date: ISODate | null; raw: string[] }
  | { kind: 'raw'; lines: string[] };

/**
 * A parsed `tasks.md`. `preamble` is anything before `# Tasks`; `items` is everything after it. The old
 * `# Always` section is read into the items when parsed (#38) and never written back.
 */
export interface TasksDoc {
  preamble: string[];
  items: Item[];
}

/**
 * One line of `done.md`. `entry` is null for a line without a valid ✅ date and for the note lines under a
 * done line (both kept as is); `raw` has no newline.
 */
export interface DoneLine {
  entry: DoneEntry | null;
  raw: string;
}

/** A parsed `done.md`. */
export interface DoneDoc {
  lines: DoneLine[];
}

/** Both files, as the app holds them in memory. */
export interface State {
  doc: TasksDoc;
  done: DoneDoc;
}
