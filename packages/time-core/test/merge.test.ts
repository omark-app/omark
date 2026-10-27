import { expect, test } from 'vitest';
import { removeCalendar } from '../src/apply.ts';
import { defaultTimeConfigText, parseTimeConfig } from '../src/config.ts';
import { parseEventsFile, serializeEventsFile } from '../src/events-file.ts';
import { mergeEventsFile, mergeTimeConfig } from '../src/merge.ts';
import type { EventRow } from '../src/rows.ts';

const TODAY = '2026-10-27';

function row(eventId: string, date: string, extra: Partial<EventRow> = {}): EventRow {
  return {
    date,
    start: `${date}T09:00+01:00`,
    end: `${date}T10:00+01:00`,
    hours: 1,
    project: 'ACME',
    category: 'Coding',
    description: '',
    allDay: false,
    known: true,
    calendar: 'primary',
    eventId,
    extra: {},
    ...extra,
  };
}

const file = (...rows: EventRow[]) => serializeEventsFile(rows);
const ids = (text: string) => parseEventsFile(text).rows.map((r) => `${r.eventId}@${r.date}:${r.hours}`);

test('mergeEventsFile: an unchanged side takes the other side as it is', () => {
  const base = file(row('a', '2026-10-20'));
  const other = file(row('a', '2026-10-20'), row('b', '2026-10-21'));
  expect(mergeEventsFile(base, base, other)).toBe(other);
  expect(mergeEventsFile(base, other, base)).toBe(other);
});

test('mergeEventsFile: rows added, changed and removed on each side all land', () => {
  const base = file(row('a', '2026-10-20'), row('b', '2026-10-21'), row('c', '2026-10-22'));
  const local = file(row('a', '2026-10-20', { hours: 2 }), row('c', '2026-10-22'), row('d', '2026-10-23'));
  const remote = file(row('a', '2026-10-20'), row('b', '2026-10-21'), row('e', '2026-10-24'));
  expect(ids(mergeEventsFile(base, local, remote))).toEqual(['a@2026-10-20:2', 'd@2026-10-23:1', 'e@2026-10-24:1']);
});

test('mergeEventsFile: when both sides change a row, this device wins', () => {
  const base = file(row('a', '2026-10-20'));
  const local = file(row('a', '2026-10-20', { hours: 2 }));
  const remote = file(row('a', '2026-10-20', { hours: 3 }));
  expect(ids(mergeEventsFile(base, local, remote))).toEqual(['a@2026-10-20:2']);
});

test('mergeEventsFile: rows are keyed by calendar, event and date', () => {
  const base = file();
  const local = file(row('a', '2026-10-20'), row('a', '2026-10-21'));
  const remote = file(row('a', '2026-10-20', { calendar: 'work@example.com' }));
  const merged = parseEventsFile(mergeEventsFile(base, local, remote)).rows.map((r) => `${r.calendar}/${r.eventId}@${r.date}`);
  expect(merged.sort()).toEqual(['primary/a@2026-10-20', 'primary/a@2026-10-21', 'work@example.com/a@2026-10-20']);
});

test('mergeTimeConfig: keys changed here go onto the other side, which keeps its own', () => {
  const base = defaultTimeConfigText(TODAY);
  const local = base.replace('colour_events: false', 'colour_events: true');
  const remote = base.replace('all_day_hours: 8', 'all_day_hours: 6').replace('calendars: [primary]', 'calendars: [primary, work@example.com]');
  const merged = mergeTimeConfig(base, local, remote, TODAY);
  const { config } = parseTimeConfig(merged, TODAY);
  expect(config).toMatchObject({ colourEvents: true, allDayHours: 6, calendars: ['primary', 'work@example.com'] });
  expect(merged).toContain('# set by the "Colour my events" setting');
});

test('mergeTimeConfig: an unchanged side takes the other side as it is, and broken YAML there keeps ours', () => {
  const base = defaultTimeConfigText(TODAY);
  const other = base.replace('week_start: monday', 'week_start: sunday');
  expect(mergeTimeConfig(base, base, other, TODAY)).toBe(other);
  expect(mergeTimeConfig(base, other, base, TODAY)).toBe(other);
  const local = base.replace('colour_events: false', 'colour_events: true');
  expect(mergeTimeConfig(base, local, 'calendars: [primary\n', TODAY)).toBe(local);
});

test('removeCalendar drops every row of one calendar and reports the years it changed', () => {
  const files = new Map([
    ['2025', [row('old', '2025-12-31')]],
    ['2026', [row('a', '2026-10-20'), row('w', '2026-10-20', { calendar: 'work@example.com' })]],
  ]);
  const { files: out, changedYears } = removeCalendar(files, 'primary');
  expect([...changedYears].sort()).toEqual(['2025', '2026']);
  expect(out.get('2025')).toEqual([]);
  expect(out.get('2026')!.map((r) => r.eventId)).toEqual(['w']);
  expect(removeCalendar(files, 'nope').changedYears.size).toBe(0);
});
