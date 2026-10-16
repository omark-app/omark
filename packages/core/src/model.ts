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
