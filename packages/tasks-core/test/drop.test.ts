import { describe, expect, test } from 'vitest';
import {
  allTasks, bucketOf, parseDone, parseTasks, planDrop, setImportant, tasksInBucket, type State, type WeekCtx,
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

  test('someday onto tomorrow is dated tomorrow (#26)', () => {
    const s = make();
    const out = planDrop(s, idOf(s, POLISH), { bucket: 'tomorrow', beforeId: null }, fri);
    expect(out).toMatchObject({ kind: 'move', bucket: 'tomorrow' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, POLISH).date).toBe('2026-10-17');
  });

  test('an overdue task dropped within Today reorders and keeps its date (#26)', () => {
    let n = 0;
    const s: State = { doc: parseTasks(`${TEXT}- [ ] Pay the fine 📅 2026-10-12\n`, () => `id${++n}`), done: parseDone('') };
    const out = planDrop(s, idOf(s, 'Pay the fine'), { bucket: 'today', beforeId: idOf(s, DENTIST) }, fri);
    expect(out).toMatchObject({ kind: 'reorder', sameDate: false });
    if (out.kind !== 'reorder') return;
    expect(taskOf(out.state, 'Pay the fine').date).toBe('2026-10-12');
    expect(titles(out.state).slice(0, 2)).toEqual(['Pay the fine', DENTIST]);
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

describe('planDrop with Important (#19)', () => {
  test('reordering among tasks of the same flag and date reports both as same', () => {
    const s = make();
    const out = planDrop(s, idOf(s, INVOICE), { bucket: 'next', beforeId: idOf(s, WATER) }, fri);
    expect(out).toMatchObject({ kind: 'reorder', sameDate: true, sameFlag: true });
  });

  test('dropping a task before one with the other flag keeps its flag and reports it', () => {
    const s = setImportant(make(), idOf(make(), WATER), true);
    const out = planDrop(s, idOf(s, INVOICE), { bucket: 'next', beforeId: idOf(s, WATER) }, fri);
    expect(out).toMatchObject({ kind: 'reorder', sameDate: true, sameFlag: false });
    if (out.kind !== 'reorder') throw new Error('not a reorder');
    expect(taskOf(out.state, INVOICE).important).toBeFalsy();
    expect(taskOf(out.state, WATER).important).toBe(true);
  });
});

describe('Important, not urgent (#38)', () => {
  const GROUP_TEXT = `# Tasks
- [ ] Call the dentist 📅 2026-10-16
- [ ] Walk before the first coffee ⏫
- [ ] Learn Polish
- [ ] One tab at a time ⏫
- [ ] Notice the small wins ⏫
`;
  function group(): State {
    let n = 0;
    return { doc: parseTasks(GROUP_TEXT, () => `id${++n}`), done: parseDone('') };
  }
  const WALK = 'Walk before the first coffee';
  const TAB = 'One tab at a time';
  const WINS = 'Notice the small wins';

  test('important undated tasks are in the group, in file order', () => {
    const s = group();
    expect(bucketOf(taskOf(s, WALK), fri)).toBe('important');
    expect(bucketOf(taskOf(s, POLISH), fri)).toBe('someday');
    expect(tasksInBucket(s.doc, 'important', fri).map((t) => t.title)).toEqual([WALK, TAB, WINS]);
    expect(tasksInBucket(s.doc, 'someday', fri).map((t) => t.title)).toEqual([POLISH]);
  });

  test('dropping within the group reorders', () => {
    const s = group();
    const out = planDrop(s, idOf(s, WINS), { bucket: 'important', beforeId: idOf(s, WALK) }, fri);
    expect(out).toMatchObject({ kind: 'reorder', sameDate: true, sameFlag: true });
    if (out.kind !== 'reorder') return;
    expect(tasksInBucket(out.state.doc, 'important', fri).map((t) => t.title)).toEqual([WINS, WALK, TAB]);
  });

  test('dropping a dated task on the group clears its date and flags it, before the row given', () => {
    const s = group();
    const out = planDrop(s, idOf(s, DENTIST), { bucket: 'important', beforeId: idOf(s, TAB) }, fri);
    expect(out).toMatchObject({ kind: 'move', bucket: 'important' });
    if (out.kind !== 'move') return;
    expect(taskOf(out.state, DENTIST)).toMatchObject({ date: null, important: true });
    expect(tasksInBucket(out.state.doc, 'important', fri).map((t) => t.title)).toEqual([WALK, DENTIST, TAB, WINS]);
  });

  test('a group task dropped on Someday loses ⏫; one dropped on Today keeps it', () => {
    const s = group();
    const someday = planDrop(s, idOf(s, TAB), { bucket: 'someday', beforeId: null }, fri);
    if (someday.kind !== 'move') throw new Error(someday.kind);
    expect(taskOf(someday.state, TAB).important).toBeUndefined();
    expect(bucketOf(taskOf(someday.state, TAB), fri)).toBe('someday');
    const today = planDrop(s, idOf(s, TAB), { bucket: 'today', beforeId: null }, fri);
    if (today.kind !== 'move') throw new Error(today.kind);
    expect(taskOf(today.state, TAB)).toMatchObject({ date: '2026-10-16', important: true });
  });

  test('an important dated task moved to Someday keeps ⏫ and lands in the group', () => {
    const s = setImportant(group(), idOf(group(), DENTIST), true);
    const out = planDrop(s, idOf(s, DENTIST), { bucket: 'someday', beforeId: null }, fri);
    if (out.kind !== 'move') throw new Error(out.kind);
    expect(bucketOf(taskOf(out.state, DENTIST), fri)).toBe('important');
  });
});

describe('dropping on the group without a row puts the task last (#38 review)', () => {
  const TEXT2 = '# Tasks\n- [ ] Call the dentist 📅 2026-10-16\n- [ ] A ⏫\n- [ ] B ⏫\n- [ ] Tail\n';
  const make2 = (): State => {
    let n = 0;
    return { doc: parseTasks(TEXT2, () => `id${++n}`), done: parseDone('') };
  };
  const group = (s: State) => tasksInBucket(s.doc, 'important', fri).map((t) => t.title);

  test('a task from another bucket goes after the last group task', () => {
    const s = make2();
    const out = planDrop(s, idOf(s, DENTIST), { bucket: 'important', beforeId: null }, fri);
    if (out.kind !== 'move') throw new Error(out.kind);
    expect(group(out.state)).toEqual(['A', 'B', DENTIST]);
  });

  test('a group task dropped on the group itself moves to last place', () => {
    const s = make2();
    const out = planDrop(s, idOf(s, 'A'), { bucket: 'important', beforeId: null }, fri);
    expect(out).toMatchObject({ kind: 'reorder', sameDate: true, sameFlag: true });
    if (out.kind !== 'reorder') return;
    expect(group(out.state)).toEqual(['B', 'A']);
    expect(planDrop(out.state, idOf(out.state, 'A'), { bucket: 'important', beforeId: null }, fri)).toEqual({ kind: 'none' });
  });
});
