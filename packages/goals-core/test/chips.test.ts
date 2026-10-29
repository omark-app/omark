import { expect, test } from 'vitest';
import { areas, goalStatus, monthLabel, parseGoals, projectFacts, type Goal } from '../src/index.ts';

const TODAY = '2026-10-29';
const goal = (line: string): Goal => areas(parseGoals(`## A #a\n${line}\n`))[0]!.goals[0]!;

test('monthLabel', () => {
  expect(monthLabel('2027-10-31')).toBe('Oct 2027');
  expect(monthLabel('2026-01-01')).toBe('Jan 2026');
});

test('status: by, was due, achieved, none', () => {
  expect(goalStatus(goal('- [ ] g 📅 2027-10-31'), TODAY)).toEqual({ kind: 'by', label: 'by Oct 2027' });
  expect(goalStatus(goal('- [ ] g 📅 2026-10-29'), TODAY)).toEqual({ kind: 'by', label: 'by Oct 2026' });
  expect(goalStatus(goal('- [ ] g 📅 2026-10-28'), TODAY)).toEqual({ kind: 'wasDue', label: 'was due Oct 2026' });
  expect(goalStatus(goal('- [x] g 📅 2026-09-30 ✅ 2026-08-14'), TODAY)).toEqual({ kind: 'achieved', label: '✓ Aug 2026' });
  expect(goalStatus(goal('- [x] g'), TODAY)).toEqual({ kind: 'achieved', label: '✓' });
  expect(goalStatus(goal('- [ ] g'), TODAY)).toBeNull();
});

test('project facts: hours this month and since ➕ (known rows up to today) and open tasks with the code', () => {
  const g = goal('- [ ] Trips #CLIMB 📅 2027-12-31 ➕ 2026-09-15');
  const rows = [
    { date: '2026-09-14', project: 'CLIMB', known: true, hours: 5 },
    { date: '2026-09-20', project: 'CLIMB', known: true, hours: 1.1 },
    { date: '2026-10-01', project: 'climb', known: true, hours: 2.2 },
    { date: '2026-10-29', project: 'CLIMB', known: true, hours: 0.1 },
    { date: '2026-10-30', project: 'CLIMB', known: true, hours: 9 },
    { date: '2026-10-02', project: 'CLIMB', known: false, hours: 9 },
    { date: '2026-10-02', project: 'WORK', known: true, hours: 9 },
  ];
  const open = [{ title: 'Book flights #CLIMB' }, { title: 'Pack #climb #gear' }, { title: 'Other #CLIMBING' }];
  expect(projectFacts(g, { rows, open, today: TODAY })).toEqual({ hoursThisMonth: 2.3, hoursSinceSet: 3.4, openTasks: 2 });
});

test('project facts: no ➕ counts all hours; no code gives null; nothing yet gives zeros', () => {
  const rows = [{ date: '2020-01-01', project: 'X1', known: true, hours: 3 }];
  expect(projectFacts(goal('- [ ] g #X1'), { rows, today: TODAY })).toEqual({ hoursThisMonth: 0, hoursSinceSet: 3, openTasks: 0 });
  expect(projectFacts(goal('- [ ] g'), { rows, today: TODAY })).toBeNull();
  expect(projectFacts(goal('- [ ] g #X1'), { today: TODAY })).toEqual({ hoursThisMonth: 0, hoursSinceSet: 0, openTasks: 0 });
});
