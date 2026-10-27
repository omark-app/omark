import { expect, test } from 'vitest';
import { applyChanges, newlyInWindow, recheckKnown } from '../src/apply.ts';
import type { YearFiles } from '../src/events-file.ts';
import { buildFixList } from '../src/fix-list.ts';
import type { EventRow, RowContext } from '../src/rows.ts';
import type { CalendarEvent } from '../src/source.ts';
import { summarise } from '../src/summary.ts';

const ctx: RowContext = {
  knownCodes: new Set(['ACME']),
  timeZone: 'Europe/Warsaw',
  allDayHours: 8,
  trackFrom: '2026-01-01',
  today: '2026-10-26',
};

function ev(p: Partial<CalendarEvent>): CalendarEvent {
  return {
    calendarId: 'primary',
    id: 'e1',
    status: 'confirmed',
    title: 'ACME',
    start: { dateTime: '2026-10-22T09:00:00+02:00' },
    end: { dateTime: '2026-10-22T10:00:00+02:00' },
    response: null,
    colorId: null,
    marker: null,
    recurringEventId: null,
    htmlLink: null,
    ...p,
  };
}

const all = (files: YearFiles): EventRow[] => [...files.values()].flat();
const timed = (date: string) => ({
  start: { dateTime: `${date}T09:00:00+02:00` },
  end: { dateTime: `${date}T10:00:00+02:00` },
});

test('a new project code: recheckKnown plus re-applying the window picks up bare-code events', () => {
  const away = ev({ id: 'a', title: 'OOO; away', ...timed('2026-10-20') });
  const bare = ev({ id: 'b', title: 'OOO', ...timed('2026-10-21') });
  const work = ev({ id: 'c', title: 'ACME', ...timed('2026-10-22') });
  const week = { from: '2026-10-19', to: '2026-10-25' };
  const now = Date.parse('2026-10-26T12:00:00Z');

  // Full read, then an incremental change.
  let files = applyChanges(new Map(), [away, bare, work], ctx).files;
  const edited = ev({ id: 'c', title: 'ACME; Dev', start: timed('2026-10-22').start, end: { dateTime: '2026-10-22T11:00:00+02:00' } });
  files = applyChanges(files, [edited], ctx).files;
  expect(all(files).map((r) => r.eventId)).toEqual(['a', 'c']); // the bare OOO has no row yet
  expect(buildFixList(all(files)).unknown.map((u) => u.title)).toEqual(['OOO; away']);

  // Project OOO is added.
  const known = new Set(['ACME', 'OOO']);
  files = recheckKnown(files, known).files;
  expect(summarise(all(files), week, now).projects.find((p) => p.code === 'OOO')!.done).toBe(1); // not enough alone
  files = applyChanges(files, [away, bare, edited], { ...ctx, knownCodes: known }).files;

  const s = summarise(all(files), week, now);
  expect(s.projects.find((p) => p.code === 'OOO')!.done).toBe(2);
  expect(s.unknown).toBe(0);
  const fix = buildFixList(all(files));
  expect(fix.unknown).toEqual([]);
  expect(fix.count).toBe(0);
});

test('an event overlapping the window end gains its rows as the window moves', () => {
  const conf = ev({ id: 'conf', title: 'ACME; Conf', start: { date: '2027-01-20' }, end: { date: '2027-01-30' } });
  const first = applyChanges(new Map(), [conf], ctx).files;
  expect(all(first).map((r) => r.date)).toEqual(['2027-01-20', '2027-01-21', '2027-01-22', '2027-01-23']);

  // The next day readRange(newlyInWindow) returns the same event, since it overlaps the new dates.
  const moved = newlyInWindow('2026-10-26', '2026-10-27');
  expect(moved).toEqual({ from: '2027-01-24', to: '2027-01-25' });
  const next = applyChanges(first, [conf], { ...ctx, today: '2026-10-27' });
  expect(all(next.files).map((r) => r.date)).toEqual([
    '2027-01-20',
    '2027-01-21',
    '2027-01-22',
    '2027-01-23',
    '2027-01-24',
  ]);
  expect([...next.changedYears]).toEqual(['2027']);
});
