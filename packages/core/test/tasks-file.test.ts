import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseTasks, serializeTasks, taskKey, type Item, type Task, type TasksDoc } from '../src/index.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const SPEC = fixture('spec-example.md');
const MESSY = fixture('messy.md');

function counter(): () => string {
  let n = 0;
  return () => `id${++n}`;
}

const tasksOf = (doc: TasksDoc): Task[] =>
  doc.items.flatMap((it) => (it.kind === 'task' ? [it.task] : []));

const byTitle = (doc: TasksDoc, title: string): Task => {
  const t = tasksOf(doc).find((x) => x.title === title);
  if (!t) throw new Error(`no task ${title}`);
  return t;
};

function withTask(doc: TasksDoc, id: string, patch: Partial<Task>): TasksDoc {
  return {
    ...doc,
    items: doc.items.map((it): Item =>
      it.kind === 'task' && it.task.id === id ? { kind: 'task', task: { ...it.task, ...patch } } : it,
    ),
  };
}

test('fixtures are LF-only', () => {
  expect(SPEC).not.toContain('\r');
  expect(MESSY).not.toContain('\r');
});

test('spec example round-trips byte-for-byte', () => {
  expect(serializeTasks(parseTasks(SPEC))).toBe(SPEC);
});

test('spec example parses to the expected tasks and always lines', () => {
  const doc = parseTasks(SPEC);
  const tasks = tasksOf(doc);
  expect(tasks).toHaveLength(4);
  expect(tasks[0]!.title).toBe('Call the dentist about the crown');
  expect(tasks[0]!.notes).toEqual(['ask about zirconia', 'bring the old x-ray']);
  expect(tasks[0]!.date).toBe('2026-10-16');
  expect(tasks[1]!.title).toBe('Water the plants');
  expect(tasks[1]!.repeat).toEqual({ type: 'weekly', days: [0] });
  expect(tasks[1]!.date).toBe('2026-10-19');
  expect(tasks[3]!.title).toBe('Learn Polish sign language');
  expect(tasks[3]!.date).toBeNull();
  expect(tasks[3]!.repeat).toBeNull();
  expect(doc.always).toEqual(['Walk before the first coffee', 'One tab at a time']);
  expect(doc.preamble).toEqual([]);
});

test('CRLF and BOM input parses to the same doc as LF', () => {
  const crlf = '﻿' + SPEC.replace(/\n/g, '\r\n');
  expect(crlf).toContain('\r\n');
  expect(parseTasks(crlf, counter())).toEqual(parseTasks(SPEC, counter()));
  expect(serializeTasks(parseTasks(crlf))).toBe(SPEC);
});

test('messy file round-trips byte-for-byte', () => {
  expect(serializeTasks(parseTasks(MESSY))).toBe(MESSY);
});

test('messy file parses fields wherever they sit', () => {
  const doc = parseTasks(MESSY);
  const fix = byTitle(doc, 'Fix bike ⏫ #home');
  expect(fix.date).toBe('2026-10-20');
  expect(fix.repeat).toBeNull();
  expect(byTitle(doc, 'Pay').date).toBe('2026-10-17');
  const plants = byTitle(doc, 'Plants');
  expect(plants.repeat).toEqual({ type: 'weekly', days: [0] });
  expect(plants.date).toBe('2026-10-19');
  expect(byTitle(doc, 'Groceries').notes).toEqual(['milk', 'eggs']);
  const odd = byTitle(doc, 'Odd 🔁 every 2nd tue');
  expect(odd.repeat).toBeNull();
  expect(odd.date).toBeNull();
  expect(tasksOf(doc)).toHaveLength(5);
});

test('messy file keeps preamble, always lines and unknown lines', () => {
  const doc = parseTasks(MESSY);
  expect(doc.preamble).toEqual(['---', 'tags: [tasks]', '---', 'Kept above the lists.', '']);
  expect(doc.always).toEqual(['Stretch   at noon', 'Drink water']);
  const raw = doc.items.flatMap((it) => (it.kind === 'raw' ? it.lines : []));
  expect(raw).toContain('## Errands');
  expect(raw).toContain('Free text the app does not understand.');
  expect(raw).toContain('trailing words');
  expect(raw).toContain('');
});

test('editing one task rewrites only that task in canonical form', () => {
  const doc = parseTasks(MESSY);
  const pay = byTitle(doc, 'Pay');
  const out = serializeTasks(withTask(doc, pay.id, { title: 'Pay rent' }));
  const before = MESSY.split('\n');
  const after = out.split('\n');
  expect(after).toHaveLength(before.length);
  const i = before.indexOf('- [ ] Pay 📅2026-10-17');
  expect(i).toBeGreaterThan(-1);
  expect(after[i]).toBe('- [ ] Pay rent 📅 2026-10-17');
  expect(after.filter((_, j) => j !== i)).toEqual(before.filter((_, j) => j !== i));
});

test('a changed task is written as title, repeat, date, then notes', () => {
  const doc = parseTasks(MESSY);
  const g = byTitle(doc, 'Groceries');
  const out = serializeTasks(
    withTask(doc, g.id, { repeat: { type: 'weekly', days: [5] }, date: '2026-10-24', notes: ['milk', 'bread'] }),
  );
  expect(out).toContain(
    '- [ ] Groceries 🔁 every week on Saturday 📅 2026-10-24\n    - milk\n    - bread\n- [ ] Odd',
  );
});

test('a new task without raw is written canonically', () => {
  const doc = parseTasks('# Always\n\n# Tasks\n');
  const task: Task = { id: 'n', title: 'New', notes: [], date: null, repeat: null, raw: null, rawKey: null };
  expect(serializeTasks({ ...doc, items: [...doc.items, { kind: 'task', task }] })).toBe(
    '# Always\n\n# Tasks\n- [ ] New\n',
  );
});

test('a file with no headings gives items only and gains canonical headings', () => {
  const doc = parseTasks('- [ ] A\n- [ ] B\n');
  expect(tasksOf(doc).map((t) => t.title)).toEqual(['A', 'B']);
  expect(doc.always).toEqual([]);
  expect(doc.preamble).toEqual([]);
  expect(serializeTasks(doc)).toBe('# Always\n\n# Tasks\n- [ ] A\n- [ ] B\n');
});

test('an empty file serializes to the first-run skeleton', () => {
  expect(serializeTasks(parseTasks(''))).toBe('# Always\n\n# Tasks\n');
});

test('a completed line in the Tasks section becomes a done item', () => {
  const doc = parseTasks('# Always\n\n# Tasks\n- [x] Done thing ✅ 2026-10-15\n');
  expect(doc.items).toEqual([
    {
      kind: 'done',
      entry: { title: 'Done thing', repeat: null, doneOn: '2026-10-15' },
      raw: ['- [x] Done thing ✅ 2026-10-15'],
    },
  ]);
});

test('a completed recurring line keeps its rule', () => {
  const doc = parseTasks('# Tasks\n- [x] Water 🔁 every week on Monday ✅ 2026-10-19\n    - a note\n');
  expect(doc.items).toEqual([
    {
      kind: 'done',
      entry: { title: 'Water', repeat: { type: 'weekly', days: [0] }, doneOn: '2026-10-19' },
      raw: ['- [x] Water 🔁 every week on Monday ✅ 2026-10-19', '    - a note'],
    },
  ]);
});

test('a completed line with no done date is kept as raw', () => {
  const text = '# Always\n\n# Tasks\n- [x] No date\n';
  const doc = parseTasks(text);
  expect(doc.items).toEqual([{ kind: 'raw', lines: ['- [x] No date'] }]);
  expect(serializeTasks(doc)).toBe(text);
});

test('ids come from the injected newId and are unique', () => {
  const doc = parseTasks(MESSY, counter());
  const ids = tasksOf(doc).map((t) => t.id);
  expect(ids).toEqual(['id1', 'id2', 'id3', 'id4', 'id5']);
  const a = tasksOf(parseTasks(SPEC)).map((t) => t.id);
  const b = tasksOf(parseTasks(SPEC)).map((t) => t.id);
  expect(new Set([...a, ...b]).size).toBe(8);
});

test('rawKey is taskKey of the parsed task, and raw is its original lines', () => {
  const doc = parseTasks(SPEC);
  const first = tasksOf(doc)[0]!;
  expect(first.rawKey).toBe(taskKey(first));
  expect(first.raw).toEqual([
    '- [ ] Call the dentist about the crown 📅 2026-10-16',
    '    - ask about zirconia',
    '    - bring the old x-ray',
  ]);
});

test('taskKey ignores repeat key order', () => {
  const base = { title: 'x', notes: [], date: null };
  expect(taskKey({ ...base, repeat: { type: 'every', n: 2, unit: 'weeks' } })).toBe(
    taskKey({ ...base, repeat: { unit: 'weeks', n: 2, type: 'every' } }),
  );
});

test('editing always lines rewrites the section canonically and keeps unknown lines', () => {
  const doc = parseTasks(MESSY);
  const out = serializeTasks({ ...doc, always: ['Drink water', 'Sleep'] });
  expect(out).toContain(
    'Kept above the lists.\n\n# Always\n- Drink water\n- Sleep\n* not a dash bullet\n\n# Tasks\nFree text',
  );
  expect(out.endsWith('trailing words\n\n')).toBe(true);
});

test('field spacing variants and an unparseable date', () => {
  const doc = parseTasks(
    '# Tasks\n- [ ] A 🔁 every day 📅 2026-10-16 tail\n- [ ] B 📅 2026-13-40\n- [ ] 🔁every 2 weeks📅2026-10-18\n',
  );
  const [a, b, c] = tasksOf(doc);
  expect(a).toMatchObject({ title: 'A tail', repeat: { type: 'daily' }, date: '2026-10-16' });
  expect(b).toMatchObject({ title: 'B 📅 2026-13-40', date: null });
  expect(c).toMatchObject({ title: '', repeat: { type: 'every', n: 2, unit: 'weeks' }, date: '2026-10-18' });
});

test('a Tasks heading without an Always heading', () => {
  const doc = parseTasks('Intro\n# Tasks\n- [ ] A\n');
  expect(doc.preamble).toEqual(['Intro']);
  expect(doc.always).toEqual([]);
  expect(serializeTasks(doc)).toBe('Intro\n# Always\n\n# Tasks\n- [ ] A\n');
});

test('a valid rule after an unparseable 🔁 in the title survives a rewrite', () => {
  const doc = parseTasks(MESSY);
  const odd = byTitle(doc, 'Odd 🔁 every 2nd tue');
  const out = serializeTasks(withTask(doc, odd.id, { repeat: { type: 'daily' } }));
  expect(out).toContain('- [ ] Odd 🔁 every 2nd tue 🔁 every day\n');
  expect(byTitle(parseTasks(out), 'Odd 🔁 every 2nd tue').repeat).toEqual({ type: 'daily' });
});
