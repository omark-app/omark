import { describe, expect, it } from 'vitest';
import { parseTasks } from '@omark/tasks-core';
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

  it.each([
    ['every 2 weeks fri', { type: 'weekly', days: [4], n: 2 }],
    ['every 2 weeks on Friday', { type: 'weekly', days: [4], n: 2 }],
    ['every 2 weeks on mon, thu', { type: 'weekly', days: [0, 3], n: 2 }],
    ['every 3 weeks Monday and Thursday', { type: 'weekly', days: [0, 3], n: 3 }],
    ['every 1 week on fri', { type: 'weekly', days: [4] }],
    ['every 3 months', { type: 'every', n: 3, unit: 'months' }],
    ['every 1 month', { type: 'every', n: 1, unit: 'months' }],
    ['every 3 months on the 18th', { type: 'monthly', day: 18, n: 3 }],
    ['every 3 months on the 18', { type: 'monthly', day: 18, n: 3 }],
    ['every 18th every 3 months', { type: 'monthly', day: 18, n: 3 }],
  ])('interval rule %s', (s, rule) => {
    expect(convertDue(due(s))).toEqual({ date: '2026-10-20', repeat: rule, warning: null });
  });

  it.each([
    ['every 2 weeks Fri at 6:00 pm', { type: 'weekly', days: [4], n: 2 }, 'at 6:00 pm'],
    ['Every 2 days at 7am', { type: 'every', n: 2, unit: 'days' }, 'at 7am'],
    ['every day at 18:00', { type: 'daily' }, 'at 18:00'],
    ['every mon at 9', { type: 'weekly', days: [0] }, 'at 9'],
    ['every 3 months at 7:30 AM', { type: 'every', n: 3, unit: 'months' }, 'at 7:30 AM'],
  ])('drops the time from %s and warns', (s, rule, time) => {
    const r = convertDue({ date: '2026-10-23T18:00:00', string: s, is_recurring: true });
    expect(r.date).toBe('2026-10-23');
    expect(r.repeat).toEqual(rule);
    expect(r.warning).toContain(`"${s}"`);
    expect(r.warning).toContain(time);
    expect(r.warning).toContain('(Omark Tasks has no times)');
    expect(r.warning).toMatch(/time/);
  });

  it('the three real Todoist strings', () => {
    expect(convertDue({ date: '2026-10-23T18:00:00', string: 'every 2 weeks Fri at 6:00 pm', is_recurring: true }).repeat)
      .toEqual({ type: 'weekly', days: [4], n: 2 });
    expect(convertDue({ date: '2026-10-18T07:00:00', string: 'Every 2 days at 7am', is_recurring: true }).repeat)
      .toEqual({ type: 'every', n: 2, unit: 'days' });
    expect(convertDue({ date: '2026-11-02', string: 'every 3 months', is_recurring: true })).toEqual({
      date: '2026-11-02',
      repeat: { type: 'every', n: 3, unit: 'months' },
      warning: null,
    });
  });

  it('an interval the app cannot read back is unsupported', () => {
    for (const s of ['every 1000 days', 'every 1000 weeks fri', 'every 1000 months']) {
      const r = convertDue(due(s));
      expect(r.repeat, s).toBeNull();
      expect(r.warning).toContain(`unsupported repeat "${s}"`);
    }
  });

  it('an unsupported rule with a time warns with the original string', () => {
    const r = convertDue(due('every 2nd tue at 9am'));
    expect(r.repeat).toBeNull();
    expect(r.warning).toContain('unsupported repeat "every 2nd tue at 9am"');
  });

  it('bare every week/month use the due date', () => {
    expect(convertDue(due('Every  Week', '2026-10-22')).repeat).toEqual({ type: 'weekly', days: [3] });
    expect(convertDue(due('every month', '2026-10-22')).repeat).toEqual({ type: 'monthly', day: 22 });
  });

  it('bare every week/month without a date warn', () => {
    const r = convertDue({ date: '', string: 'every week', is_recurring: true });
    expect(r.repeat).toBeNull();
    expect(r.warning).toContain('every week');
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
    expect(text).toBe('# Tasks\n- [ ] Parent\n    - one\n    - two\n    - Child\n');
  });

  it('names the task in warnings', () => {
    const { warnings } = buildTasksMd([t({ content: 'Team sync', due: due('every 2nd tue') })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Team sync');
    expect(warnings[0]).toContain('every 2nd tue');
  });

  it('names the task and the original string when a time is dropped', () => {
    const { text, warnings } = buildTasksMd([
      t({ content: 'Gym', due: { date: '2026-10-18T07:00:00', string: 'Every 2 days at 7am', is_recurring: true } }),
    ]);
    expect(text).toBe('# Tasks\n- [ ] Gym 🔁 every 2 days 📅 2026-10-18\n');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"Gym"');
    expect(warnings[0]).toContain('"Every 2 days at 7am"');
  });

  it('converts the fixture', () => {
    const { text, warnings } = buildTasksMd(fixture as TodoistTask[]);
    expect(text).toBe(
      '# Tasks\n' +
        '- [ ] Buy milk 📅 2026-10-20\n    - 2 litres\n    - semi-skimmed\n    - Check bank\n' +
        '- [ ] Pay rent 📅 2026-11-01\n' +
        '- [ ] Someday idea\n' +
        '- [ ] Water plants 🔁 every week on Monday, Thursday 📅 2026-10-18\n' +
        '- [ ] Team sync 📅 2026-10-20\n' +
        '- [ ] Take out the bins 🔁 every 2 weeks on Friday 📅 2026-10-23\n' +
        '- [ ] Stretch 🔁 every 2 days 📅 2026-10-18\n' +
        '- [ ] Replace the water filter 🔁 every 3 months 📅 2026-11-02\n',
    );
    expect(warnings).toHaveLength(3);
    expect(warnings[1]).toContain('"Take out the bins"');
    expect(warnings[1]).toContain('"every 2 weeks Fri at 6:00 pm"');
    expect(warnings[2]).toContain('"Stretch"');
    const titles = parseTasks(text).items.flatMap((i) => (i.kind === 'task' ? [i.task.title] : []));
    expect(titles).toEqual([
      'Buy milk', 'Pay rent', 'Someday idea', 'Water plants', 'Team sync', 'Take out the bins', 'Stretch',
      'Replace the water filter',
    ]);
  });

  it('flattens grandchildren into the top-level task, in order', () => {
    const { text } = buildTasksMd([
      t({ id: 'a', content: 'Top', description: 'd' }),
      t({ id: 'c', content: 'Grandchild', parent_id: 'b' }),
      t({ id: 'b', content: 'Child', parent_id: 'a' }),
      t({ id: 'e', content: 'Child2', parent_id: 'a' }),
      t({ id: 'o', content: 'Orphan', parent_id: 'missing' }),
    ]);
    expect(text).toBe(
      '# Tasks\n- [ ] Top\n    - d\n    - Child\n    - Grandchild\n    - Child2\n- [ ] Orphan\n',
    );
  });

  it('survives parent cycles without losing tasks', () => {
    const { text } = buildTasksMd([
      t({ id: 'x', content: 'X', parent_id: 'y' }),
      t({ id: 'y', content: 'Y', parent_id: 'x' }),
    ]);
    expect(text).toContain('- [ ] X');
  });

  it('warns when a subtask loses its description or due date', () => {
    const { warnings } = buildTasksMd([
      t({ id: 'a', content: 'Top' }),
      t({ id: 'b', content: 'Sub', parent_id: 'a', description: 'x' }),
      t({ id: 'c', content: 'Sub2', parent_id: 'a', due: due('20 Oct') }),
      t({ id: 'd', content: 'Plain', parent_id: 'a' }),
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Sub');
  });
});
