import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  addArea, addGoal, addNotNow, areas, deleteArea, deleteGoal, deleteNotNow, editArea, editGoal, editNotNow, moveArea,
  notNow, parseGoals, serializeGoals, setVision, type GoalsDoc,
} from '../src/index.ts';

const spec = readFileSync(new URL('./fixtures/spec-example.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const TODAY = '2026-11-05';

/** Runs `op` on the parsed `text`, checks it didn't change its input, and returns the file it writes. */
function run(text: string, op: (d: GoalsDoc) => GoalsDoc): string {
  const doc = parseGoals(text);
  const before = structuredClone(doc);
  const out = serializeGoals(op(doc));
  expect(doc).toEqual(before);
  return out;
}

/** What a written file reads back as: each area's derived fields stay as the op left them. */
function readsBack(doc: GoalsDoc) {
  expect(parseGoals(serializeGoals(doc))).toEqual(doc);
}

describe('setVision', () => {
  test('replaces the vision text under the heading', () => {
    expect(run(spec, (d) => setVision(d, 'Calm and strong.'))).toBe(spec.replace('I feel happy, fulfilled and peaceful.', 'Calm and strong.'));
  });
  test('a vision over several lines becomes one line; other head lines are kept', () => {
    expect(run('# Vision\nA\nB\n\n## A #a\n', (d) => setVision(d, ' New\nline '))).toBe('# Vision\nNew line\n\n## A #a\n');
  });
  test('clearing it removes the lines and one blank', () => {
    expect(run(spec, (d) => setVision(d, ''))).toBe(spec.replace('I feel happy, fulfilled and peaceful.\n\n', ''));
  });
  test('adds a vision under a bare heading', () => {
    expect(run('# Vision\n## A #a\n', (d) => setVision(d, 'Be well.'))).toBe('# Vision\n\nBe well.\n\n## A #a\n');
  });
  test('adds the heading after front matter, or to an empty file', () => {
    expect(run('---\nx: 1\n---\n## A #a\n', (d) => setVision(d, 'Be well.'))).toBe('---\nx: 1\n---\n\n# Vision\n\nBe well.\n\n## A #a\n');
    expect(run('', (d) => setVision(d, 'Be well.'))).toBe('# Vision\n\nBe well.\n');
    expect(run('', (d) => setVision(d, ''))).toBe('');
  });
  test('the same text changes nothing', () => {
    const d = parseGoals(spec);
    expect(setVision(d, 'I feel happy, fulfilled and peaceful.')).toBe(d);
  });
});

describe('addArea', () => {
  test('goes after the last area, before Not now, with its tag made from the name', () => {
    const out = run(spec, (d) => addArea(d, 'Family & friends', [], { vision: 'Time together.' }).doc);
    expect(out).toBe(spec.replace('## Not now', '## Family & friends #family-friends\n\nTime together.\n\n## Not now'));
  });
  test('refuses a project code and another area\'s tag by numbering it', () => {
    const r = addArea(parseGoals(spec), 'Climb', ['CLIMB']);
    expect(areas(r.doc)[r.index]!.tag).toBe('climb-2');
    expect(areas(addArea(parseGoals(spec), 'Climbing', []).doc)[2]!.tag).toBe('climbing-2');
  });
  test('to an empty file, and to a file with only a vision or only Not now', () => {
    expect(run('', (d) => addArea(d, 'Home', []).doc)).toBe('## Home #home\n');
    expect(run('', (d) => addArea(d, 'Home', [], { picture: { alt: 'Home', path: 'images/home.jpg' }, vision: 'Warm.' }).doc))
      .toBe('## Home #home\n\n![Home](images/home.jpg)\n\nWarm.\n');
    expect(run('# Vision\n\nCalm.\n', (d) => addArea(d, 'Home', []).doc)).toBe('# Vision\n\nCalm.\n\n## Home #home\n');
    expect(run('## Not now\n- x\n', (d) => addArea(d, 'Home', []).doc)).toBe('## Home #home\n\n## Not now\n- x\n');
  });
  test('returns its index among the areas', () => {
    const r = addArea(parseGoals(spec), 'Home', []);
    expect(r.index).toBe(2);
    expect(areas(r.doc)[2]!.name).toBe('Home');
    readsBack(r.doc);
  });
});

describe('editArea', () => {
  test('renaming keeps the tag', () => {
    expect(run(spec, (d) => editArea(d, 1, { name: 'Rock climbing' }, []))).toBe(spec.replace('## Climbing #climbing', '## Rock climbing #climbing'));
  });
  test('an untagged heading gets a tag on its first edit, even when only the vision changes', () => {
    expect(run('## Health\nStrong.\n', (d) => editArea(d, 0, { vision: 'Strong at 60.' }, ['HEALTH'])))
      .toBe('## Health #health-2\nStrong at 60.\n');
  });
  test('changing the vision text keeps the picture and goals', () => {
    expect(run(spec, (d) => editArea(d, 0, { vision: 'Near the sea.' }, [])))
      .toBe(spec.replace('Sun, sea and quality rock within an hour. I move outdoors every day.', 'Near the sea.'));
  });
  test('a vision over several lines is replaced by one', () => {
    expect(run('## A #a\nOne\n\nTwo\n- [ ] G\n', (d) => editArea(d, 0, { vision: 'Both' }, []))).toBe('## A #a\nBoth\n- [ ] G\n');
  });
  test('a sub-heading between vision lines stays; the new text takes the first one\'s place', () => {
    expect(run('## A #a\nOne\n### Sub\nTwo\n- [ ] G\n', (d) => editArea(d, 0, { vision: 'New' }, []))).toBe('## A #a\nNew\n### Sub\n- [ ] G\n');
    expect(run('## A #a\nOne\n### Sub\nTwo\n- [ ] G\n', (d) => editArea(d, 0, { vision: '' }, []))).toBe('## A #a\n### Sub\n- [ ] G\n');
  });
  test('removing the vision text and the picture leaves the heading and goals', () => {
    const out = run(spec, (d) => editArea(d, 0, { vision: '', picture: null }, []));
    expect(out).toBe(spec.replace('![Place](images/place.jpg)\n\nSun, sea and quality rock within an hour. I move outdoors every day.\n\n', ''));
  });
  test('replacing a picture changes only its line', () => {
    expect(run(spec, (d) => editArea(d, 1, { picture: { alt: 'Climbing', path: 'images/climbing-2.jpg' } }, [])))
      .toBe(spec.replace('images/climbing.jpg', 'images/climbing-2.jpg'));
  });
  test('adds a picture and vision text under the heading', () => {
    expect(run('## A #a\n- [ ] G\n', (d) => editArea(d, 0, { picture: { alt: 'A', path: 'images/a.jpg' }, vision: 'V' }, [])))
      .toBe('## A #a\n\n![A](images/a.jpg)\n\nV\n\n- [ ] G\n');
    expect(run('## A #a\n\n![A](a.jpg)\n\n- [ ] G\n', (d) => editArea(d, 0, { vision: 'V' }, [])))
      .toBe('## A #a\n\n![A](a.jpg)\n\nV\n\n- [ ] G\n');
  });
  test('no change gives the same doc', () => {
    const d = parseGoals(spec);
    expect(editArea(d, 1, { name: 'Climbing', vision: 'Trips across the world to climb in interesting places.' }, [])).toBe(d);
  });
});

describe('moveArea and deleteArea', () => {
  test('moving swaps whole area blocks and keeps the blank lines between them', () => {
    const expected = spec.replace(
      /## Place #place[\s\S]*?(?=## Climbing)([\s\S]*?)(?=## Not now)/,
      (_m, climbing: string) => `${climbing}## Place #place\n\n![Place](images/place.jpg)\n\nSun, sea and quality rock within an hour. I move outdoors every day.\n\n- [ ] Live within an hour of quality rock 📅 2028-06-30 ➕ 2026-10-28\n\n`,
    );
    expect(run(spec, (d) => moveArea(d, 0, 1))).toBe(expected);
    expect(run(spec, (d) => moveArea(d, 1, -1))).toBe(expected);
  });
  test('the last block moved up gets a blank line, and the file keeps its end', () => {
    expect(run('## A #a\n- [ ] x\n\n## B #b\n- [ ] y\n', (d) => moveArea(d, 1, -1))).toBe('## B #b\n- [ ] y\n\n## A #a\n- [ ] x\n');
  });
  test('moving past either end changes nothing', () => {
    const d = parseGoals(spec);
    expect(moveArea(d, 0, -1)).toBe(d);
    expect(moveArea(d, 1, 1)).toBe(d);
  });
  test('an area is moved past Not now to the next area', () => {
    expect(run('## A #a\n\n## Not now\n\n## B #b\n', (d) => moveArea(d, 0, 1))).toBe('## B #b\n\n## Not now\n\n## A #a\n');
  });
  test('deleting an area removes it and its goals', () => {
    expect(run(spec, (d) => deleteArea(d, 0))).toBe(spec.replace(/## Place[\s\S]*?(?=## Climbing)/, ''));
    expect(run('## A #a\n- [ ] x\n\n## B #b\n', (d) => deleteArea(d, 1))).toBe('## A #a\n- [ ] x\n');
  });
});

describe('goals', () => {
  test('addGoal appends after the last goal, with ➕ today', () => {
    expect(run(spec, (d) => addGoal(d, 1, { text: 'Climb in Kalymnos', due: '2027-06-30', code: 'CLIMB' }, TODAY))).toBe(spec.replace(
      '✅ 2026-08-14\n',
      '✅ 2026-08-14\n- [ ] Climb in Kalymnos #CLIMB 📅 2027-06-30 ➕ 2026-11-05\n',
    ));
  });
  test('addGoal after a goal\'s notes, and to an area with no goals', () => {
    expect(run('## A #a\n- [ ] x\n    - note\nafter\n', (d) => addGoal(d, 0, { text: 'y', due: null }, TODAY)))
      .toBe('## A #a\n- [ ] x\n    - note\n- [ ] y ➕ 2026-11-05\nafter\n');
    expect(run('## A #a\n\nVision.\n\n## B #b\n', (d) => addGoal(d, 0, { text: 'y', due: '2027-01-01' }, TODAY)))
      .toBe('## A #a\n\nVision.\n\n- [ ] y 📅 2027-01-01 ➕ 2026-11-05\n\n## B #b\n');
    expect(run('## A #a', (d) => addGoal(d, 0, { text: 'y', due: null }, TODAY))).toBe('## A #a\n\n- [ ] y ➕ 2026-11-05\n');
  });
  test('editGoal writes ✏️ today when the text, date or project change, before 📅', () => {
    const line = '- [ ] Redpoint 8b 📅 2027-10-31 ➕ 2026-10-28';
    expect(run(spec, (d) => editGoal(d, 1, 0, { text: 'Redpoint 8b+' }, TODAY)))
      .toBe(spec.replace(line, '- [ ] Redpoint 8b+ ✏️ 2026-11-05 📅 2027-10-31 ➕ 2026-10-28'));
    expect(run(spec, (d) => editGoal(d, 1, 0, { due: '2028-10-31' }, TODAY)))
      .toBe(spec.replace(line, '- [ ] Redpoint 8b ✏️ 2026-11-05 📅 2028-10-31 ➕ 2026-10-28'));
    expect(run(spec, (d) => editGoal(d, 1, 0, { code: 'CLIMB' }, TODAY)))
      .toBe(spec.replace(line, '- [ ] Redpoint 8b #CLIMB ✏️ 2026-11-05 📅 2027-10-31 ➕ 2026-10-28'));
    expect(run(spec, (d) => editGoal(d, 1, 1, { code: null, due: null }, TODAY)))
      .toBe(spec.replace('- [ ] Two climbing trips abroad #CLIMB 📅 2027-12-31 ➕ 2026-10-28', '- [ ] Two climbing trips abroad ✏️ 2026-11-05 ➕ 2026-10-28'));
  });
  test('ticking writes ✅ today without ✏️; unticking removes it', () => {
    expect(run(spec, (d) => editGoal(d, 1, 0, { achieved: true }, TODAY)))
      .toBe(spec.replace('- [ ] Redpoint 8b 📅 2027-10-31 ➕ 2026-10-28', '- [x] Redpoint 8b 📅 2027-10-31 ➕ 2026-10-28 ✅ 2026-11-05'));
    expect(run(spec, (d) => editGoal(d, 1, 2, { achieved: false }, TODAY)))
      .toBe(spec.replace('- [x] Onsight 7c+ 📅 2026-09-30 ➕ 2025-11-02 ✅ 2026-08-14', '- [ ] Onsight 7c+ 📅 2026-09-30 ➕ 2025-11-02'));
  });
  test('a goal\'s other tags and emoji stay in its text; the same values change nothing', () => {
    const text = '## A #a\n- [ ] Run #outdoors 🏃 #RUN 📅 2027-01-01\n';
    expect(run(text, (d) => editGoal(d, 0, 0, { due: '2027-02-01' }, TODAY)))
      .toBe('## A #a\n- [ ] Run #outdoors 🏃 #RUN ✏️ 2026-11-05 📅 2027-02-01\n');
    const d = parseGoals(text);
    expect(editGoal(d, 0, 0, { text: 'Run #outdoors 🏃', due: '2027-01-01', code: 'RUN', achieved: false }, TODAY)).toBe(d);
  });
  test('deleting the last goal at the end of the file leaves no blank line behind (G.2)', () => {
    expect(run('## A #a\n\n- [ ] x ➕ 2026-01-01\n', (d) => deleteGoal(d, 0, 0))).toBe('## A #a\n');
    expect(run('## A #a\n\n- [ ] x\n\n## B #b\n', (d) => deleteGoal(d, 0, 0))).toBe('## A #a\n\n## B #b\n');
    expect(run('## Not now\n\n- boat\n', (d) => deleteNotNow(d, 0))).toBe('## Not now\n');
  });
  test('deleteGoal removes the line and its notes', () => {
    expect(run('## A #a\n- [ ] x\n    - note\n- [ ] y\n', (d) => deleteGoal(d, 0, 0))).toBe('## A #a\n- [ ] y\n');
    expect(run(spec, (d) => deleteGoal(d, 0, 0))).toBe(spec.replace('- [ ] Live within an hour of quality rock 📅 2028-06-30 ➕ 2026-10-28\n\n', ''));
  });
  test('edited docs read back as they were left', () => {
    let d = parseGoals(spec);
    d = addGoal(d, 0, { text: 'New', due: '2027-01-01', code: 'HOME' }, TODAY);
    d = editGoal(d, 0, 1, { achieved: true }, TODAY);
    d = editArea(d, 1, { name: 'Rock', vision: 'V', picture: null }, []);
    readsBack(d);
    expect(areas(d)[0]!.goals[1]).toMatchObject({ text: 'New', code: 'HOME', achieved: true, setOn: TODAY, doneOn: TODAY });
  });
});

describe('review fixes', () => {
  test('saving a form unchanged changes nothing, even with doubled spaces in the file', () => {
    const text = '# Vision\n\nCalm  and\tstrong.\n\n## Rock  climbing #climbing\nSun,  sea.\nMore.\n- [ ] Redpoint  8b 📅 2027-01-01 ➕ 2026-01-01\n';
    const d = parseGoals(text);
    const a = areas(d)[0]!;
    const g = a.goals[0]!;
    expect(editGoal(d, 0, 0, { text: g.text, due: g.due, code: g.code, achieved: g.achieved }, TODAY)).toBe(d);
    expect(editArea(d, 0, { name: a.name, vision: a.vision, picture: a.picture }, [])).toBe(d);
    expect(setVision(d, d.vision)).toBe(d);
  });
  test('the picture is only looked for before the first goal, at the start of a line', () => {
    const text = '## A #a\nVision\n- [ ] Goal\n    ![chart](c.png)\n';
    expect(areas(parseGoals(text))[0]!.picture).toBeNull();
    expect(areas(parseGoals('## A #a\n  ![x](x.jpg)\n'))[0]!.picture).toBeNull();
    expect(run(text, (d) => editArea(d, 0, { picture: { alt: 'A', path: 'a.jpg' } }, [])))
      .toBe('## A #a\n\n![A](a.jpg)\n\nVision\n- [ ] Goal\n    ![chart](c.png)\n');
  });
  test('front matter is skipped when finding the vision heading', () => {
    const text = '---\n# owner: me\ncssclass: wide\n---\n# Vision\n\nCalm.\n';
    expect(parseGoals(text).vision).toBe('Calm.');
    expect(run(text, (d) => setVision(d, 'Strong.'))).toBe(text.replace('Calm.', 'Strong.'));
    expect(run('---\n# owner: me\n---\n', (d) => setVision(d, 'Strong.'))).toBe('---\n# owner: me\n---\n\n# Vision\n\nStrong.\n');
  });
  test('a block id stays at the end of a rewritten goal; a removed code leaves no space before punctuation', () => {
    expect(run('## A #a\n- [ ] Goal 📅 2027-01-01 ^g1\n', (d) => editGoal(d, 0, 0, { achieved: true }, TODAY)))
      .toBe('## A #a\n- [x] Goal 📅 2027-01-01 ✅ 2026-11-05 ^g1\n');
    const g = areas(parseGoals('## A #a\n- [ ] Trips #CLIMB, abroad\n'))[0]!.goals[0]!;
    expect([g.text, g.code]).toEqual(['Trips, abroad', 'CLIMB']);
  });
});

describe('Not now', () => {
  test('add after the last item, edit keeping the marker, delete with continuation lines', () => {
    expect(run(spec, (d) => addNotNow(d, 'A boat'))).toBe(`${spec}- A boat\n`);
    expect(run('## Not now\n* one\n  more\n\nend\n', (d) => addNotNow(d, 'two'))).toBe('## Not now\n* one\n  more\n- two\n\nend\n');
    expect(run('## Not now\n* one\n', (d) => editNotNow(d, 0, 'uno'))).toBe('## Not now\n* uno\n');
    expect(run('## Not now\n- one\n  more\n- two\n', (d) => deleteNotNow(d, 0))).toBe('## Not now\n- two\n');
  });
  test('add creates the section at the end of the file', () => {
    expect(run('## A #a\n- [ ] x\n', (d) => addNotNow(d, 'A boat'))).toBe('## A #a\n- [ ] x\n\n## Not now\n\n- A boat\n');
    expect(run('', (d) => addNotNow(d, 'A boat'))).toBe('## Not now\n\n- A boat\n');
    expect(run('## Not now\n', (d) => addNotNow(d, 'A boat'))).toBe('## Not now\n\n- A boat\n');
  });
  test('reads back', () => {
    const d = addNotNow(parseGoals(spec), 'x');
    readsBack(d);
    expect(notNow(d).at(-1)!.text).toBe('x');
  });
});
