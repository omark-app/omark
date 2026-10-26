import { expect, test } from 'vitest';
import { parseCsv, toCsv } from '../src/csv.ts';

test('writes quotes only where needed and round trips', () => {
  const rows = [['a', 'b, c', 'say "hi"', 'line\nbreak', '']];
  const text = toCsv(rows);
  expect(text).toBe('a,"b, c","say ""hi""","line\nbreak",\n');
  expect(parseCsv(text).rows).toEqual(rows);
});

test('reads CRLF, a BOM and blank lines, and tracks start lines', () => {
  const parsed = parseCsv('\uFEFFcode,rate\r\nACME,120\r\n\r\nX,\n');
  expect(parsed.rows).toEqual([['code', 'rate'], ['ACME', '120'], ['X', '']]);
  expect(parsed.lines).toEqual([1, 2, 4]);
});

test('newlines inside quotes count as physical lines', () => {
  const parsed = parseCsv('a,"x\ny"\nb,c');
  expect(parsed.rows).toEqual([['a', 'x\ny'], ['b', 'c']]);
  expect(parsed.lines).toEqual([1, 3]);
});

test('a lone CR inside quotes stays data; no trailing newline is fine', () => {
  expect(parseCsv('"a\rb",c').rows).toEqual([['a\rb', 'c']]);
  expect(parseCsv('').rows).toEqual([]);
  expect(parseCsv('\n\n').rows).toEqual([]);
});

test('toCsv of nothing is empty and quotes CR', () => {
  expect(toCsv([])).toBe('');
  expect(toCsv([['a\rb']])).toBe('"a\rb"\n');
});
