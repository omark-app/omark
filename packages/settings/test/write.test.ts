import { describe, expect, it } from 'vitest';
import { isNode, parseDocument } from 'yaml';
import { setSetting } from '../src/index.ts';
import type { Path } from '../src/index.ts';

/** A copy of DEFAULT_CONFIG_YAML from tasks-core (this package must not import it). */
const DEFAULT_STYLE = `# Omark Tasks settings.
# This file only needs the settings you want to change; anything missing uses the built-in default.
# If this file has a mistake, the app shows a banner and uses the defaults until it is fixed.
# Obsidian hides .yaml files unless Settings > Files and links > "Detect all file extensions" is on.

# Keyboard shortcuts: each command takes one key or a list of keys (KeyboardEvent.key names, e.g. Enter, Escape, ArrowDown).
# A key can only be bound to one command.
shortcuts:
  focusAdd: ['/', 'n']
  down: ['j', 'ArrowDown']
  up: ['k', 'ArrowUp']
  today: t
  tomorrow: m
  thisWeek: w
  nextWeek: e
  pickDate: d
  someday: s
  repeat: r
  important: i
  complete: x
  edit: Enter
  delete: ['Delete', 'Backspace']
  deselect: Escape
  undo: z
  switchView: v
  search: f

# View shown on desktop when the app opens: list or board.
defaultView: list

# First day of the week: monday, tuesday, wednesday, thursday, friday, saturday or sunday.
firstDayOfWeek: monday

# Buckets that start folded when the app opens: any of today, tomorrow, week, next, later, someday.
# Empty buckets always start folded.
foldedOnOpen: [later, someday]

# Colour theme: system, light or dark.
theme: system

# How dates are shown on tasks: short (Thu, 12 Nov) or iso (2026-11-12).
dateLabels: short

# Bucket for tasks added with the add box: today, tomorrow, week, next or someday.
newTaskBucket: today

# Seconds to wait after you stop typing before saving (0 or more).
saveDelaySeconds: 1
`;

const DEMO = '# Theme\ntheme: system   # mine\n# after\nother: 1\n';

/** Sets the value and checks the result reads back with no errors. */
function set(text: string, path: Path, value: unknown): string {
  const out = setSetting(text, path, value);
  const doc = parseDocument(out);
  expect(doc.errors).toEqual([]);
  const got: unknown = doc.getIn(path);
  expect(isNode(got) ? got.toJSON() : got).toEqual(value);
  return out;
}

describe('setSetting', () => {
  it('replaces only the value', () => {
    expect(set(DEMO, ['theme'], 'dark')).toBe('# Theme\ntheme: dark   # mine\n# after\nother: 1\n');
  });

  describe('keeps every other line', () => {
    const files = {
      'flow and block values': 'shortcuts: {a: q}\nfolded:\n  - x1\n',
      CRLF: '# c\r\nshortcuts:\r\n  a: q\r\nfolded:\r\n  - x1\r\n',
      'no final newline': 'other: 1\ntheme: system',
      'the default file': DEFAULT_STYLE,
    };
    const others = (s: string) => s.split('\n').filter((l) => !l.startsWith('theme:'));
    for (const [name, text] of Object.entries(files)) {
      it(name, () => {
        const out = set(text, ['theme'], 'dark');
        expect(others(out)).toEqual(others(text));
        expect(out.split('\n').filter((l) => l.startsWith('theme:')).length).toBe(1);
      });
    }

    it('writes new lines with CRLF in a CRLF file', () => {
      expect(set(files.CRLF, ['theme'], 'dark')).toBe(files.CRLF + 'theme: dark\r\n');
      expect(set(files.CRLF, ['shortcuts', 'b'], 'z')).toBe('# c\r\nshortcuts:\r\n  a: q\r\n  b: z\r\nfolded:\r\n  - x1\r\n');
    });
  });

  describe('adds a key', () => {
    it('to the root', () => {
      expect(set('# only a comment\n', ['theme'], 'dark')).toBe('# only a comment\ntheme: dark\n');
      expect(set('', ['theme'], 'dark')).toBe('theme: dark\n');
      expect(set('other: 1', ['theme'], 'dark')).toBe('other: 1\ntheme: dark\n');
    });

    it('with its missing parent', () => {
      expect(set('theme: dark\n', ['habits', 'goal'], 30)).toBe('theme: dark\nhabits:\n  goal: 30\n');
    });

    it('after the last item of its parent, at the same indent', () => {
      const text = 'shortcuts:\n  a: q   # mine\n# after\nother: 1\n';
      expect(set(text, ['shortcuts', 'b'], 'z')).toBe('shortcuts:\n  a: q   # mine\n  b: z\n# after\nother: 1\n');
    });
  });

  describe('removes a key', () => {
    it('deletes exactly its line', () => {
      expect(set(DEMO, ['theme'], undefined)).toBe('# Theme\n# after\nother: 1\n');
    });

    it('removes a parent left empty, but keeps the comment above it', () => {
      const text = 'theme: dark\n# keys\nshortcuts:\n  a: q\nother: 1\n';
      expect(set(text, ['shortcuts', 'a'], undefined)).toBe('theme: dark\n# keys\nother: 1\n');
    });

    it('from a flow parent', () => {
      expect(set('shortcuts: {a: q, b: z}\n', ['shortcuts', 'a'], undefined)).toBe('shortcuts: {b: z}\n');
    });

    it('leaves the text alone when the key is missing', () => {
      expect(set(DEMO, ['nope'], undefined)).toBe(DEMO);
    });
  });

  it('quotes values only where needed', () => {
    expect(set('a: 1\n', ['a'], [','])).toBe("a: [',']\n");
    expect(set('a: 1\n', ['a'], 'Escape')).toBe('a: Escape\n');
    expect(set('a: 1\n', ['a'], ['/', 'n'])).toBe("a: ['/', 'n']\n");
    expect(set('a: 1\n', ['a'], '10%')).toBe('a: 10%\n');
  });

  it('replaces a block value with a flow one', () => {
    expect(set('folded:\n  - x1\n', ['folded'], ['x1', 'x2'])).toBe('folded: [x1, x2]\n');
  });

  it('fills an empty value', () => {
    expect(set('theme:\nother: 1\n', ['theme'], 'dark')).toBe('theme: dark\nother: 1\n');
  });

  it('fills an empty value that has a comment', () => {
    expect(set('theme:   # c\nother: 1\n', ['theme'], 'dark')).toBe('theme: dark   # c\nother: 1\n');
    expect(set('habits:   # c\n', ['habits', 'goal'], 30)).toBe('habits: {goal: 30}   # c\n');
  });

  it('replaces a block scalar', () => {
    expect(set('theme: |\n  dark\nother: 1\n', ['theme'], 'light')).toBe('theme: light\nother: 1\n');
  });

  it('adds at a 4-space indent', () => {
    expect(set('s:\n    a: q\nother: 1\n', ['s', 'b'], 'z')).toBe('s:\n    a: q\n    b: z\nother: 1\n');
  });

  it('replaces under a quoted key', () => {
    expect(set("'theme': system\n", ['theme'], 'dark')).toBe("'theme': dark\n");
  });

  it('removes a key between comment lines', () => {
    const text = 'a: 1\n# about b\nb: 2\n# about c\nc: 3\n';
    expect(set(text, ['b'], undefined)).toBe('a: 1\n# about b\n# about c\nc: 3\n');
  });

  it('removes a key in a CRLF file', () => {
    expect(set('a: 1\r\ntheme: x\r\nb: 2\r\n', ['theme'], undefined)).toBe('a: 1\r\nb: 2\r\n');
  });

  it('edits a nested parent followed by top-level keys', () => {
    const text = 'habits:\n  goal: 3\ntheme: dark\n';
    expect(set(text, ['habits', 'skip'], 'x')).toBe('habits:\n  goal: 3\n  skip: x\ntheme: dark\n');
    expect(set(text, ['habits', 'goal'], undefined)).toBe('theme: dark\n');
  });

  it('throws on a broken file', () => {
    expect(() => setSetting('theme: [\n', ['theme'], 'dark')).toThrow('config.yaml has a mistake; fix it as text first');
    expect(() => setSetting('- a\n', ['theme'], 'dark')).toThrow('config.yaml has a mistake; fix it as text first');
  });
});
