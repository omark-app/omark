import { expect, test } from 'vitest';
import { freeTag, makeTag, parseGoals, tagProblem, titleTags } from '../src/index.ts';

test('makeTag: lower case, diacritics dropped, letters, digits and -', () => {
  expect(makeTag('Climbing')).toBe('climbing');
  expect(makeTag('Family & friends')).toBe('family-friends');
  expect(makeTag('  Zdrowie, ciało i umysł ')).toBe('zdrowie-ciało-i-umysł');
  expect(makeTag('Café #1')).toBe('cafe-1');
  expect(makeTag('---')).toBe('area');
  expect(makeTag('')).toBe('area');
  expect(makeTag('2027')).toBe('area-2027');
});

const doc = parseGoals('## Climbing #climbing\n## Home #Home\n## Untagged\n');

test('tagProblem refuses a project code or another area\'s tag, ignoring case', () => {
  const codes = ['CLIMB', 'OMARK'];
  expect(tagProblem('climb', doc, codes)).toBe('code');
  expect(tagProblem('Omark', doc, codes)).toBe('code');
  expect(tagProblem('home', doc, codes)).toBe('taken');
  expect(tagProblem('CLIMBING', doc, codes)).toBe('taken');
  expect(tagProblem('climbing', doc, codes, 0)).toBeNull();
  expect(tagProblem('garden', doc, codes)).toBeNull();
  expect(tagProblem('Bad tag', doc, codes)).toBe('invalid');
  expect(tagProblem('1234', doc, codes)).toBe('invalid');
  expect(tagProblem('', doc, codes)).toBe('invalid');
});

test('freeTag numbers a tag that is taken or a code', () => {
  expect(freeTag('garden', doc, [])).toBe('garden');
  expect(freeTag('climbing', doc, [])).toBe('climbing-2');
  expect(freeTag('climb', doc, ['CLIMB'])).toBe('climb-2');
  expect(freeTag('home', parseGoals('## H #home\n## H2 #home-2\n'), [])).toBe('home-3');
  expect(freeTag('climbing', doc, [], 0)).toBe('climbing');
  expect(freeTag('Bad tag', doc, [])).toBe('bad-tag');
  expect(freeTag('Home', doc, [])).toBe('Home-2');
});

test('titleTags finds #tags that start a word, not numbers or anchors', () => {
  expect(titleTags('Book flights to Kalymnos #CLIMB')).toEqual(['CLIMB']);
  expect(titleTags('#family walk (#outdoors) and #a/b, then x#no #2027 #3d')).toEqual(['family', 'outdoors', 'a/b', '3d']);
  expect(titleTags('Read [this](https://x.com/#frag) #ok.')).toEqual(['ok']);
  expect(titleTags('none here')).toEqual([]);
});
