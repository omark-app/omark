import { describe, expect, it } from 'vitest';
import { defaults, fieldId, keyOwner, readSettings } from '../src/index.ts';
import type { KeysField, Schema } from '../src/index.ts';

const keys: KeysField = {
  type: 'keys',
  path: ['shortcuts'],
  label: 'Shortcuts',
  commands: [
    { id: 'a', label: 'A', default: ['x'] },
    { id: 'b', label: 'B', default: ['y'] },
    { id: 'c', label: 'C', default: [','] },
  ],
  yielding: ['c'],
};

const demo: Schema = {
  app: 'demo',
  file: 'config.yaml',
  sections: [
    {
      id: 'main',
      title: 'Main',
      fields: [
        {
          type: 'choice',
          path: ['theme'],
          label: 'Theme',
          options: [
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
          ],
          default: 'system',
        },
        { type: 'number', path: ['delay'], label: 'Delay', default: 1, min: 0 },
        {
          type: 'set',
          path: ['folded'],
          label: 'Folded',
          options: [
            { value: 'x1', label: 'X1' },
            { value: 'x2', label: 'X2' },
          ],
          default: ['x2'],
          retired: ['overdue'],
        },
        { type: 'number', path: ['habits', 'goal'], label: 'Goal', default: 30, integer: true, min: 1, max: 999 },
        { type: 'number', path: ['habits', 'misses'], label: 'Misses', default: '10%', percent: true, min: 0, max: 100 },
        keys,
      ],
    },
  ],
};

const err = (text: string) => readSettings(demo, text).error;

describe('readSettings', () => {
  it('gives the defaults for an empty file', () => {
    expect(readSettings(demo, '')).toEqual({ values: defaults(demo), error: null });
    expect(fieldId(keys)).toBe('shortcuts');
  });

  it('reads a choice and a nested number', () => {
    expect(readSettings(demo, 'theme: dark\n').values.theme).toBe('dark');
    expect(readSettings(demo, 'habits:\n  goal: 30\n').values['habits.goal']).toBe(30);
  });

  it('reports an out-of-range number on its line', () => {
    const e = err('habits:\n  goal: 0\n');
    expect(e?.line).toBe(2);
    expect(e?.message).toContain('habits.goal');
  });

  it('reads percentages', () => {
    expect(readSettings(demo, 'habits:\n  misses: 25%\n').values['habits.misses']).toBe('25%');
    expect(err('habits:\n  misses: 101%\n')).not.toBeNull();
  });

  it('names unknown settings', () => {
    expect(err('foo: 1\n')).toEqual({ line: 1, message: 'Unknown setting "foo"' });
    expect(err('habits:\n  foo: 1\n')).toEqual({ line: 2, message: 'Unknown setting "habits.foo"' });
  });

  it('checks shortcuts', () => {
    expect(err('shortcuts:\n  zz: q\n')).toEqual({ line: 2, message: 'Unknown shortcut command "zz"' });
    expect(err('shortcuts:\n  a: y\n')?.message).toBe('Key "y" is bound to both a and b');
  });

  it('lets a yielding command give way to a bound key', () => {
    const r = readSettings(demo, 'shortcuts:\n  a: ","\n');
    expect(r.error).toBeNull();
    expect((r.values.shortcuts as Record<string, string[]>).c).toEqual([]);
  });

  it('drops retired set members', () => {
    expect(readSettings(demo, 'folded: [overdue, x1]').values.folded).toEqual(['x1']);
  });

  it('reports a YAML error on its line', () => {
    expect(err('theme: [\n')?.line).toBe(1);
  });

  it('finds the owner of a key', () => {
    expect(keyOwner(keys, { a: ['x'], b: ['y'], c: [] }, 'y')).toBe('b');
    expect(keyOwner(keys, { a: ['x'], b: ['y'], c: [] }, 'q')).toBeNull();
  });
});
