import { describe, expect, it } from 'vitest';
import { applyField, captureKey, readSettings, valueOf } from '../src/index.ts';
import { demo, keys } from './demo.ts';

const theme = demo.sections[0]!.fields[0]!;
const delay = demo.sections[0]!.fields[1]!;

describe('applyField', () => {
  it('writes a value and removes the key at its default', () => {
    expect(applyField(demo, '', theme, 'dark')).toEqual({ text: 'theme: dark\n' });
    expect(applyField(demo, '# c\ntheme: dark\n', theme, 'system')).toEqual({ text: '# c\n' });
  });

  it('returns the reader error for a bad value', () => {
    expect(applyField(demo, '', delay, -1)).toEqual({ error: 'delay must be a number ≥ 0' });
  });

  it('returns an error instead of throwing on a broken file', () => {
    expect('error' in applyField(demo, 'delay: [\n', theme, 'dark')).toBe(true);
  });

  it('writes only the keys command that changed', () => {
    const r = applyField(demo, 'shortcuts:\n  b: w\n', keys, { a: ['q'], b: ['w'], c: [','] });
    expect(r).toEqual({ text: 'shortcuts:\n  b: w\n  a: q\n' });
  });

  it('writes two keys as a list and removes a command back at its default', () => {
    expect(applyField(demo, '', keys, { a: ['q', 'r'], b: ['y'], c: [','] })).toEqual({ text: 'shortcuts:\n  a: [q, r]\n' });
    expect(applyField(demo, 'shortcuts:\n  a: q\n', keys, { a: ['x'], b: ['y'], c: [','] })).toEqual({ text: '' });
  });

  it('accepts a key a yielding default holds', () => {
    const r = applyField(demo, '', keys, { a: [','], b: ['y'], c: [] });
    expect(r).toEqual({ text: "shortcuts:\n  a: ','\n" });
    if ('text' in r) expect(readSettings(demo, r.text).error).toBeNull();
  });

  it('refuses an empty list for a command that does not yield', () => {
    expect('error' in applyField(demo, '', keys, { a: [], b: ['y'], c: [','] })).toBe(true);
  });

  it('refuses a key two commands hold', () => {
    expect(applyField(demo, '', keys, { a: ['y'], b: ['y'], c: [','] })).toEqual({ error: 'Key "y" is bound to both a and b' });
  });
});

describe('captureKey', () => {
  const cur = { a: ['x'], b: ['y'], c: [','] };

  it('replaces a key or appends at the end', () => {
    expect(captureKey(keys, cur, 'a', 0, 'q')).toEqual({ keys: { a: ['q'], b: ['y'], c: [','] } });
    expect(captureKey(keys, cur, 'a', 1, 'q')).toEqual({ keys: { a: ['x', 'q'], b: ['y'], c: [','] } });
    expect(cur.a).toEqual(['x']);
  });

  it('does nothing when the command already has the key elsewhere', () => {
    const two = { ...cur, a: ['x', 'q'] };
    expect(captureKey(keys, two, 'a', 0, 'q')).toEqual({ keys: two });
  });

  it('names the command that holds the key', () => {
    expect(captureKey(keys, cur, 'a', 0, 'y')).toEqual({ error: '`y` is already B' });
  });

  it('lets a yielding default give way unless it is set in the file', () => {
    expect(captureKey(keys, cur, 'a', 0, ',', new Set(['b']))).toEqual({ keys: { a: [','], b: ['y'], c: [','] } });
    expect(captureKey(keys, cur, 'a', 0, ',', new Set(['c']))).toEqual({ error: '`,` is already C' });
    expect(captureKey(keys, cur, 'a', 0, ',')).toEqual({ error: '`,` is already C' });
  });
});

describe('valueOf', () => {
  it('reads a field from the values', () => {
    expect(valueOf(readSettings(demo, 'theme: dark\n').values, theme)).toBe('dark');
  });
});
