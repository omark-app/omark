import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_YAML, parseConfig } from '../src/config.ts';

describe('parseConfig', () => {
  it('empty and comment-only files give defaults', () => {
    expect(parseConfig('')).toEqual({ config: DEFAULT_CONFIG, error: null });
    expect(parseConfig('# nothing\n\n  \n')).toEqual({ config: DEFAULT_CONFIG, error: null });
  });

  it('the default YAML parses to the defaults', () => {
    expect(parseConfig(DEFAULT_CONFIG_YAML)).toEqual({ config: DEFAULT_CONFIG, error: null });
  });

  it('default YAML has a comment line above every setting', () => {
    const lines = DEFAULT_CONFIG_YAML.split('\n');
    lines.forEach((l, i) => {
      if (/^[A-Za-z]/.test(l)) expect(lines[i - 1]!.startsWith('#')).toBe(true);
    });
    for (const k of ['shortcuts', 'defaultView', 'firstDayOfWeek', 'foldedOnOpen', 'theme', 'dateLabels', 'newTaskBucket', 'saveDelaySeconds']) {
      expect(DEFAULT_CONFIG_YAML).toContain(`${k}:`);
    }
    expect(DEFAULT_CONFIG_YAML).toContain('Detect all file extensions');
  });

  it('overrides one setting', () => {
    expect(parseConfig('theme: dark\n')).toEqual({ config: { ...DEFAULT_CONFIG, theme: 'dark' }, error: null });
  });

  it('merges partial shortcuts per command', () => {
    const { config, error } = parseConfig('shortcuts:\n  complete: c\n');
    expect(error).toBeNull();
    expect(config.shortcuts).toEqual({ ...DEFAULT_CONFIG.shortcuts, complete: ['c'] });
  });

  it('accepts shortcut lists', () => {
    const { config } = parseConfig('shortcuts:\n  complete: [c, C]\n');
    expect(config.shortcuts.complete).toEqual(['c', 'C']);
  });

  it('reports YAML syntax errors with a line', () => {
    const r = parseConfig('theme: [\n');
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.error?.line).toBe(1);
  });

  it('rejects negative saveDelaySeconds', () => {
    const r = parseConfig('saveDelaySeconds: -1\n');
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.error?.line).toBe(1);
    expect(r.error?.message).toContain('saveDelaySeconds');
  });

  it('accepts saveDelaySeconds 0 and decimals', () => {
    expect(parseConfig('saveDelaySeconds: 0\n').config.saveDelaySeconds).toBe(0);
    expect(parseConfig('saveDelaySeconds: 0.5\n').config.saveDelaySeconds).toBe(0.5);
    expect(parseConfig('saveDelaySeconds: abc\n').error?.line).toBe(1);
  });

  it('rejects unknown settings', () => {
    const r = parseConfig('theme: dark\nfoo: 1\n');
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.error).toEqual({ line: 2, message: 'Unknown setting "foo"' });
  });

  it('rejects unknown commands', () => {
    const r = parseConfig('shortcuts:\n  fly: f\n');
    expect(r.error?.line).toBe(2);
    expect(r.error?.message).toContain('fly');
  });

  it('rejects duplicate keys across commands, naming both', () => {
    const r = parseConfig('shortcuts:\n  complete: x\n  someday: x\n');
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.error?.message).toContain('complete');
    expect(r.error?.message).toContain('someday');
    expect(r.error?.message).toContain('"x"');
  });

  it('rejects a new binding that collides with an unchanged default', () => {
    const r = parseConfig('shortcuts:\n  complete: j\n');
    expect(r.error?.message).toContain('down');
  });

  it('rejects bad shortcut values', () => {
    expect(parseConfig('shortcuts:\n  complete: []\n').error).not.toBeNull();
    expect(parseConfig('shortcuts:\n  complete: 5\n').error).not.toBeNull();
    expect(parseConfig('shortcuts:\n  complete: [a, 1]\n').error).not.toBeNull();
    expect(parseConfig('shortcuts: x\n').error).not.toBeNull();
  });

  it('validates defaultView', () => {
    expect(parseConfig('defaultView: board\n').config.defaultView).toBe('board');
    expect(parseConfig('defaultView: grid\n').error?.message).toContain('defaultView');
  });

  it('validates firstDayOfWeek case-insensitively', () => {
    expect(parseConfig('firstDayOfWeek: Sunday\n').config.firstDayOfWeek).toBe(6);
    expect(parseConfig('firstDayOfWeek: wednesday\n').config.firstDayOfWeek).toBe(2);
    expect(parseConfig('firstDayOfWeek: funday\n').error?.message).toContain('firstDayOfWeek');
  });

  it('validates foldedOnOpen', () => {
    expect(parseConfig('foldedOnOpen: [week]\n').config.foldedOnOpen).toEqual(['week']);
    expect(parseConfig('foldedOnOpen: []\n').config.foldedOnOpen).toEqual([]);
    expect(parseConfig('foldedOnOpen: [overdue, later]\n').config.foldedOnOpen).toEqual(['overdue', 'later']);
    expect(parseConfig('foldedOnOpen: [bogus]\n').error?.message).toContain('foldedOnOpen');
    expect(parseConfig('foldedOnOpen: later\n').error?.message).toContain('foldedOnOpen');
  });

  it('validates theme', () => {
    expect(parseConfig('theme: pink\n').error?.message).toContain('theme');
  });

  it('validates dateLabels', () => {
    expect(parseConfig('dateLabels: iso\n').config.dateLabels).toBe('iso');
    expect(parseConfig('dateLabels: long\n').error?.message).toContain('dateLabels');
  });

  it('validates newTaskBucket', () => {
    expect(parseConfig('newTaskBucket: week\n').config.newTaskBucket).toBe('week');
    expect(parseConfig('newTaskBucket: later\n').error?.message).toContain('newTaskBucket');
  });

  it('rejects a non-mapping document', () => {
    expect(parseConfig('- a\n- b\n').error).not.toBeNull();
    expect(parseConfig('just text\n').error).not.toBeNull();
  });
});
