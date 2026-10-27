import { describe, expect, it } from 'vitest';
import { applyField, capturedKey, captureKey, displayKey, numberInput, readSettings, valueOf, writeOnInput } from '../src/index.ts';
import type { NumberField } from '../src/index.ts';
import { demo, keys } from './demo.ts';

const theme = demo.sections[0]!.fields[0]!;
const delay = demo.sections[0]!.fields[1]!;
const goal = demo.sections[0]!.fields[3]!;

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

  it('says in plain words when the writer cannot change the file safely', () => {
    const plain = { error: "Can't change this safely here. Use Edit as text." };
    expect(applyField(demo, 'delay: [\n', theme, 'dark')).toEqual(plain);
    expect(applyField(demo, 'habits:\n  goal: &g 5\n  misses: *g\n', goal, 6)).toEqual(plain);
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

  it('refuses a key a yielding default shows, even when the file does not set it', () => {
    expect(captureKey(keys, cur, 'a', 0, ',')).toEqual({ error: '`,` is already C' });
  });

  it('names the command that took a yielding default, not the one that gave way', () => {
    // The reader leaves a yielding command no keys once the file gives its key to another.
    const gaveWay = { a: ['x'], b: [','], c: [] };
    expect(captureKey(keys, gaveWay, 'a', 0, ',')).toEqual({ error: '`,` is already B' });
  });
});

describe('valueOf', () => {
  it('reads a field from the values', () => {
    expect(valueOf(readSettings(demo, 'theme: dark\n').values, theme)).toBe('dark');
  });
});

describe('capturedKey', () => {
  it('lowercases a letter typed without Shift, so Caps Lock does not change it', () => {
    expect(capturedKey({ key: 'C', shiftKey: false })).toBe('c');
    expect(capturedKey({ key: 'c', shiftKey: false })).toBe('c');
  });

  it('keeps a letter typed with Shift, and named keys, as they are', () => {
    expect(capturedKey({ key: 'C', shiftKey: true })).toBe('C');
    expect(capturedKey({ key: 'Enter', shiftKey: false })).toBe('Enter');
    expect(capturedKey({ key: 'F2', shiftKey: false })).toBe('F2');
    expect(capturedKey({ key: '?', shiftKey: true })).toBe('?');
  });
});

describe('displayKey', () => {
  it('names the keys that have no printable face', () => {
    expect(displayKey(' ')).toBe('Space');
    expect(displayKey('ArrowDown')).toBe('↓');
    expect(displayKey('ArrowUp')).toBe('↑');
    expect(displayKey('ArrowLeft')).toBe('←');
    expect(displayKey('ArrowRight')).toBe('→');
    expect(displayKey('Escape')).toBe('Esc');
    expect(displayKey('Backspace')).toBe('⌫');
    expect(displayKey('Delete')).toBe('Del');
    expect(displayKey('Enter')).toBe('↵ Enter');
  });

  it('shows any other key as it is', () => {
    expect(displayKey('x')).toBe('x');
    expect(displayKey(',')).toBe(',');
    expect(displayKey('F2')).toBe('F2');
  });
});

describe('numberInput', () => {
  const goal = demo.sections[0]!.fields[3] as NumberField;
  const misses = demo.sections[0]!.fields[4] as NumberField;

  it('reads a typed number', () => {
    expect(numberInput(delay as NumberField, '1.5')).toEqual({ value: 1.5 });
    expect(numberInput(goal, ' 66 ')).toEqual({ value: 66 });
  });

  it('gives the reader reason for a bad or empty value', () => {
    expect(numberInput(delay as NumberField, '')).toEqual({ error: 'delay must be a number ≥ 0' });
    expect(numberInput(delay as NumberField, '-1')).toEqual({ error: 'delay must be a number ≥ 0' });
    expect(numberInput(goal, '1.5')).toEqual({ error: 'habits.goal must be a whole number from 1 to 999' });
  });

  it('keeps a percentage as text for a percent field', () => {
    expect(numberInput(misses, '10%')).toEqual({ value: '10%' });
    expect(numberInput(misses, '3')).toEqual({ value: 3 });
    expect(numberInput(misses, '120%')).toEqual({ error: 'habits.misses must be a number from 0 to 100 or a percentage from 0% to 100%' });
    expect(numberInput(misses, 'ten')).toEqual({ error: 'habits.misses must be a number from 0 to 100 or a percentage from 0% to 100%' });
  });
});

describe('writeOnInput', () => {
  const d = delay as NumberField;

  it('writes a value other than the default at once', () => {
    expect(writeOnInput(d, 15, 3)).toBe(true);
    expect(writeOnInput(d, 3, 1)).toBe(true);
  });

  it('waits with the default while the file sets another value, so its line and comment stay', () => {
    // Typing 15 over "delay: 3  # slow phone" passes through 1, the default.
    expect(writeOnInput(d, 1, 3)).toBe(false);
  });

  it('writes the default when the file has it already (nothing changes)', () => {
    expect(writeOnInput(d, 1, 1)).toBe(true);
  });
});
