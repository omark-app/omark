import { expect, test } from 'vitest';
import {
  EVENT_COLUMNS,
  compareRows,
  eventsFileName,
  parseEventsFile,
  serializeEventsFile,
} from '../src/events-file.ts';
import { buildFixList } from '../src/fix-list.ts';
import type { EventRow } from '../src/rows.ts';
import { summarise } from '../src/summary.ts';

const SAMPLE = `date,start,end,hours,project,category,description,all_day,known,calendar,event_id
2026-10-22,2026-10-22T09:00+02:00,2026-10-22T10:30+02:00,1.5,ACME,Coding,new featureX,false,true,primary,abc123
2026-10-22,2026-10-22T11:00+02:00,2026-10-22T11:30+02:00,0.5,OOO,,away,false,false,primary,def456
`;

function row(p: Partial<EventRow>): EventRow {
  return {
    date: '2026-10-25',
    start: '2026-10-25T09:00+01:00',
    end: '2026-10-25T10:00+01:00',
    hours: 1,
    project: 'ACME',
    category: '',
    description: '',
    allDay: false,
    known: true,
    calendar: 'primary',
    eventId: 'a',
    extra: {},
    ...p,
  };
}

test('names and columns', () => {
  expect(eventsFileName('2026')).toBe('events-2026.csv');
  expect(EVENT_COLUMNS).toHaveLength(11);
  expect(EVENT_COLUMNS[0]).toBe('date');
  expect(EVENT_COLUMNS[10]).toBe('event_id');
});

test('the spec sample round-trips byte for byte', () => {
  const { rows, badLines } = parseEventsFile(SAMPLE);
  expect(badLines).toEqual([]);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ hours: 1.5, project: 'ACME', known: true, allDay: false, eventId: 'abc123' });
  expect(rows[1]).toMatchObject({ category: '', known: false });
  expect(serializeEventsFile(rows)).toBe(SAMPLE);
});

test('an extra column is kept on every row and written after the fixed ones', () => {
  const text = SAMPLE.replace('event_id\n', 'event_id,billed\n')
    .replace('abc123\n', 'abc123,yes\n')
    .replace('def456\n', 'def456,no\n');
  const { rows } = parseEventsFile(text);
  expect(rows.map((r) => r.extra)).toEqual([{ billed: 'yes' }, { billed: 'no' }]);
  expect(serializeEventsFile(rows)).toBe(text);
});

test('columns are mapped by header name', () => {
  const text = 'event_id,hours,end,start,date\nx1,2,2026-10-22T11:00+02:00,2026-10-22T09:00+02:00,2026-10-22\n';
  const { rows } = parseEventsFile(text);
  expect(rows[0]).toMatchObject({ eventId: 'x1', hours: 2, date: '2026-10-22', project: '' });
});

test('a missing event_id column reads as empty', () => {
  const text =
    'date,start,end,hours,project,category,description,all_day,known,calendar\n' +
    '2026-10-22,2026-10-22T09:00+02:00,2026-10-22T10:30+02:00,1.5,ACME,,,false,true,primary\n';
  const { rows, badLines } = parseEventsFile(text);
  expect(badLines).toEqual([]);
  expect(rows[0]!.eventId).toBe('');
});

test('a row with bad hours is left out and its line reported', () => {
  const text = SAMPLE.replace(',1.5,', ',abc,');
  const { rows, badLines } = parseEventsFile(text);
  expect(rows).toHaveLength(1);
  expect(badLines).toEqual([2]);
});

test('bad start and bad booleans are bad lines; booleans read case-insensitively', () => {
  const text = SAMPLE.replace('2026-10-22T09:00+02:00', 'nope').replace(',false,false,', ',TRUE,maybe,');
  const { rows, badLines } = parseEventsFile(text);
  expect(rows).toEqual([]);
  expect(badLines).toEqual([2, 3]);
  const ok = parseEventsFile(SAMPLE.replace(',false,true,', ',TRUE,False,'));
  expect(ok.rows[0]).toMatchObject({ allDay: true, known: false });
});

test('empty text gives nothing; empty rows write only the header', () => {
  expect(parseEventsFile('')).toEqual({ rows: [], badLines: [] });
  expect(serializeEventsFile([])).toBe(EVENT_COLUMNS.join(',') + '\n');
});

test('rows are sorted by instant, not by text', () => {
  const late = row({ eventId: 'a', start: '2026-10-25T02:30+02:00' });
  const early = row({ eventId: 'b', start: '2026-10-25T02:15+01:00' });
  expect(compareRows(late, early)).toBeLessThan(0);
  const lines = serializeEventsFile([early, late]).split('\n');
  expect(lines[1]).toContain('02:30+02:00');
  expect(lines[2]).toContain('02:15+01:00');
});

test('ties break on calendar, event_id, date', () => {
  const a = row({ calendar: 'a', eventId: 'z' });
  const b = row({ calendar: 'b', eventId: 'a' });
  expect(compareRows(a, b)).toBeLessThan(0);
  expect(compareRows(row({ eventId: 'a' }), row({ eventId: 'b' }))).toBeLessThan(0);
  expect(compareRows(row({ date: '2026-10-25' }), row({ date: '2026-10-26' }))).toBeLessThan(0);
  expect(compareRows(a, a)).toBe(0);
});

test('an unclosed quote is a bad line', () => {
  const { rows, badLines } = parseEventsFile(SAMPLE.replace(',def456\n', ',\"def456\n'));
  expect(rows.map((r) => r.eventId)).toEqual(['abc123']);
  expect(badLines).toEqual([3]);
  const early = parseEventsFile(SAMPLE.replace(',new featureX,', ',"new featureX,'));
  expect(early.rows).toEqual([]);
  expect(early.badLines).toEqual([2]);
});

test('a bad end or a date that is not a real YYYY-MM-DD is a bad line', () => {
  const text = SAMPLE.replace('2026-10-22T10:30+02:00', 'oops').replace(
    '2026-10-22,2026-10-22T11:00',
    '22.10.2026,2026-10-22T11:00',
  );
  const { rows, badLines } = parseEventsFile(text);
  expect(rows).toEqual([]);
  expect(badLines).toEqual([2, 3]);
  expect(parseEventsFile(SAMPLE.replace('2026-10-22,2026-10-22T11:00', '2026-02-30,2026-10-22T11:00')).badLines).toEqual([3]);

  const one = parseEventsFile(SAMPLE.replace('2026-10-22T10:30+02:00', 'oops'));
  expect(one.rows).toHaveLength(1);
  expect(() => summarise(one.rows, { from: '2026-10-01', to: '2026-10-31' }, Date.parse('2026-11-01T00:00:00Z'))).not.toThrow();
  expect(() => buildFixList(one.rows)).not.toThrow();
});
