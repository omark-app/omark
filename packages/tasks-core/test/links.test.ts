import { expect, test } from 'vitest';
import { findLinks, linkParts } from '../src/index.ts';

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
