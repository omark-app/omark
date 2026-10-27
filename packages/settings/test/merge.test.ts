import { describe, expect, it } from 'vitest';
import { mergeSettings } from '../src/index.ts';
import { demo } from './demo.ts';

const theme = demo.sections[0]!.fields[0]!;
const delay = demo.sections[0]!.fields[1]!;
const goal = demo.sections[0]!.fields[3]!;
const keysField = demo.sections[0]!.fields[5]!;

describe('mergeSettings', () => {
  it('takes the other side when one side is unchanged', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 1\n', 'delay: 2\n')).toEqual({ text: 'delay: 2\n', conflicts: [], dropped: false });
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 3\n', 'delay: 1\n')).toEqual({ text: 'delay: 3\n', conflicts: [], dropped: false });
  });

  it('keeps both sides when different keys changed', () => {
    expect(mergeSettings(demo, '', 'theme: dark\n', '# r\ndelay: 2\n')).toEqual({
      text: '# r\ndelay: 2\ntheme: dark\n',
      conflicts: [],
      dropped: false,
    });
  });

  it('lets local win a conflict and lists it', () => {
    expect(mergeSettings(demo, 'theme: light\n', 'theme: dark\n', 'theme: system\n')).toEqual({
      text: 'theme: dark\n',
      conflicts: [theme],
      dropped: false,
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

  it('keeps the remote when any side does not parse, unless the remote is the base', () => {
    expect(mergeSettings(demo, 'delay: [\n', 'delay: 2\n', 'delay: 3\n')).toMatchObject({ text: 'delay: 3\n', dropped: 'unsafe' });
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: [\n', 'delay: 3\n')).toMatchObject({ text: 'delay: 3\n', dropped: 'unsafe' });
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: [\n', 'delay: 1\n')).toEqual({ text: 'delay: [\n', conflicts: [], dropped: false });
  });

  it('keeps a remote that does not parse unchanged and lists what local changed', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 2\ntheme: dark\n', 'delay: [\n')).toEqual({
      text: 'delay: [\n',
      conflicts: [theme, delay],
      dropped: 'remote-broken',
    });
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 2\n', '- a\n')).toEqual({ text: '- a\n', conflicts: [delay], dropped: 'remote-broken' });
  });

  it('keeps an unknown key in the remote and local\'s change too', () => {
    const remote = '# mine\ndelay: 2\nnewer: 5   # from a newer build\n';
    expect(mergeSettings(demo, '# mine\ndelay: 2\n', '# mine\ndelay: 2\ntheme: dark\n', remote)).toEqual({
      text: remote + 'theme: dark\n',
      conflicts: [],
      dropped: false,
    });
  });

  it('keeps a bad value in the remote and adds local\'s change', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 1\ntheme: dark\n', '# r\ndelay: -3\n')).toEqual({
      text: '# r\ndelay: -3\ntheme: dark\n',
      conflicts: [],
      dropped: false,
    });
  });

  it('keeps a remote with two reader errors when local fixes the first one', () => {
    expect(mergeSettings(demo, 'delay: 1\n', 'delay: 2\n', 'delay: -3\nnewer: 5\n')).toEqual({
      text: 'delay: 2\nnewer: 5\n',
      conflicts: [delay],
      dropped: false,
    });
  });

  it('keeps the remote when a change cannot be written into it safely', () => {
    const remote = 'habits:\n  goal: &g 5\n  misses: *g\n';
    expect(mergeSettings(demo, '', 'habits:\n  goal: 6\n', remote)).toEqual({ text: remote, conflicts: [goal], dropped: 'unsafe' });
  });

  it('returns local when the merged text would not read', () => {
    const r = mergeSettings(demo, '', 'shortcuts:\n  a: q\n', 'shortcuts:\n  b: q\n');
    expect(r).toEqual({ text: 'shortcuts:\n  a: q\n', conflicts: [keysField], dropped: false });
  });
});
