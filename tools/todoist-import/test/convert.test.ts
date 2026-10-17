import { describe, expect, it } from 'vitest';
import { parseTasks } from '@taskapp/core';
import { buildTasksMd, convertDue, type TodoistTask } from '../src/convert.ts';
import fixture from './fixtures/tasks.json';

const due = (string: string, date = '2026-10-20') => ({ date, string, is_recurring: true });

describe('convertDue', () => {
  it.each([
    ['every day', { type: 'daily' }],
    ['every weekday', { type: 'weekdays' }],
    ['every workday', { type: 'weekdays' }],
    ['every mon, thu', { type: 'weekly', days: [0, 3] }],
    ['Every Thursday and Monday', { type: 'weekly', days: [0, 3] }],
    ['every 15', { type: 'monthly', day: 15 }],
    ['every 15th', { type: 'monthly', day: 15 }],
    ['every year', { type: 'yearly' }],
    ['every 3 days', { type: 'every', n: 3, unit: 'days' }],
    ['every 2 weeks', { type: 'every', n: 2, unit: 'weeks' }],
    ['every! 3 days', { type: 'after', n: 3 }],
  ])('%s', (s, rule) => {
    expect(convertDue(due(s))).toEqual({ date: '2026-10-20', repeat: rule, warning: null });
  });

  it('warns on unsupported rules and keeps the date', () => {
    const r = convertDue(due('every 2nd tue'));
    expect(r.repeat).toBeNull();
    expect(r.date).toBe('2026-10-20');
    expect(r.warning).toContain('every 2nd tue');
  });

  it('no due gives null date', () => {
    expect(convertDue(null)).toEqual({ date: null, repeat: null, warning: null });
  });

  it('strips time from datetimes', () => {
    expect(convertDue({ date: '2026-10-20T10:00:00', string: 'x', is_recurring: false }).date).toBe('2026-10-20');
  });
});

describe('buildTasksMd', () => {
  const t = (over: Partial<TodoistTask>): TodoistTask => ({
    id: 'a',
    content: 'T',
    description: '',
    parent_id: null,
    due: null,
    ...over,
  });

  it('puts description lines then subtasks as notes', () => {
    const { text } = buildTasksMd([
      t({ id: 'a', content: 'Parent', description: 'one\ntwo' }),
      t({ id: 'b', content: 'Child', parent_id: 'a' }),
    ]);
    expect(text).toBe('# Always\n\n# Tasks\n- [ ] Parent\n    - one\n    - two\n    - Child\n');
  });

  it('names the task in warnings', () => {
    const { warnings } = buildTasksMd([t({ content: 'Team sync', due: due('every 2nd tue') })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Team sync');
    expect(warnings[0]).toContain('every 2nd tue');
  });

  it('converts the fixture', () => {
    const { text, warnings } = buildTasksMd(fixture as TodoistTask[]);
    expect(text).toBe(
      '# Always\n\n# Tasks\n' +
        '- [ ] Buy milk 📅 2026-10-20\n    - 2 litres\n    - semi-skimmed\n    - Check bank\n' +
        '- [ ] Pay rent 📅 2026-11-01\n' +
        '- [ ] Someday idea\n' +
        '- [ ] Water plants 🔁 every week on Monday, Thursday 📅 2026-10-18\n' +
        '- [ ] Team sync 📅 2026-10-20\n',
    );
    expect(warnings).toHaveLength(1);
    const titles = parseTasks(text).items.flatMap((i) => (i.kind === 'task' ? [i.task.title] : []));
    expect(titles).toEqual(['Buy milk', 'Pay rent', 'Someday idea', 'Water plants', 'Team sync']);
  });
});
