import { expect, test } from 'vitest';
import { applyChanges, newlyInWindow, recheckKnown } from '../src/apply.ts';
import { serializeEventsFile, type YearFiles } from '../src/events-file.ts';
import { eventToRows, type EventRow, type RowContext } from '../src/rows.ts';
import type { CalendarEvent } from '../src/source.ts';

const ctx: RowContext = {
  knownCodes: new Set(['ACME']),
  timeZone: 'Europe/Warsaw',
  allDayHours: 8,
  trackFrom: '2026-01-01',
  today: '2026-12-30',
};

function ev(p: Partial<CalendarEvent>): CalendarEvent {
  return {
    calendarId: 'primary',
    id: 'e1',
    status: 'confirmed',
    title: 'ACME; Coding; x',
    start: { dateTime: '2026-10-22T09:00:00+02:00' },
    end: { dateTime: '2026-10-22T10:30:00+02:00' },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...p,
  };
}

const empty = (): YearFiles => new Map();

test('a new event adds its rows to its year', () => {
  const { files, changedYears } = applyChanges(empty(), [ev({})], ctx);
  expect(files.get('2026')).toHaveLength(1);
  expect([...changedYears]).toEqual(['2026']);
});

test('input is not mutated', () => {
  const input: YearFiles = new Map([['2026', []]]);
  const arr = input.get('2026')!;
  applyChanges(input, [ev({})], ctx);
  expect(input.get('2026')).toBe(arr);
  expect(arr).toEqual([]);
  expect(input.size).toBe(1);
});

test('an edited event replaces its rows; moved to another day the old row is gone', () => {
  const first = applyChanges(empty(), [ev({})], ctx).files;
  const moved = ev({
    start: { dateTime: '2026-10-23T09:00:00+02:00' },
    end: { dateTime: '2026-10-23T10:00:00+02:00' },
  });
  const { files, changedYears } = applyChanges(first, [moved], ctx);
  const rows = files.get('2026')!;
  expect(rows.map((r) => r.date)).toEqual(['2026-10-23']);
  expect(rows[0]!.hours).toBe(1);
  expect(changedYears.has('2026')).toBe(true);
});

test('a cancelled event loses its rows and its year stays as an empty array', () => {
  const first = applyChanges(empty(), [ev({})], ctx).files;
  const cancelled = ev({ status: 'cancelled', title: '', start: null, end: null });
  const { files, changedYears } = applyChanges(first, [cancelled], ctx);
  expect(files.get('2026')).toEqual([]);
  expect(changedYears.has('2026')).toBe(true);
});

test('an event whose title lost its structure loses its rows', () => {
  const first = applyChanges(empty(), [ev({})], ctx).files;
  const { files } = applyChanges(first, [ev({ title: 'Lunch' })], ctx);
  expect(files.get('2026')).toEqual([]);
});

test('rows are matched by calendar and event id', () => {
  const first = applyChanges(empty(), [ev({ calendarId: 'a' }), ev({ calendarId: 'b' })], ctx).files;
  const { files } = applyChanges(first, [ev({ calendarId: 'a', title: 'Lunch' })], ctx);
  expect(files.get('2026')!.map((r) => r.calendar)).toEqual(['b']);
});

test('a 31 Dec to 1 Jan event lands in both years', () => {
  const night = ev({
    start: { dateTime: '2026-12-31T23:00:00+01:00' },
    end: { dateTime: '2027-01-01T01:00:00+01:00' },
  });
  const { files, changedYears } = applyChanges(empty(), [night], ctx);
  expect(files.get('2026')!.map((r) => r.date)).toEqual(['2026-12-31']);
  expect(files.get('2027')!.map((r) => r.date)).toEqual(['2027-01-01']);
  expect([...changedYears].sort()).toEqual(['2026', '2027']);
});

test('applying the same events twice changes nothing the second time', () => {
  const second = ev({
    id: 'e2',
    start: { dateTime: '2026-10-22T08:00:00+02:00' },
    end: { dateTime: '2026-10-22T08:30:00+02:00' },
  });
  const events = [ev({}), second];
  const once = applyChanges(empty(), events, ctx);
  const twice = applyChanges(once.files, events, ctx);
  expect(twice.files).toEqual(once.files);
  expect(twice.changedYears.size).toBe(0);
  expect(serializeEventsFile(twice.files.get('2026')!)).toBe(serializeEventsFile(once.files.get('2026')!));
});

test('year rows stay sorted', () => {
  const later = ev({
    id: 'late',
    start: { dateTime: '2026-10-22T15:00:00+02:00' },
    end: { dateTime: '2026-10-22T16:00:00+02:00' },
  });
  const { files } = applyChanges(empty(), [later, ev({})], ctx);
  expect(files.get('2026')!.map((r) => r.eventId)).toEqual(['e1', 'late']);
});

test('recheckKnown flips known and reports only the years that changed', () => {
  const oooRow = (): EventRow =>
    eventToRows(
      ev({
        id: 'o1',
        title: 'OOO; away',
        start: { dateTime: '2026-10-12T09:00:00+02:00' },
        end: { dateTime: '2026-10-12T10:00:00+02:00' },
      }),
      ctx,
    )[0]!;
  const acme = eventToRows(ev({}), ctx)[0]!;
  const files: YearFiles = new Map([
    ['2025', [acme]],
    ['2026', [acme, oooRow()]],
  ]);
  const before = files.get('2026')!.find((r) => r.project === 'OOO')!;
  expect(before.known).toBe(false);
  const codes = new Set(['ACME', 'OOO']);
  const { files: out, changedYears } = recheckKnown(files, codes);
  expect(out.get('2026')!.find((r) => r.project === 'OOO')!.known).toBe(true);
  expect(before.known).toBe(false);
  expect([...changedYears]).toEqual(['2026']);
  expect(recheckKnown(out, codes).changedYears.size).toBe(0);
});

test('newlyInWindow', () => {
  expect(newlyInWindow(null, '2026-10-26')).toBeNull();
  expect(newlyInWindow('2026-10-26', '2026-10-26')).toBeNull();
  expect(newlyInWindow('2026-10-27', '2026-10-26')).toBeNull();
  expect(newlyInWindow('2026-10-26', '2026-10-29')).toEqual({ from: '2027-01-24', to: '2027-01-27' });
});

test('extra columns of a re-applied event are kept and the year is not reported changed', () => {
  const base = applyChanges(empty(), [ev({})], ctx).files;
  const withExtra: YearFiles = new Map([
    ['2026', base.get('2026')!.map((r) => ({ ...r, extra: { billed: 'yes' } }))],
  ]);
  const again = applyChanges(withExtra, [ev({})], ctx);
  expect(again.files.get('2026')![0]!.extra).toEqual({ billed: 'yes' });
  expect(again.changedYears.size).toBe(0);
});

test('the same event twice in one call gives one set of rows (the last wins)', () => {
  const first = ev({ title: 'ACME; Coding; first' });
  const last = ev({ title: 'ACME; Coding; last' });
  const { files } = applyChanges(empty(), [first, last], ctx);
  expect(files.get('2026')!.map((r) => r.description)).toEqual(['last']);
});

test('replace and removal leave the input untouched', () => {
  const other = ev({
    id: 'e2',
    start: { dateTime: '2026-10-23T09:00:00+02:00' },
    end: { dateTime: '2026-10-23T10:00:00+02:00' },
  });
  const input = applyChanges(empty(), [ev({}), other], ctx).files;
  const copy = structuredClone(input);
  const arrays = [...input.values()];
  const rowObjects = arrays.flat();
  const edited = ev({ title: 'ACME; Coding; changed' });
  const gone = ev({ id: 'e2', status: 'cancelled', title: '', start: null, end: null });
  applyChanges(input, [edited, gone], ctx);
  recheckKnown(input, new Set());
  expect(input).toEqual(copy);
  expect([...input.values()]).toEqual(arrays);
  arrays.forEach((a, i) => expect(a).toBe([...input.values()][i]));
  expect(input.get('2026')!.every((r, i) => r === rowObjects[i])).toBe(true);
});
