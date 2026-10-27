import { expect, test } from 'vitest';
import { findLinks, linkParts, linkText } from '../src/index.ts';

test('linkParts splits a bare link out of the text', () => {
  expect(linkParts('Read https://example.com/a?b=1 today')).toEqual([
    { text: 'Read ' },
    { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
    { text: ' today' },
  ]);
});

test('linkParts leaves trailing punctuation and an unmatched bracket out of the link', () => {
  expect(linkParts('see https://example.com/x.')).toEqual([{ text: 'see ' }, { text: 'https://example.com/x', href: 'https://example.com/x' }, { text: '.' }]);
  expect(linkParts('(https://example.com/x)')).toEqual([{ text: '(' }, { text: 'https://example.com/x', href: 'https://example.com/x' }, { text: ')' }]);
  expect(linkParts('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
    { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
  ]);
});

test('linkParts shows a Markdown link by its label', () => {
  expect(linkParts('Book [the hut](https://hut.example.com/book) now')).toEqual([
    { text: 'Book ' },
    { text: 'the hut', href: 'https://hut.example.com/book' },
    { text: ' now' },
  ]);
});

test('linkParts opens www. links over https', () => {
  expect(linkParts('www.example.com')).toEqual([{ text: 'www.example.com', href: 'https://www.example.com' }]);
});

test('linkParts keeps text without a web link as it is', () => {
  expect(linkParts('Call mum')).toEqual([{ text: 'Call mum' }]);
  expect(linkParts('')).toEqual([]);
  expect(linkParts('[x](javascript:alert(1)) ftp://example.com mailto:a@b.c')).toEqual([{ text: '[x](javascript:alert(1)) ftp://example.com mailto:a@b.c' }]);
});

test('findLinks lists every link once, in order', () => {
  expect(findLinks('a https://one.example b [two](https://two.example)\nhttps://one.example')).toEqual([
    { text: 'https://one.example', href: 'https://one.example' },
    { text: 'two', href: 'https://two.example' },
  ]);
});

test('linkParts leaves Markdown marks and closing brackets around a bare link out of it', () => {
  const link = (s: string) => linkParts(s).find((p) => p.href)?.href;
  expect(link('[see https://example.com/x]')).toBe('https://example.com/x');
  expect(link('**https://example.com/x**')).toBe('https://example.com/x');
  expect(link('`https://example.com/x`')).toBe('https://example.com/x');
  expect(link('_https://example.com/x_')).toBe('https://example.com/x');
  expect(link('https://example.com/x…')).toBe('https://example.com/x');
  expect(link('(https://x.com/a)]')).toBe('https://x.com/a');
  expect(link('https://example.com/a_b')).toBe('https://example.com/a_b');
});

test('linkParts finds www. links only at the start of a word', () => {
  expect(linkParts('ftp://www.example.com me@www.example.com foo.www.bar')).toEqual([{ text: 'ftp://www.example.com me@www.example.com foo.www.bar' }]);
  expect(linkParts('(www.example.com)')).toEqual([{ text: '(' }, { text: 'www.example.com', href: 'https://www.example.com' }, { text: ')' }]);
});

test('linkText is the text as shown, Markdown links by their label', () => {
  expect(linkText('Book [the hut](https://hut.example.com/book) now')).toBe('Book the hut now');
});
