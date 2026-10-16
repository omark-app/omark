/** Calendar date as `YYYY-MM-DD` in the device's local time zone. */
export type ISODate = string;

/** `weekStart` uses 0 = Monday … 6 = Sunday. */
export interface WeekCtx {
  today: ISODate;
  weekStart: number;
}

export type BucketKey = 'today' | 'week' | 'next' | 'later' | 'someday';
