import { describe, expect, it } from 'vitest';
import { entryPart, partsOf, route, withParts } from './suite.ts';

describe('partsOf: the suite config.yaml', () => {
  it('is Tasks alone when there is no file, an empty one, or no parts key', () => {
    expect(partsOf(null)).toEqual(['tasks']);
    expect(partsOf('')).toEqual(['tasks']);
    expect(partsOf('theme: dark\n')).toEqual(['tasks']);
  });

  it('keeps the order the file gives, which is the tab order', () => {
    expect(partsOf('parts: [goals, tasks, time]\n')).toEqual(['goals', 'tasks', 'time']);
    expect(partsOf('parts:\n  - time\n')).toEqual(['time']);
  });

  it('drops unknown and repeated names, and never leaves no part on', () => {
    expect(partsOf('parts: [time, notes, time]\n')).toEqual(['time']);
    expect(partsOf('parts: []\n')).toEqual(['tasks']);
    expect(partsOf('parts: [notes]\n')).toEqual(['tasks']);
  });

  it('reads a broken file as Tasks alone', () => {
    expect(partsOf('parts: [tasks\n')).toEqual(['tasks']);
  });
});

describe('withParts: writing the parts', () => {
  it('writes into an empty or missing file', () => {
    expect(partsOf(withParts(null, ['tasks', 'time']))).toEqual(['tasks', 'time']);
  });

  it('keeps every other byte of the file', () => {
    const text = '# my Omark\ntheme: dark   # keep\nparts: [tasks]\nextra:\n  a: 1\n';
    expect(withParts(text, ['tasks', 'goals'])).toBe('# my Omark\ntheme: dark   # keep\nparts: [tasks, goals]\nextra:\n  a: 1\n');
  });

  it('refuses no parts at all', () => {
    expect(() => withParts(null, [])).toThrow(/part/);
  });
});

describe('route: the address to a screen', () => {
  const on = ['tasks', 'time'] as const;

  it('opens the first part on at /', () => {
    expect(route('/', on)).toEqual({ go: '/tasks' });
    expect(route('/', ['time'])).toEqual({ go: '/time' });
  });

  it("opens a part that is on at its path, with or without a trailing slash", () => {
    expect(route('/time', on)).toEqual({ open: 'time' });
    expect(route('/tasks/', on)).toEqual({ open: 'tasks' });
  });

  it('offers to turn on a part that is off', () => {
    expect(route('/goals', on)).toEqual({ offer: 'goals' });
  });

  it('sends any other path to the first part on', () => {
    expect(route('/nowhere', on)).toEqual({ go: '/tasks' });
    expect(route('/tasks/x', on)).toEqual({ go: '/tasks' });
  });
});

describe('entryPart: what the first run ticks', () => {
  it('ticks the part in the entry path, else Tasks', () => {
    expect(entryPart('/time')).toBe('time');
    expect(entryPart('/goals/')).toBe('goals');
    expect(entryPart('/')).toBe('tasks');
    expect(entryPart('/elsewhere')).toBe('tasks');
  });
});
