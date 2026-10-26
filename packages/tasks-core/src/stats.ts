import type { DoneDoc, ISODate } from './model.ts';
import { addDays, daysBetween } from './dates.ts';

export interface Stats {
  today: number;
  avg: number | null;
  last7: number;
  prev7: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  all: number;
}

/**
 * Completion counts from `done.md`. Only lines with a valid entry and a done date count. `avg` is the
 * daily average of completions before today over the full days since the first one (zero days count);
 * `prev7` and `trend` need 14 full days.
 */
export function computeStats(done: DoneDoc, today: ISODate): Stats {
  const dates: ISODate[] = [];
  for (const line of done.lines) {
    if (line.entry && line.entry.doneOn !== null) dates.push(line.entry.doneOn);
  }

  let first: ISODate | null = null;
  let before = 0;
  let todayCount = 0;
  let last7 = 0;
  let prev7Count = 0;
  const last7Start = addDays(today, -7);
  const prev7Start = addDays(today, -14);
  const prev7End = addDays(today, -8);
  for (const d of dates) {
    if (first === null || d < first) first = d;
    if (d < today) before++;
    if (d === today) todayCount++;
    if (d >= last7Start && d < today) last7++;
    if (d >= prev7Start && d <= prev7End) prev7Count++;
  }

  const fullDays = first === null ? 0 : daysBetween(first, today);
  const avg = fullDays >= 1 ? before / fullDays : null;
  const prev7 = fullDays >= 14 ? prev7Count : null;
  const trend = prev7 === null ? null : last7 > prev7 ? 'up' : last7 < prev7 ? 'down' : 'flat';

  return { today: todayCount, avg, last7, prev7, trend, all: dates.length };
}

const ARROW = { up: '↑', down: '↓', flat: '→' } as const;

/** `Today 4 (3.2) · 7d 23 (19 ↑) · All 412`; `–` stands in for a value that doesn't exist yet. */
export function formatStats(s: Stats): string {
  const avg = s.avg === null ? '–' : s.avg.toFixed(1);
  const prev = s.prev7 === null ? '–' : `${s.prev7}${s.trend ? ` ${ARROW[s.trend]}` : ''}`;
  return `Today ${s.today} (${avg}) · 7d ${s.last7} (${prev}) · All ${s.all}`;
}
