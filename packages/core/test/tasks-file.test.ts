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
  const crlf = '\uFEFF' + SPEC.replace(/\n/g, '\r\n');
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

test('N-interval rules are written canonically and read back', () => {
  const doc = parseTasks('# Always\n\n# Tasks\n');
  const mk = (id: string, title: string, repeat: Task['repeat'], date: string): Item => ({
    kind: 'task',
    task: { id, title, notes: [], date, repeat, raw: null, rawKey: null },
  });
  const text = serializeTasks({
    ...doc,
    items: [
      mk('a', 'Bins', { type: 'weekly', days: [4], n: 2 }, '2026-10-23'),
      mk('b', 'Filter', { type: 'every', n: 3, unit: 'months' }, '2026-11-02'),
      mk('c', 'Review', { type: 'monthly', day: 18, n: 3 }, '2026-10-18'),
    ],
  });
  expect(text).toBe(
    '# Always\n\n# Tasks\n' +
      '- [ ] Bins 🔁 every 2 weeks on Friday 📅 2026-10-23\n' +
      '- [ ] Filter 🔁 every 3 months 📅 2026-11-02\n' +
      '- [ ] Review 🔁 every 3 months on the 18th 📅 2026-10-18\n',
  );
  expect(tasksOf(parseTasks(text)).map((t) => t.repeat)).toEqual([
    { type: 'weekly', days: [4], n: 2 },
    { type: 'every', n: 3, unit: 'months' },
    { type: 'monthly', day: 18, n: 3 },
  ]);
  expect(serializeTasks(parseTasks(text))).toBe(text);
});

test('every existing rule wording still round-trips byte-for-byte, as read and when rewritten', () => {
  const lines = [
    '- [ ] A 🔁 every day 📅 2026-10-16',
    '- [ ] B 🔁 every weekday 📅 2026-10-16',
    '- [ ] C 🔁 every week on Monday, Thursday 📅 2026-10-19',
    '- [ ] D 🔁 every month on the 15th 📅 2026-11-15',
    '- [ ] E 🔁 every year 📅 2027-01-01',
    '- [ ] F 🔁 every 3 days 📅 2026-10-19',
    '- [ ] G 🔁 every 2 weeks 📅 2026-10-30',
    '- [ ] H 🔁 every 3 days when done 📅 2026-10-19',
  ];
  const text = `# Always\n\n# Tasks\n${lines.join('\n')}\n`;
  const doc = parseTasks(text);
  expect(serializeTasks(doc)).toBe(text);
  // Dropping raw forces the canonical writer; the lines must not change.
  const fresh = {
    ...doc,
    items: doc.items.map((i) => (i.kind === 'task' ? { ...i, task: { ...i.task, raw: null, rawKey: null } } : i)),
  };
  expect(serializeTasks(fresh)).toBe(text);
});

test('an out-of-range interval stays in the title and round-trips byte-for-byte', () => {
  const lines = [
    '- [ ] Bins 🔁 every 1000000000 weeks on Friday 📅 2026-10-23',
    '- [ ] Filter 🔁 every 1000000000 months 📅 2026-11-02',
    '- [ ] Odd 🔁 every 5000 days',
  ];
  const text = `# Always\n\n# Tasks\n${lines.join('\n')}\n`;
  const doc = parseTasks(text);
  expect(tasksOf(doc).map((t) => [t.title, t.repeat, t.date])).toEqual([
    ['Bins 🔁 every 1000000000 weeks on Friday', null, '2026-10-23'],
    ['Filter 🔁 every 1000000000 months', null, '2026-11-02'],
    ['Odd 🔁 every 5000 days', null, null],
  ]);
  expect(serializeTasks(doc)).toBe(text);
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
      entry: { title: 'Done thing', repeat: null, doneOn: '2026-10-15', notes: [] },
      date: null,
      raw: ['- [x] Done thing ✅ 2026-10-15'],
    },
  ]);
});

test('a completed recurring line keeps its rule', () => {
  const doc = parseTasks('# Tasks\n- [x] Water 🔁 every week on Monday ✅ 2026-10-19\n    - a note\n');
  expect(doc.items).toEqual([
    {
      kind: 'done',
      entry: { title: 'Water', repeat: { type: 'weekly', days: [0] }, doneOn: '2026-10-19', notes: ['a note'] },
      date: null,
      raw: ['- [x] Water 🔁 every week on Monday ✅ 2026-10-19', '    - a note'],
    },
  ]);
});

test('a done item keeps its due date', () => {
  const doc = parseTasks('# Tasks\n- [x] Water 🔁 every week on Monday 📅 2026-10-19\n');
  expect(doc.items[0]).toMatchObject({ kind: 'done', date: '2026-10-19', entry: { doneOn: null } });
});

test('a completed line with no done date is a done item with doneOn null', () => {
  const text = '# Always\n\n# Tasks\n- [x] No date\n- [X] Weekly 🔁 every week on Monday\n';
  const doc = parseTasks(text);
  expect(doc.items).toEqual([
    { kind: 'done', entry: { title: 'No date', repeat: null, doneOn: null, notes: [] }, date: null, raw: ['- [x] No date'] },
    {
      kind: 'done',
      entry: { title: 'Weekly', repeat: { type: 'weekly', days: [0] }, doneOn: null, notes: [] },
      date: null,
      raw: ['- [X] Weekly 🔁 every week on Monday'],
    },
  ]);
  expect(serializeTasks(doc)).toBe(text);
});

test('the last valid date wins and earlier ones stay in the title', () => {
  const doc = parseTasks('# Tasks\n- [ ] A 📅 2026-10-16 📅 2026-10-17\n');
  const a = byTitle(doc, 'A 📅 2026-10-16');
  expect(a.date).toBe('2026-10-17');
  const out = serializeTasks(withTask(doc, a.id, { date: '2026-10-20' }));
  expect(out).toContain('- [ ] A 📅 2026-10-16 📅 2026-10-20\n');
  expect(byTitle(parseTasks(out), 'A 📅 2026-10-16').date).toBe('2026-10-20');
});

test('the last valid rule wins and earlier ones stay in the title', () => {
  const doc = parseTasks('# Tasks\n- [ ] B 🔁 every day 🔁 every week on Monday\n');
  const b = byTitle(doc, 'B 🔁 every day');
  expect(b.repeat).toEqual({ type: 'weekly', days: [0] });
  const out = serializeTasks(withTask(doc, b.id, { repeat: { type: 'every', n: 2, unit: 'weeks' } }));
  expect(byTitle(parseTasks(out), 'B 🔁 every day').repeat).toEqual({ type: 'every', n: 2, unit: 'weeks' });
});

test('edited date and repeat read back as edited after a rewrite', () => {
  const doc = parseTasks(MESSY);
  const edits = { date: '2026-11-02', repeat: { type: 'monthly', day: 2 } } as const;
  for (const title of ['Fix bike ⏫ #home', 'Pay', 'Plants', 'Groceries', 'Odd 🔁 every 2nd tue']) {
    const t = byTitle(doc, title);
    const back = byTitle(parseTasks(serializeTasks(withTask(doc, t.id, { ...edits }))), title);
    expect(back.date).toBe('2026-11-02');
    expect(back.repeat).toEqual({ type: 'monthly', day: 2 });
  }
});

test('a rule ends at a tag, which stays in the title', () => {
  const doc = parseTasks('# Tasks\n- [ ] Plants 🔁 every week on Monday #garden\n');
  const [t] = tasksOf(doc);
  expect(t).toMatchObject({ title: 'Plants #garden', repeat: { type: 'weekly', days: [0] } });
});

test('a rule ends at another Obsidian Tasks field emoji', () => {
  const doc = parseTasks('# Tasks\n- [ ] Bins 🔁 every week on Tuesday ⏫\n- [ ] Gym 🔁 every 2 days 🛫 2026-10-01\n');
  const [bins, gym] = tasksOf(doc);
  expect(bins).toMatchObject({ title: 'Bins ⏫', repeat: { type: 'weekly', days: [1] } });
  expect(gym).toMatchObject({ title: 'Gym 🛫 2026-10-01', repeat: { type: 'every', n: 2, unit: 'days' } });
});

test('a doc built from scratch with alwaysRaw null serializes canonically', () => {
  const doc: TasksDoc = { preamble: [], always: ['Breathe'], items: [], alwaysRaw: null };
  expect(serializeTasks(doc)).toBe('# Always\n- Breathe\n\n# Tasks\n');
  expect(parseTasks('- [ ] A\n').alwaysRaw).toBeNull();
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

test('a rewrite that leaves the notes alone keeps the note lines verbatim (I5)', () => {
  const notes = ['    - [ ] pack', '        - socks', '\t- tab note', '    * star', '    + plus', '    1. step one'];
  const text = ['# Always', '', '# Tasks', '- [ ] Trip 📅 2026-10-19', ...notes, '- [ ] Other', ''].join('\n');
  const doc = parseTasks(text);
  const trip = byTitle(doc, 'Trip');
  // Moved, retitled and given a repeat: only the head line changes.
  const changed = withTask(doc, trip.id, {
    title: 'Trip north',
    date: '2026-10-26',
    repeat: { type: 'weekly', days: [0] },
  });
  const out = serializeTasks(changed);
  expect(out).toBe(
    ['# Always', '', '# Tasks', '- [ ] Trip north 🔁 every week on Monday 📅 2026-10-26', ...notes, '- [ ] Other', ''].join('\n'),
  );
  // It reads back to the same task, and a second rewrite is stable.
  const back = byTitle(parseTasks(out), 'Trip north');
  expect(back.notes).toEqual(trip.notes);
  expect(serializeTasks(parseTasks(out))).toBe(out);
});

test('edited notes are written canonically (I5)', () => {
  const text = '# Always\n\n# Tasks\n- [ ] Trip 📅 2026-10-19\n    - [ ] pack\n        - socks\n';
  const doc = parseTasks(text);
  const trip = byTitle(doc, 'Trip');
  const out = serializeTasks(withTask(doc, trip.id, { notes: [...trip.notes, 'passport'] }));
  expect(out).toBe('# Always\n\n# Tasks\n- [ ] Trip 📅 2026-10-19\n    - [ ] pack\n    - socks\n    - passport\n');
});
