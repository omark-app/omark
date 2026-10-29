import { expect, test } from 'vitest';
import { keyOf } from '@omark/time-core';
import { customRange, eventLink, newProject, reportFileName, viewOf, VIEWS } from './views.ts';

test('the hash picks the view; anything else is hours', () => {
  expect(viewOf('#/charts')).toBe('charts');
  expect(viewOf('#/fix')).toBe('fix');
  expect(viewOf('#/projects')).toBe('projects');
  expect(viewOf('#/report')).toBe('report');
  expect(viewOf('#/settings')).toBe('settings');
  for (const h of ['', '#', '#/', '#/nope', '#/constructor', 'charts']) expect(viewOf(h), h).toBe('hours');
  // Omark Tasks' settings link to Time's as `#settings`.
  expect(viewOf('#settings')).toBe('settings');
  // The calendar view shows only where the deps ask for it (the one app's demo).
  expect(viewOf('#/calendar')).toBe('calendar');
  expect(VIEWS.map((v) => v.id)).toEqual(['hours', 'charts', 'fix', 'projects', 'report', 'calendar', 'settings']);
});

test('a custom range needs two real dates, the first not after the second', () => {
  expect(customRange('2026-10-01', '2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  expect(customRange('2026-10-05', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-05' });
  expect(customRange('2026-10-31', '2026-10-01')).toBe('The first day must not be after the last');
  expect(customRange('2026-02-30', '2026-03-01')).toBe('Pick two dates');
  expect(customRange('', '2026-03-01')).toBe('Pick two dates');
});

test('report files are named after what is in them', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };
  expect(reportFileName('md', range, { codes: ['ACME', 'MYAPP'] })).toBe('omark-time-ACME-MYAPP-2026-10-01-to-2026-10-31.md');
  expect(reportFileName('csv', range, { client: 'Acme Corp / EU' })).toBe('omark-time-Acme-Corp-EU-2026-10-01-to-2026-10-31.csv');
  expect(reportFileName('csv', range, {})).toBe('omark-time-2026-10-01-to-2026-10-31.csv');
});

test('an event links to Google Calendar only when the sync kept its link', () => {
  const links = { [keyOf('primary', 'a')]: 'https://www.google.com/calendar/event?eid=YQ' };
  expect(eventLink(links, 'primary', 'a')).toBe('https://www.google.com/calendar/event?eid=YQ');
  expect(eventLink(links, 'primary', 'b')).toBeNull();
  // Only Google's own calendar pages; anything else a file or a fake might hold is not a link.
  expect(eventLink({ [keyOf('primary', 'x')]: 'javascript:alert(1)' }, 'primary', 'x')).toBeNull();
});

test('a new project starts with the code given, upper case, and nothing else', () => {
  expect(newProject('acmee')).toEqual({ code: 'ACMEE', description: '', client: '', rate: null, currency: '', archived: '', extra: {} });
});
