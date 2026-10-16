import { expect, test } from 'vitest';
import {
  doneLine, parseDone, parseTasks, serializeDone, serializeTasks, sweepCompleted,
  type DoneDoc, type State, type Task,
} from '../src/index.ts';

const SPEC = '- [x] Send the invoice ✅ 2026-10-16\n- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19\n';

const task = (title: string, repeat: Task['repeat'] = null): Task =>
  ({ id: 'a', title, notes: [], date: null, repeat, raw: null, rawKey: null });

test('spec block round-trips and parses entries', () => {
  const d = parseDone(SPEC);
  expect(serializeDone(d)).toBe(SPEC);
  expect(d.lines.map((l) => l.entry)).toEqual([
    { title: 'Send the invoice', repeat: null, doneOn: '2026-10-16' },
    { title: 'Water the plants', repeat: { type: 'weekly', days: [0] }, doneOn: '2026-10-19' },
  ]);
});

test('garbage, blank and undated lines keep entry null; LF-terminated files round-trip', () => {
  const text = '\r\n- [x] no date\nrandom\n\n- [ ] open ✅ 2026-10-16\n- [x] last ✅ 2026-10-17\n';
  const d = parseDone('﻿' + text);
  expect(d.lines.map((l) => l.entry === null)).toEqual([true, true, true, true, true, false]);
  expect(serializeDone(d)).toBe(text.replace(/\r\n/g, '\n'));
  for (const t of ['', '\n', '\n\n', 'a\n']) expect(serializeDone(parseDone(t))).toBe(t);
});

test('a missing final newline is normalised on write', () => {
  expect(serializeDone(parseDone('x'))).toBe('x\n');
});

test('spread-append onto a doc that lacked a final newline ends with exactly one newline', () => {
  const d = parseDone('- [x] A ✅ 2026-10-01');
  const out = serializeDone({ ...d, lines: [...d.lines, doneLine(task('B'), '2026-10-16')] });
  expect(out).toBe('- [x] A ✅ 2026-10-01\n- [x] B ✅ 2026-10-16\n');
});

test('doneLine writes the canonical line', () => {
  const t = task('Water the plants', { type: 'weekly', days: [0] });
  expect(doneLine(t, '2026-10-16').raw).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16');
  expect(doneLine(task('Water the plants'), '2026-10-16')).toEqual({
    raw: '- [x] Water the plants ✅ 2026-10-16',
    entry: { title: 'Water the plants', repeat: null, doneOn: '2026-10-16' },
  });
});

const state = (tasks: string, done: DoneDoc = { lines: [] }): State => ({ doc: parseTasks(tasks), done });

test('sweepCompleted moves done items and leaves open tasks', () => {
  const s = state('# Tasks\n- [ ] Keep\n- [x] Finished ✅ 2026-10-15\n    - a note\n');
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(serializeTasks(r.doc)).toBe('# Always\n\n# Tasks\n- [ ] Keep\n');
  expect(r.done.lines.map((l) => l.raw)).toEqual(['- [x] Finished ✅ 2026-10-15', '    - a note']);
  expect(sweepCompleted(state('# Tasks\n- [ ] Keep\n'), '2026-10-16')).toBeNull();
});

test('undated done items are stamped with today and appended after existing lines', () => {
  const s = state('# Tasks\n- [x] Ticked in Obsidian\n', parseDone('- [x] Old ✅ 2026-10-01'));
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(serializeDone(r.done)).toBe('- [x] Old ✅ 2026-10-01\n- [x] Ticked in Obsidian ✅ 2026-10-16\n');
  expect(r.done.lines.at(-1)!.entry?.doneOn).toBe('2026-10-16');
});

test('an undated item keeps its notes after the stamped line', () => {
  const r = sweepCompleted(state('# Tasks\n- [x] Ticked\n    - keep me\n    - and me\n'), '2026-10-16')!;
  expect(r.done.lines.map((l) => l.raw)).toEqual(['- [x] Ticked ✅ 2026-10-16', '    - keep me', '    - and me']);
});

test('several done items among open tasks are swept in file order; repeats handled; inputs unchanged', () => {
  const src = [
    '# Tasks',
    '- [x] One ✅ 2026-10-14',
    '- [ ] Open1',
    '- [x] Two 🔁 every day ✅ 2026-10-15',
    '- [ ] Open2',
    '- [x] Three 🔁 every week on Monday',
    '- [x] Four',
    '',
  ].join('\n');
  const s = state(src, parseDone('- [x] Old ✅ 2026-10-01\n'));
  const before = structuredClone(s);
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(s).toEqual(before);
  expect(r.done.lines.map((l) => l.raw)).toEqual([
    '- [x] Old ✅ 2026-10-01',
    '- [x] One ✅ 2026-10-14',
    '- [x] Two 🔁 every day ✅ 2026-10-15',
    '- [x] Three 🔁 every week on Monday ✅ 2026-10-16',
    '- [x] Four ✅ 2026-10-16',
  ]);
  const titles = r.doc.items.flatMap((i) => (i.kind === 'task' ? [i.task.title] : []));
  expect(titles).toEqual(['Open1', 'Open2']);
  expect(r.doc.items.some((i) => i.kind === 'done')).toBe(false);
});
