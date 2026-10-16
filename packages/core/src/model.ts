/** Calendar date as `YYYY-MM-DD` in the device's local time zone. */
export type ISODate = string;

/** `weekStart` uses 0 = Monday … 6 = Sunday. */
export interface WeekCtx {
  today: ISODate;
  weekStart: number;
}

export type BucketKey = 'today' | 'week' | 'next' | 'later' | 'someday';

/** A repeat rule from the 🔁 field of a task. Weekly `days`: 0 = Monday … 6 = Sunday, sorted, non-empty. */
export type RepeatRule =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekly'; days: number[] }
  | { type: 'monthly'; day: number /* 1–31 */ }
  | { type: 'yearly' }
  | { type: 'every'; n: number; unit: 'days' | 'weeks' }
  | { type: 'after'; n: number };

/** An open task in `tasks.md`. `raw`/`rawKey` are the block as read and its `taskKey`; null for tasks the app created. */
export interface Task {
  id: string;
  title: string;
  notes: string[];
  date: ISODate | null;
  repeat: RepeatRule | null;
  raw: string[] | null;
  rawKey: string | null;
}

/** One completion, as written to `done.md` (Task 9). `doneOn` is null for a `- [x]` line with no ✅ date. */
export interface DoneEntry {
  title: string;
  repeat: RepeatRule | null;
  doneOn: ISODate | null;
}

/** A block of the Tasks section, in file order. `raw` lines are kept exactly as read. */
export type Item =
  | { kind: 'task'; task: Task }
  | { kind: 'done'; entry: DoneEntry; raw: string[] }
  | { kind: 'raw'; lines: string[] };

/**
 * A parsed `tasks.md`. `preamble` is anything before `# Always`; `items` is everything after `# Tasks`.
 * `alwaysRaw` is the Always section as read (from its heading through the `# Tasks` heading) plus the
 * `always` it parsed to; the section is written back from it while `always` is unchanged. It is null
 * when the file had no Always section; a doc built from scratch should use null too.
 */
export interface TasksDoc {
  preamble: string[];
  always: string[];
  items: Item[];
  alwaysRaw: { lines: string[]; key: string } | null;
}
