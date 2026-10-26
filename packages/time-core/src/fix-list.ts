// The fix list: unknown codes and overlapping days.
import { compareRows } from './events-file.ts';
import { roundHours } from './hours.ts';
import { compareText, keyOf, type EventRow } from './rows.ts';
import { formatTitle } from './title.ts';
import { parseInstant } from './zone.ts';

export interface UnknownEvent {
  calendar: string;
  eventId: string;
  code: string;
  title: string;
  /** Ascending. */
  dates: string[];
  hours: number;
}
export interface OverlapDay {
  date: string;
  /** Every row that overlaps at least one other that day. */
  rows: EventRow[];
}
export interface FixList {
  unknown: UnknownEvent[];
  overlaps: OverlapDay[];
  count: number;
}

function unknownEvents(rows: EventRow[]): UnknownEvent[] {
  const groups = new Map<string, EventRow[]>();
  for (const r of rows) {
    if (r.known) continue;
    const key = keyOf(r.calendar, r.eventId);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const out: UnknownEvent[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => compareText(a.date, b.date));
    const first = sorted[0]!;
    out.push({
      calendar: first.calendar,
      eventId: first.eventId,
      code: first.project,
      title: formatTitle({ code: first.project, category: first.category, description: first.description }),
      dates: sorted.map((r) => r.date),
      hours: roundHours(sorted.reduce((sum, r) => sum + r.hours, 0)),
    });
  }
  return out.sort(
    (a, b) => compareText(b.dates[0]!, a.dates[0]!) || compareText(a.calendar, b.calendar) || compareText(a.eventId, b.eventId),
  );
}

function overlapDays(rows: EventRow[]): OverlapDay[] {
  const byDate = new Map<string, { row: EventRow; start: number; end: number }[]>();
  for (const row of rows) {
    if (row.allDay) continue;
    const start = parseInstant(row.start);
    const end = parseInstant(row.end);
    if (end <= start) continue;
    const list = byDate.get(row.date);
    if (list) list.push({ row, start, end });
    else byDate.set(row.date, [{ row, start, end }]);
  }
  const out: OverlapDay[] = [];
  for (const [date, list] of byDate) {
    const hit = list.filter((a) => list.some((b) => a !== b && a.start < b.end && b.start < a.end));
    if (hit.length > 0) out.push({ date, rows: hit.map((h) => h.row).sort(compareRows) });
  }
  return out.sort((a, b) => compareText(b.date, a.date));
}

/** Unknown events and overlapping days, latest first. */
export function buildFixList(rows: EventRow[]): FixList {
  const unknown = unknownEvents(rows);
  const overlaps = overlapDays(rows);
  return { unknown, overlaps, count: unknown.length + overlaps.length };
}
