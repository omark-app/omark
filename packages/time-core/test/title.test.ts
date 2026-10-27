import { expect, test } from 'vitest';
import { CODE_PATTERN, formatTitle, isValidCode, parseTitle } from '../src/title.ts';

const known = new Set(['ACME']);

const structured = (code: string, category: string, description: string, isKnown: boolean) => ({
  code,
  category,
  description,
  known: isKnown,
});

test.each([
  ['ACME; Coding; new featureX', structured('ACME', 'Coding', 'new featureX', true)],
  ['ACME;Coding', structured('ACME', 'Coding', '', true)],
  ['ACME; ; quick call', structured('ACME', '', 'quick call', true)],
  ['ACME; CS; ticket 12; then 13', structured('ACME', 'CS', 'ticket 12; then 13', true)],
  ['acme; coding; new featureX', structured('ACME', 'coding', 'new featureX', true)],
  ['ACME', structured('ACME', '', '', true)],
  ['acme', structured('ACME', '', '', true)],
  ['  acme  ', structured('ACME', '', '', true)],
  ['OOO', null],
  ['Lunch', null],
  ['OOO; away', structured('OOO', 'away', '', false)],
  ['Lunch; with Tom', structured('LUNCH', 'with Tom', '', false)],
  ['John-Mary call', null],
  ['Call: John', null],
  ['Q&A; prep', null],
  ['', null],
  ['A; x', null],
  ['ABCDEFGHIJKLMNOPQRSTU; x', null],
  ['1ACME; x', null],
  ['ABCDEFGHIJKLMNOPQRST; x', structured('ABCDEFGHIJKLMNOPQRST', 'x', '', false)],
  ['A_1; x', structured('A_1', 'x', '', false)],
])('parseTitle(%j)', (title, expected) => {
  expect(parseTitle(title, known)).toEqual(expected);
});

test('isValidCode and CODE_PATTERN', () => {
  expect(CODE_PATTERN.test('ACME')).toBe(true);
  expect(isValidCode('acme')).toBe(true);
  expect(isValidCode('A')).toBe(false);
  expect(isValidCode('1AB')).toBe(false);
});

test.each([
  [{ code: 'ACME', description: 'quick call' }, 'ACME; ; quick call'],
  [{ code: 'ACME', category: 'Coding' }, 'ACME; Coding'],
  [{ code: 'ACME' }, 'ACME'],
  [{ code: 'ACME', category: 'Coding', description: 'x' }, 'ACME; Coding; x'],
])('formatTitle(%j)', (p, expected) => {
  expect(formatTitle(p)).toBe(expected);
});
