import { expect, test } from 'vitest';
import { completeTag, matchTags, tagAtCaret } from '../src/index.ts';

test('tagAtCaret finds the #word being typed, only at a word start (Goals spec 9)', () => {
  expect(tagAtCaret('Book #CL', 8)).toEqual({ start: 5, query: 'CL' });
  expect(tagAtCaret('Book #', 6)).toEqual({ start: 5, query: '' });
  expect(tagAtCaret('#fam', 4)).toEqual({ start: 0, query: 'fam' });
  expect(tagAtCaret('Book #CLIMB now', 11)).toEqual({ start: 5, query: 'CLIMB' });
  expect(tagAtCaret('Book #CLIMB now', 15)).toBeNull();
  expect(tagAtCaret('a#b', 3)).toBeNull();
  expect(tagAtCaret('Book', 4)).toBeNull();
  expect(tagAtCaret('Book #CL', null)).toBeNull();
});

test('matchTags: a prefix, ignoring case, in the order given, at most six; the exact tag alone is no suggestion', () => {
  const tags = ['CLIMB', 'COURSE', 'climbing', 'home', 'family-friends'];
  expect(matchTags('cl', tags)).toEqual(['CLIMB', 'climbing']);
  expect(matchTags('', tags)).toEqual(tags);
  expect(matchTags('fam', tags)).toEqual(['family-friends']);
  expect(matchTags('climb', ['CLIMB'])).toEqual([]);
  expect(matchTags('x', tags)).toEqual([]);
  expect(matchTags('', Array.from({ length: 9 }, (_, i) => `T${i}X`))).toHaveLength(6);
});

test('completeTag puts the tag in, with a space after, and says where the caret goes', () => {
  expect(completeTag('Book #CL', { start: 5, query: 'CL' }, 'CLIMB')).toEqual({ text: 'Book #CLIMB ', caret: 12 });
  expect(completeTag('Book #cl flights', { start: 5, query: 'cl' }, 'CLIMB')).toEqual({ text: 'Book #CLIMB flights', caret: 12 });
});

test('review fixes: a typed tag that is already one shows no list; mid-word is no tag; duplicates are offered once', () => {
  expect(matchTags('home', ['HOMELAB', 'home'])).toEqual([]);
  expect(matchTags('CLIMB', ['CLIMB', 'climbing'])).toEqual([]);
  expect(matchTags('ho', ['home', 'HOME', 'homelab'])).toEqual(['home', 'homelab']);
  expect(tagAtCaret('Book #CLIMB', 8)).toBeNull();
  expect(tagAtCaret('Book #CL now', 8)).toEqual({ start: 5, query: 'CL' });
});
