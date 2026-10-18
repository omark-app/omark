import { describe, expect, test } from 'vitest';
import {
  allTasks, bucketOf, parseDone, parseTasks, planDrop, type State, type WeekCtx,
} from '../src/index.ts';

const fri: WeekCtx = { today: '2026-10-16', weekStart: 0 };
const sun: WeekCtx = { today: '2026-10-18', weekStart: 0 };

// Friday 2026-10-16: today = 10-16, this week ends 10-18, next week 10-19..10-25, later from 10-26.
const TEXT = `# Tasks
- [ ] Call the dentist 📅 2026-10-16
- [ ] Water the plants 📅 2026-10-19
- [ ] Send the invoice 📅 2026-10-19
- [ ] Renew the passport 📅 2026-10-25
- [ ] Learn Polish
`;

function make(): State {
  let n = 0;
  return { doc: parseTasks(TEXT, () => `id${++n}`), done: parseDone('') };
}
const idOf = (s: State, title: string) => allTasks(s.doc).find((t) => t.title === title)!.id;
const titles = (s: State) => s.doc.items.map((i) => (i.kind === 'task' ? i.task.title : '?'));
const taskOf = (s: State, title: string) => allTasks(s.doc).find((t) => t.title === title)!;

const DENTIST = 'Call the dentist';
const WATER = 'Water the plants';
const INVOICE = 'Send the invoice';
const PASSPORT = 'Renew the passport';
const POLISH = 'Learn Polish';

describe('planDrop', () => {
  test('same bucket, no beforeId is none', () => {
    const s = make();
    expect(planDrop(s, idOf(s, WATER), { bucket: 'next', beforeId: null }, fri)).toEqual({ kind: 'none' });
  });

  test('dropping onto itself is none', () => {
    const s = make();
    const id = idOf(s, WATER);
    expect(planDrop(s, id, { bucket: 'next', beforeId: id }, fri)).toEqual({ kind: 'none' });
  });

  test('unknown task id is none', () => {
    const s = make();
    expect(planDrop(s, 'nope', { bucket: 'today', beforeId: null }, fri)).toEqual({ kind: 'none' });
  });

  test('before a same-date task in the same bucket reorders and changes line order', () => {
    const s = make();
    const out = planDrop(s, idOf(s, INVOICE), { bucket: 'next', beforeId: idOf(s, WATER) }, fri);
    expect(out.kind).toBe('reorder');
    if (out.kind !== 'reorder') return;
    expect(out.sameDate).toBe(true);
    expect(titles(out.state)).toEqual(['Call the dentist', INVOICE, WATER, PASSPORT, POLISH]);
    expect(taskOf(out.state, INVOICE).date).toBe('2026-10-19');
  });

  test('before a different-date task in the same bucket reorders, keeps the date, sameDate false', () => {
    const s = make();
    const out = planDrop(s, idOf(s, PASSPORT), { bucket: 'next', beforeId: idOf(s, WATER) }, fri);
    expect(out.kind).toBe('reorder');
    if (out.kind !== 'reorder') return;
    expect(out.sameDate).toBe(false);
    expect(titles(out.state)).toEqual(['Call the dentist', PASSPORT, WATER, INVOICE, POLISH]);
    expect(taskOf(out.state, PASSPORT).date).toBe('2026-10-25');
  });

  test('someday onto today is a move dated today', () => {
    const s = make();
    const out = planDrop(s, idOf(s, POLISH), { bucket: 'today', beforeId: null }, fri);
    expect(out).toMatchObject({ kind: 'move', bucket: 'today' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, POLISH).date).toBe('2026-10-16');
  });

  test('someday onto week is dated this Sunday', () => {
    const s = make();
    const out = planDrop(s, idOf(s, POLISH), { bucket: 'week', beforeId: null }, fri);
    expect(out).toMatchObject({ kind: 'move', bucket: 'week' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, POLISH).date).toBe('2026-10-18');
  });

  test('today onto someday clears the date', () => {
    const s = make();
    const out = planDrop(s, idOf(s, DENTIST), { bucket: 'someday', beforeId: null }, fri);
    expect(out).toMatchObject({ kind: 'move', bucket: 'someday' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, DENTIST).date).toBeNull();
  });

  test('someday onto next with beforeId is dated next Sunday and placed before the target', () => {
    const s = make();
    const out = planDrop(s, idOf(s, POLISH), { bucket: 'next', beforeId: idOf(s, PASSPORT) }, fri);
    expect(out).toMatchObject({ kind: 'move', bucket: 'next' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, POLISH).date).toBe('2026-10-25');
    const order = titles(out.state);
    expect(order.indexOf(POLISH)).toBe(order.indexOf(PASSPORT) - 1);
  });

  test('onto later gives pickDate suggesting the day after next Sunday, keeping beforeId', () => {
    const s = make();
    const before = idOf(s, WATER);
    expect(planDrop(s, idOf(s, POLISH), { bucket: 'later', beforeId: before }, fri)).toEqual({
      kind: 'pickDate', suggested: '2026-10-26', beforeId: before,
    });
    expect(planDrop(s, idOf(s, POLISH), { bucket: 'later', beforeId: null }, fri)).toEqual({
      kind: 'pickDate', suggested: '2026-10-26', beforeId: null,
    });
  });

  test('onto overdue does nothing', () => {
    const s = make();
    expect(planDrop(s, idOf(s, POLISH), { bucket: 'overdue', beforeId: null }, fri)).toEqual({ kind: 'none' });
  });

  test('on Sunday, dropping onto week moves the task into the today bucket', () => {
    const s = make();
    const id = idOf(s, POLISH);
    const out = planDrop(s, id, { bucket: 'week', beforeId: null }, sun);
    expect(out).toMatchObject({ kind: 'move', bucket: 'week' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, POLISH).date).toBe('2026-10-18');
    expect(bucketOf(taskOf(out.state, POLISH), sun)).toBe('today');
  });
});
