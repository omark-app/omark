import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  carryIds, doneBlocks, merge3, mergeDoneText, mergeTasksText, parseDone, parseTasks, serializeTasks, toBlocks,
  type Item, type Task, type TasksDoc,
} from '../src/index.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const BOM = String.fromCharCode(0xfeff);

/** A file as the serializers write it: LF line endings and one final newline. */
const md = (...lines: string[]) => lines.map((l) => `${l}\n`).join('');

/** The head of the file, with two Important, not urgent tasks (once the Always lines, #38). */
const ALWAYS = ['# Tasks', '- [ ] Walk before the first coffee ⏫', '- [ ] One tab at a time ⏫'];
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
  // Touching edits form one conflict hunk; each edit stays where its task was, in both directions (#7).
  for (const out of mergeBothWays(BASE, local, remote)) expect(out).toBe(md(...ALWAYS, BUY, ...DENTIST, passport, dune));

  // Three neighbours: first and third edited locally, middle remotely.
  const buy = '- [ ] Buy oat milk 📅 2026-10-17';
  const dentist = [DENTIST[0]!, '    - ask about ceramic'];
  const l3 = md(...ALWAYS, buy, ...DENTIST, passport, DUNE);
  const r3 = md(...ALWAYS, BUY, ...dentist, PASSPORT, DUNE);
  for (const out of mergeBothWays(BASE, l3, r3)) expect(out).toBe(md(...ALWAYS, buy, ...dentist, passport, DUNE));
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
  // The old Always lines read as Important, not urgent tasks first (#38).
  expect(titles).toEqual(['Walk before the first coffee', 'One tab at a time', 'Buy oat milk', 'Call the dentist about the bridge', 'Call the dentist about the crown', 'Renew passport', 'Read "Dune"']);
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

test('an Important, not urgent task edited on one side and a task added on the other gives both', () => {
  const edited = md('# Tasks', '- [ ] Walk before the first coffee ⏫', '- [ ] One tab at a time, really ⏫', BUY, ...DENTIST, PASSPORT, DUNE);
  const added = md(...ALWAYS, '- [ ] Book flights', BUY, ...DENTIST, PASSPORT, DUNE);
  const want = md('# Tasks', '- [ ] Walk before the first coffee ⏫', '- [ ] One tab at a time, really ⏫', '- [ ] Book flights', BUY, ...DENTIST, PASSPORT, DUNE);
  for (const out of mergeBothWays(BASE, edited, added)) expect(out).toBe(want);
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

test('mergeDoneText: the same line appended twice on one side keeps both copies, in both directions', () => {
  const water = '- [x] Water the plants 🔁 every day ✅ 2026-10-20';
  const twice = DONE_BASE + md(water, water);
  const other = DONE_BASE + md('- [x] Renew passport ✅ 2026-10-20');
  expect(mergeDoneText(DONE_BASE, twice, other)).toBe(DONE_BASE + md(water, water, '- [x] Renew passport ✅ 2026-10-20'));
  expect(mergeDoneText(DONE_BASE, other, twice)).toBe(DONE_BASE + md('- [x] Renew passport ✅ 2026-10-20', water, water));
});

test('mergeDoneText: completions with notes on both devices keep each note under its own line', () => {
  const dentist = ['- [x] Call the dentist ✅ 2026-10-20', '    - ask about zirconia', '    - bring the old x-ray'];
  const trip = ['- [x] Trip ✅ 2026-10-20', '\t* passport', '        - nested'];
  const local = DONE_BASE + md(...dentist);
  const remote = DONE_BASE + md(...trip);
  expect(mergeDoneText(DONE_BASE, local, remote)).toBe(DONE_BASE + md(...dentist, ...trip));
  expect(mergeDoneText(DONE_BASE, remote, local)).toBe(DONE_BASE + md(...trip, ...dentist));
  const notes = parseDone(mergeDoneText(DONE_BASE, local, remote)).lines.flatMap((l) =>
    l.entry ? [[l.entry.title, l.entry.notes]] : [],
  );
  expect(notes.slice(2)).toEqual([
    ['Call the dentist', ['ask about zirconia', 'bring the old x-ray']],
    ['Trip', ['passport', 'nested']],
  ]);
});

test('mergeDoneText: the same repeating task completed on both devices keeps both blocks, notes unmixed', () => {
  const a = ['- [x] Water 🔁 every day ✅ 2026-10-20', '    - ferns'];
  const b = ['- [x] Water 🔁 every day ✅ 2026-10-20', '    - ferns and the cactus'];
  for (const [x, y] of [[a, b], [b, a]] as const) {
    expect(mergeDoneText(DONE_BASE, DONE_BASE + md(...x), DONE_BASE + md(...y))).toBe(DONE_BASE + md(...x, ...y));
  }
  // Identical blocks are the same completion, written once (as for one-line entries).
  expect(mergeDoneText(DONE_BASE, DONE_BASE + md(...a), DONE_BASE + md(...a))).toBe(DONE_BASE + md(...a));
  // Several blocks on each side stay whole and in each side's order.
  const c = ['- [x] Post ✅ 2026-10-20', '    - stamps'];
  expect(mergeDoneText(DONE_BASE, DONE_BASE + md(...a, ...c), DONE_BASE + md(...b))).toBe(
    DONE_BASE + md(...a, ...c, ...b),
  );
});

test('mergeDoneText: undoing a completion takes its notes along; a note added by hand is kept', () => {
  const dentist = ['- [x] Call the dentist ✅ 2026-10-20', '    - ask about zirconia'];
  const trip = ['- [x] Trip ✅ 2026-10-20', '    - passport'];
  const base = DONE_BASE + md(...dentist);
  expect(mergeDoneText(base, DONE_BASE, base + md(...trip))).toBe(DONE_BASE + md(...trip));
  // A note added under an old entry in Obsidian on one side, a completion on the other.
  const annotated = md('- [x] Send the invoice ✅ 2026-10-16', '    - paid on the 18th') + DONE_BASE.split('\n')[1] + '\n';
  expect(mergeDoneText(DONE_BASE, annotated, DONE_BASE + md(...trip))).toBe(annotated + md(...trip));
});

test('mergeDoneText: a tasks.md heading in done.md does not split a done line from its notes', () => {
  const base = md('# Tasks', '- [x] A ✅ 2026-10-01', '    - a note');
  const local = base + md('- [x] B ✅ 2026-10-02', '    - b note');
  const remote = base + md('- [x] C ✅ 2026-10-02', '    - c note');
  expect(mergeDoneText(base, local, remote)).toBe(base + md('- [x] B ✅ 2026-10-02', '    - b note', '- [x] C ✅ 2026-10-02', '    - c note'));
  expect(doneBlocks(md('# Always', '- [x] A ✅ 2026-10-01', '    - a note'))).toEqual(['# Always', '- [x] A ✅ 2026-10-01\n    - a note']);
});

// ---------- copies of identical blocks ----------

const CALL = '- [ ] Call mom 📅 2026-10-16';
const CALL_BASE = md(...ALWAYS, BUY, CALL);

test('a new copy of a task survives the other side completing the original', () => {
  const copied = md(...ALWAYS, BUY, CALL, CALL);
  const completed = md(...ALWAYS, BUY);
  expect(mergeTasksText(CALL_BASE, copied, completed)).toBe(md(...ALWAYS, BUY, CALL));
  expect(mergeTasksText(CALL_BASE, completed, copied)).toBe(md(...ALWAYS, BUY, CALL));
});

test('a new copy of a task survives the other side editing the original', () => {
  const copied = md(...ALWAYS, BUY, CALL, CALL);
  const noted = md(...ALWAYS, BUY, CALL, '    - ask about the trip');
  expect(mergeTasksText(CALL_BASE, copied, noted)).toBe(md(...ALWAYS, BUY, CALL, CALL, '    - ask about the trip'));
  expect(mergeTasksText(CALL_BASE, noted, copied)).toBe(md(...ALWAYS, BUY, CALL, '    - ask about the trip', CALL));
});

test('two identical new blank lines on one side are both kept', () => {
  expect(merge3(['T1', 'T2'], ["T1'", 'T2'], ['T1', '', '', 'T2'])).toEqual(["T1'", '', '', 'T2']);
  expect(merge3(['T1', 'T2'], ['T1', '', '', 'T2'], ["T1'", 'T2'])).toEqual(["T1'", '', '', 'T2']);
});

test('a task both sides moved to different places is not duplicated', () => {
  expect(merge3(['A', 'B', 'C'], ['B', 'A', 'C'], ['B', 'C', 'A'])).toEqual(['B', 'A', 'C']);
  expect(merge3(['A', 'B', 'C'], ['B', 'C', 'A'], ['B', 'A', 'C'])).toEqual(['B', 'A', 'C']);
  // A second identical copy that one side added on purpose is kept.
  expect(merge3(['A', 'B', 'C'], ['B', 'A', 'C', 'A'], ['B', 'C', 'A'])).toEqual(['B', 'A', 'C', 'A']);
  expect(merge3(['A', 'B', 'C'], ['B', 'C', 'A'], ['B', 'A', 'C', 'A'])).toEqual(['B', 'A', 'C', 'A']);
});

test('a hunk where each side changed blocks in place keeps their order (#7)', () => {
  // Local completed Y, remote completed X: neither moved a task, so the merge must not swap them.
  expect(merge3(['A', 'X', 'Y', 'B'], ['A', 'X', "Y'", 'B'], ['A', "X'", 'Y', 'B'])).toEqual(['A', "X'", "Y'", 'B']);
  expect(merge3(['A', 'X', 'Y', 'B'], ['A', 'X', "Y'", 'B'], ['A', "X'", "Y'", 'B'])).toEqual(['A', "X'", "Y'", 'B']);
  expect(merge3(['A', 'X', 'Y', 'B'], ['A', "X'", "Y'", 'B'], ['A', 'X', "Y'", 'B'])).toEqual(['A', "X'", "Y'", 'B']);
});

test('a repeating task completed on two devices, one of them stale, comes out once (#7)', () => {
  const H = md(...ALWAYS, '- [ ] A 📅 2026-10-18');
  const T = md('- [ ] B 📅 2026-10-19');
  const X = md('- [ ] leki 🔁 every 2 days 📅 2026-10-18');
  const X2 = X.replace('10-18', '10-20');
  const Y = md('- [ ] dep 🔁 every week on Sunday 📅 2026-10-18');
  const Y2 = Y.replace('10-18', '10-25');
  const base = H + X + Y + T;
  const ph1 = H + X2 + Y + T; // the phone completed leki and wrote it
  const pcMerged = mergeTasksText(base, H + X + Y2 + T, ph1); // the stale PC completed dep: its 412 retry
  expect(pcMerged).toBe(H + X2 + Y2 + T);
  const ph = H + X2 + Y2 + T; // the phone completed dep too, on top of ph1
  for (const out of mergeBothWays(ph1, ph, pcMerged)) expect(out).toBe(H + X2 + Y2 + T);
  // Even a remote that did swap them (as the old merge wrote) is not read as a second copy.
  for (const out of mergeBothWays(ph1, ph, H + Y2 + X2 + T)) expect(out.match(/dep/g)).toHaveLength(1);
});

test('mergeDoneText: the same completion added on both sides in different places is kept once (#7)', () => {
  const dep = '- [x] dep 🔁 every week on Sunday ✅ 2026-10-18';
  const leki = '- [x] leki 🔁 every 2 days ✅ 2026-10-18';
  const base = DONE_BASE + md(leki);
  const local = DONE_BASE + md(leki, dep);
  const remote = DONE_BASE + md(dep, leki);
  for (const out of [mergeDoneText(base, local, remote), mergeDoneText(base, remote, local)]) {
    expect(out.match(/dep/g)).toHaveLength(1);
    expect(out.match(/leki/g)).toHaveLength(1);
  }
});

test('randomized edits (no moves): no new or edited block is lost, no block has more copies than either side', () => {
  let seed = 20261016;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const pool = ['A', 'B', 'C', 'D', '', '## Errands'];
  const mutate = (base: string[], side: string): string[] => {
    const out = [...base];
    for (let k = 0, ops = 1 + rnd(3); k < ops; k++) {
      const op = rnd(5);
      if (op === 0 && out.length) out[rnd(out.length)] += `${side}${k}`; // edit
      else if (op === 1 && out.length) out.splice(rnd(out.length), 1); // delete
      else if (op === 2) out.splice(rnd(out.length + 1), 0, `N${side}${k}`); // add
      else out.splice(rnd(out.length + 1), 0, pool[rnd(pool.length)]!); // add a copy of a common block
    }
    return out;
  };
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  for (let it = 0; it < 500; it++) {
    const base = Array.from({ length: rnd(7) }, () => pool[rnd(pool.length)]!);
    const local = mutate(base, 'L');
    const remote = mutate(base, 'R');
    const out = count(merge3(base, local, remote));
    const [cb, cl, cr] = [count(base), count(local), count(remote)];
    for (const x of new Set([...local, ...remote])) {
      const [o, l, r, m] = [cb.get(x) ?? 0, cl.get(x) ?? 0, cr.get(x) ?? 0, out.get(x) ?? 0];
      const ctx = JSON.stringify({ x, base, local, remote });
      expect(m, `lost new copies: ${ctx}`).toBeGreaterThanOrEqual(Math.max(l - o, r - o, 0));
      expect(m, `duplicated block: ${ctx}`).toBeLessThanOrEqual(Math.max(l, r));
    }
  }
});

test('randomized in-place edits on both sides keep every task where it was (#7)', () => {
  let seed = 20261018;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let it = 0; it < 500; it++) {
    const base = Array.from({ length: 1 + rnd(8) }, (_, i) => `T${i}`);
    const local = base.map((x) => (rnd(3) === 0 ? `${x}L` : x));
    const remote = base.map((x) => (rnd(3) === 0 ? `${x}R` : x));
    // Each task as edited (both edits, local's first, when both sides changed it), in base order.
    const expected = base.flatMap((x, i) => {
      const [l, r] = [local[i]!, remote[i]!];
      return l !== x && r !== x ? [l, r] : [l !== x ? l : r];
    });
    expect(merge3(base, local, remote), JSON.stringify({ base, local, remote })).toEqual(expected);
  }
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

  // Only ids change: the rest of the doc is next's, and next is not mutated.
  const strip = (d: TasksDoc) => ({ ...d, items: d.items.map((it): Item => (it.kind === 'task' ? { ...it, task: { ...it.task, id: '' } } : it)) });
  expect(strip(out)).toEqual(strip(next));
  expect(out.preamble).toBe(next.preamble);
  expect(idOf(next, 'Buy oat milk')).toBe('n3'); // after the two group tasks
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

test('an Always line added on an old device while this one migrated becomes a group task (#38 review)', () => {
  const base = md('# Always', '- A', '- B', '', '# Tasks', '- [ ] T');
  const migrated = md('# Tasks', '- [ ] A ⏫', '- [ ] B ⏫', '- [ ] T');
  const added = md('# Always', '- A', '- B', '- C', '', '# Tasks', '- [ ] T');
  const deleted = md('# Always', '- A', '', '# Tasks', '- [ ] T');
  for (const out of mergeBothWays(base, migrated, added)) {
    expect(out).toBe(md('# Tasks', '- [ ] A ⏫', '- [ ] B ⏫', '- [ ] C ⏫', '- [ ] T'));
  }
  for (const out of mergeBothWays(base, migrated, deleted)) expect(out).toBe(md('# Tasks', '- [ ] A ⏫', '- [ ] T'));
});
