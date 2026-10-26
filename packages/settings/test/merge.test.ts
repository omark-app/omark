import { describe, expect, it } from 'vitest';
import { mergeSettings } from '../src/index.ts';
import { demo } from './demo.ts';

const theme = demo.sections[0]!.fields[0]!;
const keysField = demo.sections[0]!.fields[5]!;

describe('mergeSettings', () => {
  it('takes the other side when one side is unchanged', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 1\n', 'delay: 2\n')).toEqual({ text: 'delay: 2\n', conflicts: [] });
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 3\n', 'delay: 1\n')).toEqual({ text: 'delay: 3\n', conflicts: [] });
  });

  it('keeps both sides when different keys changed', () => {
    expect(mergeSettings(demo, '', 'theme: dark\n', '# r\ndelay: 2\n')).toEqual({
      text: '# r\ndelay: 2\ntheme: dark\n',
      conflicts: [],
    });
  });

  it('lets local win a conflict and lists it', () => {
    expect(mergeSettings(demo, 'theme: light\n', 'theme: dark\n', 'theme: system\n')).toEqual({
      text: 'theme: dark\n',
      conflicts: [theme],
    });
  });

  it('is no conflict when both made the same change', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 2\n', 'delay: 2\n\n').conflicts).toEqual([]);
  });

  it('removes a key local removed', () => {
    expect(mergeSettings(demo, 'theme: dark\ndelay: 1\n', 'delay: 1\n', 'theme: dark\ndelay: 5\n').text).toBe('delay: 5\n');
  });

  it('merges nested keys and shortcut commands one by one', () => {
    const r = mergeSettings(demo, '', 'shortcuts:\n  a: q\n', 'shortcuts:\n  b: w\nhabits:\n  goal: 5\n');
    expect(r.conflicts).toEqual([]);
    expect(r.text).toBe('shortcuts:\n  b: w\n  a: q\nhabits:\n  goal: 5\n');
  });

  it('lists a keys field once when several commands conflict', () => {
    const r = mergeSettings(demo, '', 'shortcuts:\n  a: q\n  b: w\n', 'shortcuts:\n  a: e\n  b: r\n');
    expect(r.conflicts).toEqual([keysField]);
    expect(r.text).toContain('a: q');
    expect(r.text).toContain('b: w');
  });

  it('returns local when any side does not parse', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 2\n', 'delay: [\n')).toEqual({ text: 'delay: 2\n', conflicts: [] });
    expect(mergeSettings(demo, 'delay: [\n', 'delay: 2\n', 'delay: 3\n').text).toBe('delay: 2\n');
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: [\n', 'delay: 3\n').text).toBe('delay: [\n');
  });

  it('returns local when the merged text would not read', () => {
    const r = mergeSettings(demo, '', 'shortcuts:\n  a: q\n', 'shortcuts:\n  b: q\n');
    expect(r).toEqual({ text: 'shortcuts:\n  a: q\n', conflicts: [keysField] });
  });
});

