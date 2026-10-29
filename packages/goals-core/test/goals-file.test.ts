import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { areas, notNow, parseGoals, serializeGoals } from '../src/index.ts';

const spec = readFileSync(new URL('./fixtures/spec-example.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the spec example round-trips byte for byte', () => {
  expect(serializeGoals(parseGoals(spec))).toBe(spec);
});

test('the spec example reads as the vision line, two areas and Not now', () => {
  const doc = parseGoals(spec);
  expect(doc.vision).toBe('I feel happy, fulfilled and peaceful.');
  const [place, climbing] = areas(doc);
  expect(areas(doc)).toHaveLength(2);
  expect(place).toMatchObject({
    name: 'Place', tag: 'place', picture: { alt: 'Place', path: 'images/place.jpg' },
    vision: 'Sun, sea and quality rock within an hour. I move outdoors every day.',
  });
  expect(place!.goals).toEqual([{
    line: 6, text: 'Live within an hour of quality rock', achieved: false, due: '2028-06-30', setOn: '2026-10-28',
    changedOn: null, doneOn: null, code: null,
  }]);
  expect(climbing!.goals.map((g) => [g.text, g.achieved, g.code, g.doneOn])).toEqual([
    ['Redpoint 8b', false, null, null],
    ['Two climbing trips abroad', false, 'CLIMB', null],
    ['Onsight 7c+', true, null, '2026-08-14'],
  ]);
  expect(notNow(doc).map((i) => i.text)).toEqual(['New client projects that need an office', 'A third Omark app before Time is in use']);
});

test('unknown lines, sub-headings, comments, notes and front matter are kept byte for byte', () => {
  const text = [
    '---', 'tags: [goals]', '---', '', '# Vision', '', 'Line one', 'and two.', '', '<!-- a comment -->', '',
    '## Health #health', '', 'Strong at 60.', '', '### Notes', '', '- [ ] Run 10 km 📅 2027-05-01 ➕ 2026-10-01',
    '    - a note under the goal', '- [-] cancelled one', '  * [x] indented, not a goal ✅ 2026-01-01',
    'Some text after.', '', '##', '', '## Untagged area', '- [X] Big X ✅ 2026-02-02', '',
    '## Not now', '', '* star item', '+ plus item', '- dash', '    continued', 'not an item', '',
  ].join('\n');
  const doc = parseGoals(text);
  expect(serializeGoals(doc)).toBe(text);
  expect(doc.vision).toBe('Line one and two. <!-- a comment -->');
  const [health, empty, untagged] = areas(doc);
  expect(health!.goals.map((g) => g.text)).toEqual(['Run 10 km']);
  expect(empty).toMatchObject({ name: '', tag: null, goals: [] });
  expect(untagged).toMatchObject({ name: 'Untagged area', tag: null });
  expect(untagged!.goals[0]).toMatchObject({ text: 'Big X', achieved: true, doneOn: '2026-02-02' });
  expect(notNow(doc).map((i) => i.text)).toEqual(['star item', 'plus item', 'dash']);
});

test('a BOM and CRLF are read; the file is written with LF and one final newline', () => {
  const doc = parseGoals('﻿# Vision\r\n\r\nCalm.\r\n\r\n## Home #home\r\n- [ ] Fix the roof 📅 2027-01-01');
  expect(doc.vision).toBe('Calm.');
  expect(areas(doc)[0]!.goals[0]!.due).toBe('2027-01-01');
  expect(serializeGoals(doc)).toBe('# Vision\n\nCalm.\n\n## Home #home\n- [ ] Fix the roof 📅 2027-01-01\n');
});

test('empty and blank files', () => {
  for (const t of ['', '\n', '\n\n', 'just text\n']) expect(serializeGoals(parseGoals(t))).toBe(t);
  const doc = parseGoals('');
  expect(doc).toMatchObject({ vision: '', sections: [] });
});

test('no vision heading means no vision line, even with text', () => {
  expect(parseGoals('Some text\n\n## A #a\n').vision).toBe('');
  expect(parseGoals('# Vision\n\n## A #a\n').vision).toBe('');
  expect(parseGoals('# My board\nBe well.\n# Other\nNot this.\n').vision).toBe('Be well.');
});

test('goal fields: last valid date and last code win, ✏️ with and without VS16, ✅ only on achieved goals', () => {
  const doc = parseGoals([
    '## A #a',
    '- [ ] One 📅 2027-13-01 📅 2027-02-03 ✏ 2026-10-01 ➕ 2026-09-01',
    '- [ ] Two ✏️ 2026-10-02 ✅ 2026-10-03',
    '- [x] Three #CODE #OTHER #family 🏔️',
    '- [ ]',
    '- [ ] Five #2027 #ab',
  ].join('\n'));
  expect(areas(doc)[0]!.goals.map(({ line: _, ...g }) => g)).toEqual([
    { text: 'One 📅 2027-13-01', achieved: false, due: '2027-02-03', setOn: '2026-09-01', changedOn: '2026-10-01', doneOn: null, code: null },
    { text: 'Two ✅ 2026-10-03', achieved: false, due: null, setOn: null, changedOn: '2026-10-02', doneOn: null, code: null },
    { text: 'Three #CODE #family 🏔️', achieved: true, due: null, setOn: null, changedOn: null, doneOn: null, code: 'OTHER' },
    { text: '', achieved: false, due: null, setOn: null, changedOn: null, doneOn: null, code: null },
    { text: 'Five #2027 #ab', achieved: false, due: null, setOn: null, changedOn: null, doneOn: null, code: null },
  ]);
});

test('the picture is the first line that is only an image; other images are vision text', () => {
  const doc = parseGoals('## A #a\n\nBefore ![x](x.jpg) inline\n\n![Second](images/a.jpg "title")\n\n![Third](t.jpg)\n- [ ] G\n');
  expect(areas(doc)[0]).toMatchObject({
    picture: { alt: 'Second', path: 'images/a.jpg' },
    vision: 'Before ![x](x.jpg) inline ![Third](t.jpg)',
  });
});

test('text after the first goal is not vision text', () => {
  const doc = parseGoals('## A #a\nVision.\n- [ ] G\nAfter.\n');
  expect(areas(doc)[0]!.vision).toBe('Vision.');
});

test('Not now is matched ignoring case and spaces, and can sit between areas', () => {
  const doc = parseGoals('## A #a\n##  not NOW \n- x\n## B #b\n');
  expect(areas(doc).map((a) => a.tag)).toEqual(['a', 'b']);
  expect(notNow(doc).map((i) => i.text)).toEqual(['x']);
});

test('a heading tag: the last token, letters and digits, not only digits', () => {
  const tags = (h: string) => areas(parseGoals(`## ${h}\n`)).map((a) => [a.name, a.tag]);
  expect(tags('Family & friends #family')).toEqual([['Family & friends', 'family']]);
  expect(tags('Zdrowie #zdrowie-ciało')).toEqual([['Zdrowie', 'zdrowie-ciało']]);
  expect(tags('#solo')).toEqual([['', 'solo']]);
  expect(tags('Year #2027')).toEqual([['Year #2027', null]]);
  expect(tags('Mixed #Climb')).toEqual([['Mixed', 'Climb']]);
  expect(tags('Tag #mid then text')).toEqual([['Tag #mid then text', null]]);
  expect(tags('No space#tag')).toEqual([['No space#tag', null]]);
});
