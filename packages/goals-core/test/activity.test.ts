import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { areaActivity, areas, linksArea, monthsBefore, parseGoals, type ActivityInput } from '../src/index.ts';

const spec = readFileSync(new URL('./fixtures/spec-example.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const TODAY = '2026-10-29';

const base: ActivityInput = { today: TODAY, staleAfter: 3 };
const at = (text: string, input: Partial<ActivityInput> = {}) => areaActivity(parseGoals(text), { ...base, ...input });

test('monthsBefore clamps to the month\'s last day', () => {
  expect(monthsBefore('2026-10-29', 3)).toBe('2026-07-29');
  expect(monthsBefore('2026-05-31', 3)).toBe('2026-02-28');
  expect(monthsBefore('2024-05-31', 3)).toBe('2024-02-29');
  expect(monthsBefore('2026-02-15', 24)).toBe('2024-02-15');
  expect(monthsBefore('2026-01-10', 1)).toBe('2025-12-10');
});

describe('sources', () => {
  test('a goal\'s ➕, ✏️ and ✅ count; the latest wins', () => {
    expect(at('## A #a\n- [ ] g ➕ 2026-01-01\n')[0]!.lastActivity).toBe('2026-01-01');
    expect(at('## A #a\n- [ ] g ✏️ 2026-05-01 ➕ 2026-01-01\n')[0]!.lastActivity).toBe('2026-05-01');
    expect(at('## A #a\n- [x] g ➕ 2026-01-01 ✅ 2026-06-01\n- [ ] h ➕ 2026-02-01\n')[0]!.lastActivity).toBe('2026-06-01');
    expect(at('## A #a\n- [ ] g 📅 2026-09-01\n')[0]!.lastActivity).toBeNull();
  });
  test('a completion tagged with the area tag or a linked code counts, ignoring case', () => {
    const text = '## Climbing #climbing\n- [ ] Trips #CLIMB ➕ 2025-01-01\n';
    expect(at(text, { done: [{ title: 'Hangboard #Climbing', doneOn: '2026-09-01' }] })[0]!.lastActivity).toBe('2026-09-01');
    expect(at(text, { done: [{ title: 'Book flights #climb', doneOn: '2026-09-02' }] })[0]!.lastActivity).toBe('2026-09-02');
    expect(at(text, { done: [{ title: 'Untagged', doneOn: '2026-09-03' }, { title: 'x #climbingx', doneOn: '2026-09-03' }] })[0]!.lastActivity)
      .toBe('2025-01-01');
    expect(at(text, { done: [{ title: 'No date #climbing', doneOn: null }] })[0]!.lastActivity).toBe('2025-01-01');
  });
  test('known hours on a linked code count; unknown rows and other codes don\'t', () => {
    const text = '## Climbing #climbing\n- [ ] Trips #CLIMB ➕ 2025-01-01\n';
    const row = (date: string, project: string, known = true) => ({ date, project, known });
    expect(at(text, { rows: [row('2026-10-01', 'CLIMB')] })[0]!.lastActivity).toBe('2026-10-01');
    expect(at(text, { rows: [row('2026-10-01', 'climb')] })[0]!.lastActivity).toBe('2026-10-01');
    expect(at(text, { rows: [row('2026-10-01', 'CLIMB', false), row('2026-10-02', 'WORK')] })[0]!.lastActivity).toBe('2025-01-01');
  });
  test('future dates are ignored; today counts', () => {
    const text = '## A #a\n- [ ] g #GYM ✏️ 2026-12-01 ➕ 2026-01-01\n';
    expect(at(text, {
      done: [{ title: '#a later', doneOn: '2026-11-01' }],
      rows: [{ date: '2026-10-30', project: 'GYM', known: true }],
    })[0]!.lastActivity).toBe('2026-01-01');
    expect(at(text, { rows: [{ date: TODAY, project: 'GYM', known: true }] })[0]!.lastActivity).toBe(TODAY);
  });
  test('a code on goals in two areas links to both', () => {
    const text = '## A #a\n- [ ] x #SHARED ➕ 2025-01-01\n## B #b\n- [ ] y #SHARED ➕ 2025-01-01\n## C #c\n- [ ] z ➕ 2025-01-01\n';
    const r = at(text, { done: [{ title: 'Work #SHARED', doneOn: '2026-10-01' }] });
    expect(r.map((a) => [a.codes, a.lastActivity])).toEqual([
      [['SHARED'], '2026-10-01'], [['SHARED'], '2026-10-01'], [[], '2025-01-01'],
    ]);
  });
  test('an untagged area links only its goals', () => {
    const r = at('## Untagged\n- [ ] x ➕ 2026-01-01\n', { done: [{ title: '#untagged', doneOn: '2026-10-01' }] });
    expect(r[0]).toMatchObject({ tag: null, lastActivity: '2026-01-01', linked: true });
  });
});

describe('needs update', () => {
  const goalOn = (d: string) => `## A #a\n- [ ] g ➕ ${d}\n`;
  test('older than the period is stale; exactly the period is not', () => {
    expect(at(goalOn('2026-07-29'))[0]!.needsUpdate).toBe(false);
    expect(at(goalOn('2026-07-28'))[0]!.needsUpdate).toBe(true);
    expect(at(goalOn('2026-07-28'), { staleAfter: 4 })[0]!.needsUpdate).toBe(false);
  });
  test('an area with nothing linked is not stale and not linked', () => {
    expect(at('## A #a\nJust a vision.\n')[0]).toEqual({ tag: 'a', codes: [], lastActivity: null, linked: false, needsUpdate: false });
  });
  test('an open task or habit with the area tag links it; with no dated activity yet it is not stale', () => {
    const r = at('## Family #family\n', { open: [{ title: 'Family nature weekend #family' }] });
    expect(r[0]).toMatchObject({ linked: true, lastActivity: null, needsUpdate: false });
  });
  test('with the project list given, only codes in it link', () => {
    const text = '## A #a\n- [ ] Learn #AI basics ➕ 2025-01-01\n- [ ] Two #WORK ➕ 2025-01-01\n';
    const done = [{ title: 'x #ai', doneOn: '2026-10-01' }];
    expect(at(text, { projects: ['work'], done })[0]).toMatchObject({ codes: ['WORK'], lastActivity: '2025-01-01' });
    expect(at(text, { done })[0]).toMatchObject({ codes: ['AI', 'WORK'], lastActivity: '2026-10-01' });
  });
  test('ticking a linked habit clears it', () => {
    const r = at('## Family #family\n', {
      open: [{ title: 'Walk #family' }],
      done: [{ title: 'Walk #family', doneOn: '2026-10-28' }],
    });
    expect(r[0]).toMatchObject({ linked: true, lastActivity: '2026-10-28', needsUpdate: false });
  });
  test('a formed habit: its completions still count, and the area goes stale once they age', () => {
    // The 🏆 line has no ✅ entry, so done.md's reader gives no completion for it; the habit left tasks.md.
    const done = [{ title: 'Walk #family', doneOn: '2026-06-01' }];
    expect(at('## Family #family\n', { done, today: '2026-08-01' })[0]).toMatchObject({ linked: true, needsUpdate: false });
    expect(at('## Family #family\n', { done, today: '2026-10-29' })[0]).toMatchObject({ linked: true, lastActivity: '2026-06-01', needsUpdate: true });
  });
  test('a busy area with old goals is not stale', () => {
    const r = at('## A #a\n- [ ] g #GYM ➕ 2024-01-01\n', { rows: [{ date: '2026-10-20', project: 'GYM', known: true }] });
    expect(r[0]!.needsUpdate).toBe(false);
  });
});

test('linksArea: the area tag or a code on its goals, ignoring case', () => {
  const [climbing] = areas(parseGoals(spec)).slice(1);
  expect(linksArea('Book flights to Kalymnos #CLIMB', climbing!)).toBe(true);
  expect(linksArea('Hangboard 🌱 #Climbing', climbing!)).toBe(true);
  expect(linksArea('Hangboard #climbingx', climbing!)).toBe(false);
});

test('the spec example: one result per area, in order', () => {
  const r = areaActivity(parseGoals(spec), { ...base, today: '2027-03-01' });
  expect(r.map((a) => [a.tag, a.codes, a.lastActivity, a.needsUpdate])).toEqual([
    ['place', [], '2026-10-28', true],
    ['climbing', ['CLIMB'], '2026-10-28', true],
  ]);
});
