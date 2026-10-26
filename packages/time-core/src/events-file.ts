// Reading and writing the events-YYYY.csv year files.
import { parseCsv, toCsv } from './csv.ts';
import { formatHours } from './hours.ts';
import { compareText, type EventRow } from './rows.ts';
import { isRealDate, parseInstant } from './zone.ts';

/** The fixed columns, in file order. */
export const EVENT_COLUMNS: readonly string[] = [
  'date',
  'start',
  'end',
  'hours',
  'project',
  'category',
  'description',
  'all_day',
  'known',
  'calendar',
  'event_id',
];

/** Year → rows of that year's file. */
export type YearFiles = Map<string, EventRow[]>;

export function eventsFileName(year: string): string {
  return `events-${year}.csv`;
}

/** Sort order of a file: start instant, then calendar, event id, date. */
export function compareRows(a: EventRow, b: EventRow): number {
  return (
    parseInstant(a.start) - parseInstant(b.start) ||
    compareText(a.calendar, b.calendar) ||
    compareText(a.eventId, b.eventId) ||
    compareText(a.date, b.date)
  );
}

function parseBool(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  return t === 'true' ? true : t === 'false' ? false : null;
}

function isInstant(text: string): boolean {
  try {
    parseInstant(text);
    return true;
  } catch {
    return false;
  }
}

/** Read a year file. Rows that cannot be read are left out; `badLines` holds their 1-based lines. */
export function parseEventsFile(text: string): { rows: EventRow[]; badLines: number[] } {
  const { rows: cells, lines, unterminated } = parseCsv(text);
  const rows: EventRow[] = [];
  const badLines: number[] = [];
  const header = cells[0];
  if (!header) return { rows, badLines };

  const standard = new Set(EVENT_COLUMNS);
  // An unclosed quote swallows the rest of the file into the last row.
  const readable = unterminated === null ? cells.length : cells.length - 1;
  for (let i = 1; i < readable; i++) {
    const values = new Map<string, string>();
    const extra: Record<string, string> = {};
    header.forEach((name, c) => {
      const value = cells[i]![c] ?? '';
      if (standard.has(name)) values.set(name, value);
      else extra[name] = value;
    });
    const get = (name: string) => values.get(name) ?? '';
    const present = (name: string) => values.has(name);

    const hoursText = get('hours').trim();
    const hours = hoursText === '' ? NaN : Number(hoursText);
    const allDay = present('all_day') ? parseBool(get('all_day')) : false;
    const known = present('known') ? parseBool(get('known')) : false;
    if (
      !Number.isFinite(hours) ||
      !isInstant(get('start')) ||
      !isInstant(get('end')) ||
      !isRealDate(get('date')) ||
      allDay === null ||
      known === null
    ) {
      badLines.push(lines[i]!);
      continue;
    }
    rows.push({
      date: get('date'),
      start: get('start'),
      end: get('end'),
      hours,
      project: get('project'),
      category: get('category'),
      description: get('description'),
      allDay,
      known,
      calendar: get('calendar'),
      eventId: get('event_id'),
      extra,
    });
  }
  if (unterminated !== null && !badLines.includes(unterminated)) badLines.push(unterminated);
  return { rows, badLines };
}

/** Write a year file: rows sorted, unknown columns after the fixed ones in first-seen order. */
export function serializeEventsFile(rows: EventRow[]): string {
  const extraNames: string[] = [];
  for (const r of rows) {
    for (const name of Object.keys(r.extra)) if (!extraNames.includes(name)) extraNames.push(name);
  }
  const out: string[][] = [[...EVENT_COLUMNS, ...extraNames]];
  for (const r of [...rows].sort(compareRows)) {
    out.push([
      r.date,
      r.start,
      r.end,
      formatHours(r.hours),
      r.project,
      r.category,
      r.description,
      r.allDay ? 'true' : 'false',
      r.known ? 'true' : 'false',
      r.calendar,
      r.eventId,
      ...extraNames.map((n) => r.extra[n] ?? ''),
    ]);
  }
  return toCsv(out);
}
