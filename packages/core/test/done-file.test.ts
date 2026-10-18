import { expect, test } from 'vitest';
import {
  computeStats, doneLine, doneLines, parseDone, parseTasks, serializeDone, serializeTasks, sweepCompleted,
  type DoneDoc, type State, type Task,
} from '../src/index.ts';

const SPEC = '- [x] Send the invoice ✅ 2026-10-16\n- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19\n';

const task = (title: string, repeat: Task['repeat'] = null): Task =>
  ({ id: 'a', title, notes: [], date: null, repeat, raw: null, rawKey: null });

test('spec block round-trips and parses entries', () => {
  const d = parseDone(SPEC);
  expect(serializeDone(d)).toBe(SPEC);
  expect(d.lines.map((l) => l.entry)).toEqual([
    { title: 'Send the invoice', repeat: null, doneOn: '2026-10-16', notes: [] },
    { title: 'Water the plants', repeat: { type: 'weekly', days: [0] }, doneOn: '2026-10-19', notes: [] },
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
    entry: { title: 'Water the plants', repeat: null, doneOn: '2026-10-16', notes: [] },
  });
});

test('doneLines appends the note lines as serializeTasks writes them; the entry carries their text', () => {
  const [t] = parseTasks('# Tasks\n- [ ] Trip\n    - passport\n\t* tickets\n').items.flatMap((i) =>
    i.kind === 'task' ? [i.task] : [],
  );
  const lines = doneLines(t!, '2026-10-16');
  expect(lines.map((l) => l.raw)).toEqual(['- [x] Trip ✅ 2026-10-16', '    - passport', '\t* tickets']);
  expect(lines.map((l) => l.entry?.notes ?? null)).toEqual([['passport', 'tickets'], null, null]);
  expect(doneLines(task('Bare'), '2026-10-16')).toEqual([doneLine(task('Bare'), '2026-10-16')]);
});

test('notes: indented lines under a done line are its notes, kept as uncounted lines', () => {
  const text = [
    '- [x] Old one-liner ✅ 2026-10-01',
    '- [x] Dentist ✅ 2026-10-16',
    '    - ask about zirconia',
    '\t* odd  marker  ',
    '        - nested',
    '',
    '    - after a blank line: a stray line, not a note',
    '- [x] no date',
    '    - under an invalid line',
    'free text',
    '- [x] Water 🔁 every day ✅ 2026-10-17',
    '    - ferns',
    '',
  ].join('\n');
  const d = parseDone(text);
  expect(serializeDone(d)).toBe(text);
  expect(d.lines.flatMap((l) => (l.entry ? [[l.entry.title, l.entry.notes]] : []))).toEqual([
    ['Old one-liner', []],
    ['Dentist', ['ask about zirconia', 'odd  marker', 'nested']],
    ['Water', ['ferns']],
  ]);
  expect(computeStats(d, '2026-10-18').all).toBe(3);
});

const state = (tasks: string, done: DoneDoc = { lines: [] }): State => ({ doc: parseTasks(tasks), done });

test('sweeping a ticked line with an out-of-range interval does not throw; it is a one-off', () => {
  const s: State = {
    doc: parseTasks('# Always\n\n# Tasks\n- [x] Bins 🔁 every 1000000000 weeks on Friday 📅 2026-10-23\n'),
    done: parseDone(''),
  };
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(r.doc.items).toEqual([]);
  expect(serializeDone(r.done)).toBe('- [x] Bins 🔁 every 1000000000 weeks on Friday ✅ 2026-10-16\n');
});

test('sweepCompleted moves done items and leaves open tasks', () => {
  const s = state('# Tasks\n- [ ] Keep\n- [x] Finished ✅ 2026-10-15\n    - a note\n');
  const r = sweepCompleted(s, '2026-10-16')!;
  expect(serializeTasks(r.doc)).toBe('# Always\n\n# Tasks\n- [ ] Keep\n');
  expect(r.done.lines.map((l) => l.raw)).toEqual(['- [x] Finished ✅ 2026-10-15', '    - a note']);
  expect(r.done.lines.map((l) => l.entry?.notes ?? null)).toEqual([['a note'], null]);
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
  expect(r.done.lines[0]!.entry?.notes).toEqual(['keep me', 'and me']);
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
  // The undated recurring tick stays in place as its next occurrence (I1).
  const titles = r.doc.items.flatMap((i) => (i.kind === 'task' ? [i.task.title] : []));
  expect(titles).toEqual(['Open1', 'Open2', 'Three']);
  expect(r.doc.items.some((i) => i.kind === 'done')).toBe(false);
});

test('an undated recurring tick is logged and stays in place as its next occurrence (I1)', () => {
  const src = [
    '# Always',
    '',
    '# Tasks',
    '- [ ] Before',
    '- [x] Water the plants 🔁 every week on Monday 📅 2026-10-19',
    '    - the ferns too',
    '\t- and the cactus',
    '- [ ] After',
    '',
  ].join('\n');
  const r = sweepCompleted(state(src), '2026-10-19')!;
  expect(serializeTasks(r.doc)).toBe(
    [
      '# Always',
      '',
      '# Tasks',
      '- [ ] Before',
      '- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-26',
      '    - the ferns too',
      '\t- and the cactus',
      '- [ ] After',
      '',
    ].join('\n'),
  );
  // The notes stay on the task, and the done line takes a copy, as written.
  expect(serializeDone(r.done)).toBe(
    '- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19\n    - the ferns too\n\t- and the cactus\n',
  );
  expect(r.done.lines[0]!.entry?.notes).toEqual(['the ferns too', 'and the cactus']);
  const water = r.doc.items.find((i) => i.kind === 'task' && i.task.title === 'Water the plants');
  expect(water?.kind === 'task' && water.task.notes).toEqual(['the ferns too', 'and the cactus']);
});

test('an undated recurring tick without a due date steps from today (I1)', () => {
  const r = sweepCompleted(state('# Tasks\n- [x] Rent 🔁 every month on the 1st\n'), '2026-10-16')!;
  expect(serializeTasks(r.doc)).toBe('# Always\n\n# Tasks\n- [ ] Rent 🔁 every month on the 1st 📅 2026-11-01\n');
  expect(serializeDone(r.done)).toBe('- [x] Rent 🔁 every month on the 1st ✅ 2026-10-16\n');
});

test('a dated recurring tick (Obsidian Tasks made the next one) is only moved (I1)', () => {
  const src =
    '# Tasks\n- [ ] Water 🔁 every week on Monday 📅 2026-10-26\n- [x] Water 🔁 every week on Monday 📅 2026-10-19 ✅ 2026-10-19\n';
  const r = sweepCompleted(state(src), '2026-10-19')!;
  expect(serializeTasks(r.doc)).toBe('# Always\n\n# Tasks\n- [ ] Water 🔁 every week on Monday 📅 2026-10-26\n');
  expect(serializeDone(r.done)).toBe('- [x] Water 🔁 every week on Monday 📅 2026-10-19 ✅ 2026-10-19\n');
});
