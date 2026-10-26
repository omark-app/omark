import { describe, expect, test } from 'vitest';
import { carryDismissed, dateForChoice, readQuickAdd, shortcutWords, type WeekCtx } from '../src/index.ts';

// Monday 2026-10-19.
const mon: WeekCtx = { today: '2026-10-19', weekStart: 0 };
const sun: WeekCtx = { today: '2026-10-25', weekStart: 0 };

const kinds = (text: string) => shortcutWords(text).map((w) => [w.word, w.kind]);
const dateOf = (text: string, ctx = mon) => {
  const r = readQuickAdd(text, ctx);
  return r.when === null ? undefined : dateForChoice(r.when, ctx);
};

describe('shortcutWords (#19)', () => {
  test('the 3-letter form and the full word match, in any case', () => {
    expect(kinds('a tod b TODAY c Tom d tomorrow e imp f Important g som h SomeDay')).toEqual([
      ['tod', 'today'], ['TODAY', 'today'], ['Tom', 'tomorrow'], ['tomorrow', 'tomorrow'],
      ['imp', 'important'], ['Important', 'important'], ['som', 'someday'], ['SomeDay', 'someday'],
    ]);
    expect(kinds('mon tue wed thu fri sat sun Monday tuesday wednesday thursday friday saturday sunday').map((k) => k[1]))
      .toEqual(Array(14).fill('weekday'));
  });

  test('other forms and other words do not match', () => {
    for (const text of ['to', 'tomo', 'tomato', 'some milk', 'frid', 'Monitor', 'next', 'nex', 'impo', 'xtom', 'tom,']) {
      expect(kinds(text)).toEqual([]);
    }
  });

  test('gives each word its place in the text and its weekday', () => {
    expect(shortcutWords('Call  fri')).toEqual([{ start: 6, end: 9, word: 'fri', kind: 'weekday', weekday: 4 }]);
  });

  test('a dismissed word is plain text', () => {
    expect(kinds('Buy sun cream')).toEqual([['sun', 'weekday']]);
    expect(shortcutWords('Buy sun cream', [{ start: 4, word: 'sun' }])).toEqual([]);
    expect(shortcutWords('sun sun', [{ start: 4, word: 'sun' }]).map((w) => w.start)).toEqual([0]);
  });
});

describe('readQuickAdd (#19)', () => {
  test('takes the words out of the title and gives the date and flag', () => {
    expect(readQuickAdd('Call the bank imp tom', mon)).toEqual({ title: 'Call the bank', when: 'tomorrow', important: true });
    expect(readQuickAdd('tod Pay  rent', mon)).toEqual({ title: 'Pay  rent', when: 'today', important: false });
    expect(readQuickAdd('Learn Rust som', mon)).toEqual({ title: 'Learn Rust', when: 'someday', important: false });
    expect(readQuickAdd('Plain task', mon)).toEqual({ title: 'Plain task', when: null, important: false });
  });

  test('weekday words give the next such day after today', () => {
    expect(dateOf('Deck fri')).toBe('2026-10-23');
    expect(dateOf('Deck tue')).toBe('2026-10-20');
    expect(dateOf('Deck mon')).toBe('2026-10-26');
    expect(dateOf('Deck sun')).toBe('2026-10-25');
    expect(dateOf('Deck sun', sun)).toBe('2026-11-01');
  });

  test('today, tomorrow and someday give their dates; tomorrow on a Sunday is Monday', () => {
    expect(dateOf('x tod')).toBe('2026-10-19');
    expect(dateOf('x tom')).toBe('2026-10-20');
    expect(dateOf('x tom', sun)).toBe('2026-10-26');
    expect(dateOf('x som')).toBeNull();
  });

  test('with two dates the last one wins, and both leave the title', () => {
    expect(readQuickAdd('Gym tom fri', mon)).toMatchObject({ title: 'Gym', when: { date: '2026-10-23' } });
    expect(readQuickAdd('Gym fri tom', mon)).toMatchObject({ title: 'Gym', when: 'tomorrow' });
  });

  test('a dismissed word stays in the title', () => {
    expect(readQuickAdd('Buy sun cream', mon, [{ start: 4, word: 'sun' }])).toEqual({
      title: 'Buy sun cream', when: null, important: false,
    });
  });

  test('a title made only of shortcut words is empty', () => {
    expect(readQuickAdd('tom imp', mon).title).toBe('');
  });
});

describe('carryDismissed (#19)', () => {
  const d = [{ start: 4, word: 'sun' }];
  const starts = (x: { start: number }[]) => x.map((y) => y.start);

  test('survives a space or text typed after it', () => {
    expect(carryDismissed(d, 'Buy sun', 'Buy sun ')).toEqual(d);
    expect(carryDismissed(d, 'Buy sun ', 'Buy sun cream')).toEqual(d);
  });

  test('shifts with text typed or deleted before it', () => {
    expect(starts(carryDismissed(d, 'Buy sun cream', 'Buy a sun cream'))).toEqual([6]);
    expect(starts(carryDismissed(d, 'Buy sun', 'Go buy sun'))).toEqual([7]);
    expect(starts(carryDismissed(d, 'Buy sun', 'sun'))).toEqual([0]);
  });

  test('is dropped when the word itself changes; retyping it counts again', () => {
    expect(carryDismissed(d, 'Buy sun', 'Buy su')).toEqual([]);
    expect(carryDismissed(d, 'Buy sun', 'Buy sunn')).toEqual([]);
    expect(carryDismissed(d, 'Buy sun', 'Buy xsun')).toEqual([]);
    const retyped = carryDismissed(carryDismissed(d, 'Buy sun', 'Buy su'), 'Buy su', 'Buy sun');
    expect(shortcutWords('Buy sun', retyped)).toHaveLength(1);
  });

  test('is dropped when its text is gone', () => {
    expect(carryDismissed(d, 'Buy sun', '')).toEqual([]);
  });
});

describe('review fixes (#19)', () => {
  test('words inside a typed 🔁 rule are not shortcut words', () => {
    expect(readQuickAdd('Gym 🔁 every week on Monday', mon)).toEqual({
      title: 'Gym 🔁 every week on Monday', when: null, important: false,
    });
    expect(readQuickAdd('Bins 🔁 every week on tuesday 📅 2026-10-30 imp', mon)).toMatchObject({
      title: 'Bins 🔁 every week on tuesday 📅 2026-10-30', important: true,
    });
  });

  test('a typed 📅 date wins over a date word, as the saved line reads', () => {
    expect(readQuickAdd('Pay 📅 2026-10-30 tom', mon)).toMatchObject({ when: { date: '2026-10-30' } });
  });
});
