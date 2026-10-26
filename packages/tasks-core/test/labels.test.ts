import { expect, test } from 'vitest';
import type { RepeatRule, Task } from '../src/index.ts';
import { dayMonth, dueText, metaLabel, weekdayShort } from '../src/index.ts';

const fri = { today: '2026-10-16', weekStart: 0 };
const mk = (date: string | null, repeat: RepeatRule | null = null): Task => ({ id: 'a', title: 'a', notes: [], date, repeat, raw: null, rawKey: null });

test('weekdayShort and dayMonth', () => {
  expect(weekdayShort('2026-10-15')).toBe('Thu');
  expect(weekdayShort('2026-10-18')).toBe('Sun');
  expect(dayMonth('2026-11-12', fri)).toBe('12 Nov');
  expect(dayMonth('2027-11-12', fri)).toBe("12 Nov '27");
});

test('metaLabel', () => {
  expect(metaLabel(mk('2026-10-15'), fri, 'short')).toEqual({ text: 'Thu', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-10'), fri, 'short')).toEqual({ text: 'Sat', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-09'), fri, 'short')).toEqual({ text: '9 Oct', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-03'), fri, 'short')).toEqual({ text: '3 Oct', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-16'), fri, 'short')).toEqual({ text: null, overdue: false, repeat: false });
  expect(metaLabel(mk('2026-10-16', { type: 'weekly', days: [4] }), fri, 'short')).toEqual({ text: null, overdue: false, repeat: true });
  expect(metaLabel(mk('2026-10-22'), fri, 'short').text).toBe('Thu');
  expect(metaLabel(mk('2026-10-18'), fri, 'short').text).toBe('Sun');
  expect(metaLabel(mk('2026-11-12'), fri, 'short').text).toBe('12 Nov');
  expect(metaLabel(mk('2027-11-12'), fri, 'short').text).toBe("12 Nov '27");
  expect(metaLabel(mk(null), fri, 'short')).toEqual({ text: null, overdue: false, repeat: false });
  expect(metaLabel(mk('2026-11-12'), fri, 'iso').text).toBe('2026-11-12');
  expect(metaLabel(mk('2026-10-03'), fri, 'iso')).toEqual({ text: '2026-10-03', overdue: true, repeat: false });
  expect(metaLabel(mk('2026-10-16'), fri, 'iso').text).toBeNull();
});

test('dueText', () => {
  expect(dueText(mk('2026-10-16'), fri)).toBe('Today · Fri 16 Oct');
  expect(dueText(mk('2026-10-14'), fri)).toBe('Wed 14 Oct · overdue');
  expect(dueText(mk(null), fri)).toBe('Someday · no date');
  expect(dueText(mk('2026-10-22'), fri)).toBe('Thu 22 Oct');
  expect(dueText(mk('2027-11-12'), fri)).toBe("Fri 12 Nov '27");
});
