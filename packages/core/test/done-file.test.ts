import { expect, test } from 'vitest';
import {
  doneLine, parseDone, parseTasks, serializeDone, serializeTasks, sweepCompleted,
  type DoneDoc, type State, type Task,
} from '../src/index.ts';

const SPEC = '- [x] Send the invoice ✅ 2026-10-16\n- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19\n';

test('spec block round-trips and parses entries', () => {
  const d = parseDone(SPEC);
  expect(serializeDone(d)).toBe(SPEC);
  expect(d.lines.map((l) => l.entry)).toEqual([
    { title: 'Send the invoice', repeat: null, doneOn: '2026-10-16' },
    { title: 'Water the plants', repeat: { type: 'weekly', days: [0] }, doneOn: '2026-10-19' },
  ]);
});

test('garbage, blank and undated lines keep entry null; odd files round-trip', () => {
  const text = '\r\n- [x] no date\nrandom\n\n- [ ] open ✅ 2026-10-16\n- [x] last ✅ 2026-10-17';
  const d = parseDone('\uFEFF' + text);
  expect(d.lines.map((l) => l.entry === null)).toEqual([true, true, true, true, true, false]);
  expect(serializeDone(d)).toBe(text.replace(/\r\n/g, '\n'));
  for (const t of ['', '\n', '\n\n', 'x']) expect(serializeDone(parseDone(t))).toBe(t);
});

test('doneLine writes the canonical line', () => {
  const task: Task = { id: 'a', title: 'Water the plants', notes: [], date: '2026-10-12',
    repeat: { type: 'weekly', days: [0] }, raw: null, rawKey: null };
  expect(doneLine(task, '2026-10-16').raw).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16');
  expect(doneLine({ ...task, repeat: null }, '2026-10-16')).toEqual({
    raw: '- [x] Water the plants ✅ 2026-10-16',
    entry: { title: 'Water the plants', repeat: null, doneOn: '2026-10-16' },
  });
});

const state = (tasks: string, done: DoneDoc = { lines: [] }): State => ({ doc: parseTasks(tasks), done });

test('sweepCompleted moves done items and leaves open tasks', () => {
  const s = state('# Tasks\n- [ ] Keep\n- [x] Finished ✅ 2026-10-15\n    - a note\n');
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(serializeTasks(r.doc)).toBe('# Always

# Tasks\n- [ ] Keep\n');
  expect(r.done.lines.map((l) => l.raw)).toEqual(['- [x] Finished ✅ 2026-10-15', '    - a note']);
  expect(sweepCompleted(state('# Tasks\n- [ ] Keep\n'), '2026-10-16')).toBeNull();
});

test('undated done items are stamped with today; appends after unterminated content', () => {
  const s = state('# Tasks\n- [x] Ticked in Obsidian\n', parseDone('- [x] Old ✅ 2026-10-01'));
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(serializeDone(r.done)).toBe('- [x] Old ✅ 2026-10-01\n- [x] Ticked in Obsidian ✅ 2026-10-16\n');
  expect(r.done.lines.at(-1)!.entry?.doneOn).toBe('2026-10-16');
});
