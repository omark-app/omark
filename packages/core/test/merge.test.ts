import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  carryIds, merge3, mergeDoneText, mergeTasksText, parseTasks, serializeTasks, toBlocks,
  type Item, type Task, type TasksDoc,
} from '../src/index.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const BOM = String.fromCharCode(0xfeff);

/** A file as the serializers write it: LF line endings and one final newline. */
const md = (...lines: string[]) => lines.map((l) => `${l}\n`).join('');

const ALWAYS = ['# Always', '- Walk before the first coffee', '- One tab at a time', '', '# Tasks'];
const BUY = '- [ ] Buy oat milk 📅 2026-10-16';
const DENTIST = ['- [ ] Call the dentist about the crown 📅 2026-10-16', '    - ask about zirconia'];
const PASSPORT = '- [ ] Renew passport 📅 2026-11-02';
const DUNE = '- [ ] Read "Dune"';
const BASE = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE);

function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

const tasksOf = (doc: TasksDoc): Task[] => doc.items.flatMap((it) => (it.kind === 'task' ? [it.task] : []));
const idOf = (doc: TasksDoc, title: string): string => {
  const t = tasksOf(doc).find((x) => x.title === title);
  if (!t) throw new Error(`no task ${title}`);
  return t.id;
};

/** Merges with local and remote in both roles; a merge must not depend on which side changed. */
function mergeBothWays(base: string, x: string, y: string): [string, string] {
  return [mergeTasksText(base, x, y), mergeTasksText(base, y, x)];
}

// ---------- toBlocks ----------

test('toBlocks: a task or done line takes its indented lines; every other line is its own block', () => {
  const text = md(
    '# Always', '- Walk', '', '# Tasks', 'Free text', '## Errands',
    '- [ ] Groceries', '\t* milk', '    * eggs', '', '- [x] Old thing ✅ 2026-10-01', '    - note', '- [X] Shouty', 'trailing',
  );
  expect(toBlocks(text)).toEqual([
    '# Always', '- Walk', '', '# Tasks', 'Free text', '## Errands',
    '- [ ] Groceries\n\t* milk\n    * eggs', '', '- [x] Old thing ✅ 2026-10-01\n    - note', '- [X] Shouty', 'trailing',
  ]);
});

test('toBlocks: lines the parser does not read as tasks (Always section, preamble) stay one-line blocks', () => {
  // Before `# Tasks` the parser never reads `- [ ]` as a task, so neither does toBlocks.
  const text = md('- [ ] in the preamble', '    indented', '# Always', '- [ ] odd always line', '    more', '# Tasks', '- [ ] Real', '    - note');
  expect(toBlocks(text)).toEqual([
    '- [ ] in the preamble', '    indented', '# Always', '- [ ] odd always line', '    more', '# Tasks', '- [ ] Real\n    - note',
  ]);
  // With no headings at all (like done.md) the whole file is items.
  expect(toBlocks('- [x] A ✅ 2026-10-01\r\n  - n\r\n- [x] B ✅ 2026-10-02')).toEqual(['- [x] A ✅ 2026-10-01\n  - n', '- [x] B ✅ 2026-10-02']);
  expect(toBlocks('')).toEqual([]);
  expect(toBlocks(BOM + 'a\n')).toEqual(['a']);
});

// ---------- identity properties ----------

const SAMPLES = [
  '', '\n', '\n\n', 'a\n', BASE, fixture('spec-example.md'), fixture('messy.md'),
  md(...ALWAYS, BUY, BUY, '', '', DUNE, ''), md('- [x] A ✅ 2026-10-01', '- [x] A ✅ 2026-10-01', '- [x] B ✅ 2026-10-02'),
];

test('identity: merge3(x, x, x) = x, merge3(b, l, b) = l, merge3(b, b, r) = r', () => {
  for (const b of SAMPLES) {
    for (const x of SAMPLES) {
      const bb = toBlocks(b);
      const xb = toBlocks(x);
      expect(merge3(xb, xb, xb)).toEqual(xb);
      expect(merge3(bb, xb, bb)).toEqual(xb);
      expect(merge3(bb, bb, xb)).toEqual(xb);
    }
  }
});

test('identity on text: unchanged sides merge to the other side byte-for-byte', () => {
  for (const b of SAMPLES) {
    for (const x of SAMPLES) {
      // Samples are already serializer-shaped (LF, one final newline), so they come back unchanged.
      expect(mergeTasksText(x, x, x)).toBe(x);
      expect(mergeTasksText(b, x, b)).toBe(x);
      expect(mergeTasksText(b, b, x)).toBe(x);
      expect(mergeDoneText(b, x, b)).toBe(x);
      expect(mergeDoneText(b, b, x)).toBe(x);
    }
  }
});

// ---------- mergeTasksText ----------

test('an edit on only one side is applied', () => {
  const edited = md(...ALWAYS, '- [ ] Buy oat milk 📅 2026-10-18', ...DENTIST, PASSPORT, DUNE);
  for (const out of mergeBothWays(BASE, edited, BASE)) expect(out).toBe(edited);
});

test('a delete on one side with no change on the other is deleted', () => {
  const deleted = md(...ALWAYS, BUY, PASSPORT, DUNE);
  for (const out of mergeBothWays(BASE, deleted, BASE)) expect(out).toBe(deleted);
});

test('adds on both sides are both kept', () => {
  const local = md(...ALWAYS, '- [ ] Book flights', BUY, ...DENTIST, PASSPORT, DUNE);
  const remote = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '- [ ] Pay the electricity bill 📅 2026-10-20');
  expect(mergeTasksText(BASE, local, remote)).toBe(
    md(...ALWAYS, '- [ ] Book flights', BUY, ...DENTIST, PASSPORT, DUNE, '- [ ] Pay the electricity bill 📅 2026-10-20'),
  );
  // Both sides adding at the same spot: local's first, then remote's.
  const l2 = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '- [ ] Book flights');
  expect(mergeTasksText(BASE, l2, remote)).toBe(
    md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '- [ ] Book flights', '- [ ] Pay the electricity bill 📅 2026-10-20'),
  );
});

test('the same task edited differently on each side gives both versions, adjacent', () => {
  const local = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE);
  const remote = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport and ID card 📅 2026-11-02', DUNE);
  expect(mergeTasksText(BASE, local, remote)).toBe(
    md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', '- [ ] Renew passport and ID card 📅 2026-11-02', DUNE),
  );
});

test('deleted on one side and edited on the other keeps the edited version', () => {
  const deleted = md(...ALWAYS, BUY, ...DENTIST, DUNE);
  const edited = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE);
  for (const out of mergeBothWays(BASE, deleted, edited)) expect(out).toBe(edited);
});

test('a task completed on one side (gone from tasks.md) while edited on the other keeps the edited version', () => {
  // Completing moves the task to done.md, so tasks.md just loses the block, notes and all.
  const completed = md(...ALWAYS, BUY, PASSPORT, DUNE);
  const edited = md(...ALWAYS, BUY, DENTIST[0]!, DENTIST[1]!, '    - bring the old x-ray', PASSPORT, DUNE);
  for (const out of mergeBothWays(BASE, completed, edited)) expect(out).toBe(edited);
});

test('adjacent tasks edited one on each side gives both edits, with no duplicate of either original', () => {
  const passport = '- [ ] Renew passport 📅 2026-11-05';
  const dune = '- [ ] Read "Dune" 🔁 every year';
  const local = md(...ALWAYS, BUY, ...DENTIST, passport, DUNE);
  const remote = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, dune);
  // Touching edits form one conflict hunk, resolved as local's blocks then remote's new ones.
  expect(mergeTasksText(BASE, local, remote)).toBe(md(...ALWAYS, BUY, ...DENTIST, passport, dune));
  expect(mergeTasksText(BASE, remote, local)).toBe(md(...ALWAYS, BUY, ...DENTIST, dune, passport));

  // Three neighbours: first and third edited locally, middle remotely.
  const buy = '- [ ] Buy oat milk 📅 2026-10-17';
  const dentist = [DENTIST[0]!, '    - ask about ceramic'];
  const l3 = md(...ALWAYS, buy, ...DENTIST, passport, DUNE);
  const r3 = md(...ALWAYS, BUY, ...dentist, PASSPORT, DUNE);
  expect(mergeTasksText(BASE, l3, r3)).toBe(md(...ALWAYS, buy, passport, ...dentist, DUNE));
  expect(mergeTasksText(BASE, r3, l3)).toBe(md(...ALWAYS, ...dentist, buy, passport, DUNE));
});

test('notes added on one side while the title changed on the other keeps both versions', () => {
  const notes = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '    - the 1965 edition');
  const title = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, '- [ ] Read "Dune Messiah"');
  expect(mergeTasksText(BASE, notes, title)).toBe(
    md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '    - the 1965 edition', '- [ ] Read "Dune Messiah"'),
  );
  // Same thing on a task in the middle of the list, with sides swapped.
  const n2 = md(...ALWAYS, BUY, ...DENTIST, '    - bring the old x-ray', PASSPORT, DUNE);
  const t2 = md(...ALWAYS, BUY, '- [ ] Call the dentist about the bridge 📅 2026-10-16', DENTIST[1]!, PASSPORT, DUNE);
  const out = mergeTasksText(BASE, t2, n2);
  expect(out).toBe(
    md(...ALWAYS, BUY, '- [ ] Call the dentist about the bridge 📅 2026-10-16', DENTIST[1]!, ...DENTIST, '    - bring the old x-ray', PASSPORT, DUNE),
  );
  // Both versions parse back as two tasks.
  const titles = tasksOf(parseTasks(out)).map((t) => t.title);
  expect(titles).toEqual(['Buy oat milk', 'Call the dentist about the bridge', 'Call the dentist about the crown', 'Renew passport', 'Read "Dune"']);
});

test('an identical edit on both sides gives one copy', () => {
  const edited = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE);
  expect(mergeTasksText(BASE, edited, edited)).toBe(edited);
  const added = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '- [ ] Book flights');
  expect(mergeTasksText(BASE, added, added)).toBe(added);
});

test('a reorder on one side with an edit to a different task on the other gives both changes', () => {
  const reordered = md(...ALWAYS, DUNE, BUY, ...DENTIST, PASSPORT);
  const edited = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE);
  const want = md(...ALWAYS, DUNE, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05');
  for (const out of mergeBothWays(BASE, reordered, edited)) expect(out).toBe(want);
});

test('an Always line edited on one side and a task added on the other gives both', () => {
  const always = md('# Always', '- Walk before the first coffee', '- One tab at a time, really', '', '# Tasks', BUY, ...DENTIST, PASSPORT, DUNE);
  const added = md(...ALWAYS, '- [ ] Book flights', BUY, ...DENTIST, PASSPORT, DUNE);
  const want = md('# Always', '- Walk before the first coffee', '- One tab at a time, really', '', '# Tasks', '- [ ] Book flights', BUY, ...DENTIST, PASSPORT, DUNE);
  for (const out of mergeBothWays(BASE, always, added)) expect(out).toBe(want);
});

test('CRLF remote vs LF local of the same content merges without spurious duplicates', () => {
  const crlf = BASE.replace(/\n/g, '\r\n');
  expect(mergeTasksText(BASE, BASE, crlf)).toBe(BASE);
  expect(mergeTasksText(crlf, BASE, crlf)).toBe(BASE);
  expect(mergeTasksText(BASE, crlf, BOM + crlf)).toBe(BASE);
  // A real edit on the CRLF side still comes through, once.
  const edited = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE);
  const added = md(...ALWAYS, BUY, ...DENTIST, PASSPORT, DUNE, '- [ ] Book flights');
  expect(mergeTasksText(BASE, added, edited.replace(/\n/g, '\r\n'))).toBe(
    md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE, '- [ ] Book flights'),
  );
  // A remote without the final newline is the same content too.
  expect(mergeTasksText(BASE, BASE, crlf.slice(0, -2))).toBe(BASE);
});

test('an empty base (first sync) keeps everything from both sides', () => {
  const local = md('# Tasks', BUY);
  const remote = md('# Tasks', DUNE);
  expect(mergeTasksText('', local, remote)).toBe(md('# Tasks', BUY, DUNE));
  expect(mergeTasksText('', '', '')).toBe('');
});

// ---------- mergeDoneText ----------

const DONE_BASE = md('- [x] Send the invoice ✅ 2026-10-16', '- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19');

test('mergeDoneText: lines appended on both sides are all present', () => {
  const local = DONE_BASE + md('- [x] Buy oat milk ✅ 2026-10-20', '- [x] Call the dentist ✅ 2026-10-20', '    - ask about zirconia');
  const remote = DONE_BASE + md('- [x] Renew passport ✅ 2026-10-20');
  expect(mergeDoneText(DONE_BASE, local, remote)).toBe(
    DONE_BASE + md('- [x] Buy oat milk ✅ 2026-10-20', '- [x] Call the dentist ✅ 2026-10-20', '    - ask about zirconia', '- [x] Renew passport ✅ 2026-10-20'),
  );
  // The same completion on both devices is written once.
  const same = DONE_BASE + md('- [x] Buy oat milk ✅ 2026-10-20');
  expect(mergeDoneText(DONE_BASE, same, same)).toBe(same);
});

test('mergeDoneText: a line removed locally (undo) is gone, while a remote append is kept', () => {
  const base = DONE_BASE + md('- [x] Buy oat milk ✅ 2026-10-20');
  const local = DONE_BASE; // undo of the last completion
  const remote = base.replace(/\n/g, '\r\n') + '- [x] Renew passport ✅ 2026-10-20\r\n';
  expect(mergeDoneText(base, local, remote)).toBe(DONE_BASE + md('- [x] Renew passport ✅ 2026-10-20'));
  expect(mergeDoneText(base, local, base)).toBe(DONE_BASE);
});

// ---------- carryIds ----------

test('carryIds: unchanged tasks keep their old ids, and a changed task gets a new id', () => {
  const prev = parseTasks(BASE, counter('p'));
  const remote = md(...ALWAYS, BUY, ...DENTIST, '- [ ] Renew passport 📅 2026-11-05', DUNE, '- [ ] Book flights');
  const next = parseTasks(mergeTasksText(BASE, BASE, remote), counter('n'));
  const out = carryIds(prev, next);

  expect(idOf(out, 'Buy oat milk')).toBe(idOf(prev, 'Buy oat milk'));
  expect(idOf(out, 'Call the dentist about the crown')).toBe(idOf(prev, 'Call the dentist about the crown'));
  expect(idOf(out, 'Read "Dune"')).toBe(idOf(prev, 'Read "Dune"'));
  expect(idOf(out, 'Renew passport')).toBe(idOf(next, 'Renew passport'));
  expect(idOf(out, 'Renew passport')).not.toBe(idOf(prev, 'Renew passport'));
  expect(idOf(out, 'Book flights')).toBe(idOf(next, 'Book flights'));

  // Only ids change: the rest of the doc (alwaysRaw included) is next's, and next is not mutated.
  const strip = (d: TasksDoc) => ({ ...d, items: d.items.map((it): Item => (it.kind === 'task' ? { ...it, task: { ...it.task, id: '' } } : it)) });
  expect(strip(out)).toEqual(strip(next));
  expect(out.alwaysRaw).toBe(next.alwaysRaw);
  expect(idOf(next, 'Buy oat milk')).toBe('n1');
});

test('carryIds: matches on the block the app would write, not on raw text, and uses each old id once', () => {
  const prev0 = parseTasks(md('# Tasks', DUNE, DUNE, PASSPORT), counter('p'));
  // An in-memory edit: raw is stale, so the serialized block is the canonical rewrite.
  const prev: TasksDoc = {
    ...prev0,
    items: prev0.items.map((it): Item =>
      it.kind === 'task' && it.task.id === 'p3' ? { kind: 'task', task: { ...it.task, date: '2026-11-05' } } : it),
  };
  const saved = serializeTasks(prev);
  expect(saved).toContain('- [ ] Renew passport 📅 2026-11-05\n');

  const next = parseTasks(saved + md(DUNE), counter('n'));
  const out = carryIds(prev, next);
  expect(tasksOf(out).map((t) => t.id)).toEqual(['p1', 'p2', 'p3', 'n4']);
});
