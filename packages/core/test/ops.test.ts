import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  addTask, allTasks, completeTask, deleteTask, editTask, findTask, moveToBucket, parseDone, parseTasks,
  computeStats, reorder, serializeDone, serializeTasks, setAlways, setDate, setRepeat, toBlocks, type State,
  type WeekCtx,
} from '../src/index.ts';

const TODAY = '2026-10-16';
const fri: WeekCtx = { today: TODAY, weekStart: 0 };
const spec = readFileSync(new URL('./fixtures/spec-example.md', import.meta.url), 'utf8');

function make(): State {
  let n = 0;
  return { doc: parseTasks(spec, () => `id${++n}`), done: parseDone('') };
}
const idOf = (s: State, title: string) => allTasks(s.doc).find((t) => t.title === title)!.id;
const titles = (s: State) => s.doc.items.map((i) => (i.kind === 'task' ? i.task.title : '?'));

/** Runs op on a fresh state, asserting the input is not mutated. */
function pure<T>(op: (s: State) => T): T {
  const s = make();
  const before = structuredClone(s);
  const out = op(s);
  expect(s).toEqual(before);
  return out;
}

const INVOICE = 'Send the invoice';
const WATER = 'Water the plants';
const DENTIST = 'Call the dentist about the crown';
const POLISH = 'Learn Polish sign language';

describe('findTask', () => {
  test('finds by id, null when unknown', () => {
    const s = make();
    expect(findTask(s, idOf(s, INVOICE))?.title).toBe(INVOICE);
    expect(findTask(s, 'nope')).toBeNull();
  });
});

describe('addTask', () => {
  test('appends a trimmed task dated for the bucket', () => {
    const r = pure((s) => addTask(s, '  Buy milk ', 'today', fri, () => 'new1'))!;
    expect(r.id).toBe('new1');
    const last = r.state.doc.items.at(-1)!;
    expect(last.kind === 'task' && last.task).toMatchObject({
      id: 'new1', title: 'Buy milk', date: TODAY, notes: [], repeat: null, raw: null, rawKey: null,
    });
    expect(r.state.doc.items).toHaveLength(make().doc.items.length + 1);
  });
  test('blank title gives null', () => {
    expect(pure((s) => addTask(s, '   ', 'today', fri))).toBeNull();
  });
  test('someday has no date; default id generator works', () => {
    const r = pure((s) => addTask(s, 'x', 'someday', fri))!;
    expect(findTask(r.state, r.id)?.date).toBeNull();
  });
});

describe('moveToBucket / setDate / reorder', () => {
  test('buckets set dates', () => {
    const id = idOf(make(), INVOICE);
    expect(findTask(pure((s) => moveToBucket(s, id, 'someday', fri)), id)!.date).toBeNull();
    expect(findTask(pure((s) => moveToBucket(s, id, 'next', fri)), id)!.date).toBe('2026-10-25');
    expect(findTask(pure((s) => moveToBucket(s, id, 'week', fri)), id)!.date).toBe('2026-10-18');
    expect(findTask(pure((s) => moveToBucket(s, id, 'today', fri)), id)!.date).toBe(TODAY);
  });
  test('beforeId places the item directly before it', () => {
    const base = make();
    const id = idOf(base, POLISH);
    const before = idOf(base, WATER);
    const s = pure((s) => moveToBucket(s, id, 'next', fri, before));
    expect(titles(s)).toEqual([DENTIST, POLISH, WATER, INVOICE]);
    const s2 = pure((s) => setDate(s, id, '2026-11-01', before));
    expect(titles(s2)[1]).toBe(POLISH);
    expect(findTask(s2, id)!.date).toBe('2026-11-01');
  });
  test('beforeId equal to id or unknown does not move', () => {
    const base = make();
    const id = idOf(base, INVOICE);
    expect(titles(pure((s) => setDate(s, id, null, id)))).toEqual(titles(base));
    expect(titles(pure((s) => setDate(s, id, null, 'zzz')))).toEqual(titles(base));
  });
  test('raw items keep their relative order', () => {
    let n = 0;
    const s: State = {
      doc: parseTasks('# Tasks\n- [ ] a\nnote line\n- [ ] b\n- [x] c ✅ 2026-10-01\n- [ ] d\n', () => `k${++n}`),
      done: parseDone(''),
    };
    const before = structuredClone(s);
    const r = reorder(s, 'k3', 'k1');
    expect(s).toEqual(before);
    expect(r.doc.items.map((i) => (i.kind === 'task' ? i.task.title : i.kind))).toEqual(['d', 'a', 'raw', 'b', 'done']);
    expect(reorder(s, 'k1', 'k1')).toEqual(s);
    expect(reorder(s, 'k1', 'nope')).toEqual(s);
    expect(reorder(s, 'nope', 'k1')).toEqual(s);
  });
  test('unknown id leaves state unchanged', () => {
    const s = make();
    expect(setDate(s, 'nope', TODAY)).toEqual(s);
    expect(moveToBucket(s, 'nope', 'today', fri)).toEqual(s);
  });
});

describe('completeTask', () => {
  test('one-off task moves to done.md', () => {
    const id = idOf(make(), INVOICE);
    const r = pure((s) => completeTask(s, id, TODAY));
    expect(r.next).toBeNull();
    expect(findTask(r.state, id)).toBeNull();
    expect(serializeDone(r.state.done)).toBe('- [x] Send the invoice ✅ 2026-10-16\n');
  });
  test('recurring task stays with its next date', () => {
    const id = idOf(make(), WATER);
    const r = pure((s) => completeTask(s, id, TODAY));
    expect(r.next).toBe('2026-10-26');
    expect(findTask(r.state, id)!.date).toBe('2026-10-26');
    expect(serializeDone(r.state.done)).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16\n');
  });
  test('unknown id', () => {
    const s = make();
    expect(completeTask(s, 'nope', TODAY)).toEqual({ state: s, next: null });
  });
  test('a one-off task takes its notes to done.md, uncounted (Ruling 44)', () => {
    const id = idOf(make(), DENTIST);
    const r = pure((s) => completeTask(s, id, TODAY));
    expect(findTask(r.state, id)).toBeNull();
    const text = serializeDone(r.state.done);
    expect(text).toBe(
      '- [x] Call the dentist about the crown ✅ 2026-10-16\n    - ask about zirconia\n    - bring the old x-ray\n',
    );
    // It reads back the same way: one entry, the notes as uncounted lines.
    const back = parseDone(text);
    expect(back.lines.map((l) => l.entry?.title ?? null)).toEqual(['Call the dentist about the crown', null, null]);
    expect(computeStats(back, TODAY).all).toBe(1);
    expect(toBlocks(text)).toEqual([text.trimEnd()]);
  });
  test('hand-written note lines go to done.md as written; edited notes canonically (Ruling 44)', () => {
    const s0: State = {
      doc: parseTasks('# Tasks\n- [ ] Trip\n    - [ ] pack\n        - socks\n\t* tab note\n'),
      done: parseDone(''),
    };
    const id = allTasks(s0.doc)[0]!.id;
    expect(serializeDone(completeTask(s0, id, TODAY).state.done)).toBe(
      '- [x] Trip ✅ 2026-10-16\n    - [ ] pack\n        - socks\n\t* tab note\n',
    );
    const edited = editTask(s0, id, { title: 'Trip', notes: ['passport'] });
    expect(serializeDone(completeTask(edited, id, TODAY).state.done)).toBe('- [x] Trip ✅ 2026-10-16\n    - passport\n');
  });
  test('a repeating task keeps its notes in tasks.md and copies none (Ruling 44)', () => {
    const s0: State = {
      doc: parseTasks('# Tasks\n- [ ] Water 🔁 every week on Monday 📅 2026-10-19\n    - the ferns too\n'),
      done: parseDone(''),
    };
    const id = allTasks(s0.doc)[0]!.id;
    const r = completeTask(s0, id, '2026-10-19');
    expect(serializeDone(r.state.done)).toBe('- [x] Water 🔁 every week on Monday ✅ 2026-10-19\n');
    expect(serializeTasks(r.state.doc)).toBe(
      '# Always\n\n# Tasks\n- [ ] Water 🔁 every week on Monday 📅 2026-10-26\n    - the ferns too\n',
    );
  });
});

describe('deleteTask', () => {
  test('removes without touching done', () => {
    const id = idOf(make(), INVOICE);
    const s = pure((s) => deleteTask(s, id));
    expect(findTask(s, id)).toBeNull();
    expect(s.done.lines).toEqual([]);
    expect(deleteTask(s, 'nope')).toEqual(s);
  });
});

describe('editTask', () => {
  test('only that task changes on disk', () => {
    const id = idOf(make(), INVOICE);
    const s = pure((s) => editTask(s, id, { title: ' Send invoice now ', notes: ['to Anna'] }));
    expect(serializeTasks(s.doc)).toBe(
      spec.replace('- [ ] Send the invoice 📅 2026-10-19', '- [ ] Send invoice now 📅 2026-10-19\n    - to Anna'),
    );
  });
  test('blank title or unknown id is ignored', () => {
    const id = idOf(make(), INVOICE);
    const s = make();
    expect(editTask(s, id, { title: '  ', notes: [] })).toEqual(s);
    expect(editTask(s, 'nope', { title: 'x', notes: [] })).toEqual(s);
  });
});

describe('setRepeat', () => {
  test('fits the date to the rule', () => {
    const id = idOf(make(), DENTIST); // due 2026-10-16 (Fri)
    const s = pure((s) => setRepeat(s, id, { type: 'weekly', days: [0] }, TODAY));
    expect(findTask(s, id)).toMatchObject({ date: '2026-10-19', repeat: { type: 'weekly', days: [0] } });
  });
  test('undated task gets a date from today', () => {
    const id = idOf(make(), POLISH);
    const s = pure((s) => setRepeat(s, id, { type: 'daily' }, TODAY));
    expect(findTask(s, id)!.date).toBe(TODAY);
  });
  test('null removes the rule and keeps the date', () => {
    const id = idOf(make(), WATER);
    const s = pure((s) => setRepeat(s, id, null, TODAY));
    expect(findTask(s, id)).toMatchObject({ date: '2026-10-19', repeat: null });
    expect(setRepeat(s, 'nope', null, TODAY)).toEqual(s);
  });
});

describe('setAlways', () => {
  test('trims and drops blanks', () => {
    const s = pure((s) => setAlways(s, ['a', ' ', ' b ']));
    expect(s.doc.always).toEqual(['a', 'b']);
    expect(serializeTasks(s.doc)).toContain('# Always\n- a\n- b\n');
  });
});
