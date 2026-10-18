import { describe, expect, test } from 'vitest';
import type { DoneEntry, Task } from '../src/index.ts';
import { foldText, markedParts, parseDone, queryWords, searchDone, searchTasks } from '../src/index.ts';

const mk = (title: string, notes: string[] = [], date: string | null = null): Task => ({
  id: title, title, notes, date, repeat: null, raw: null, rawKey: null,
});
const titles = (hits: { task: Task }[]) => hits.map((h) => h.task.title);

describe('foldText', () => {
  test('lowercases and strips diacritics, ł and Ł included', () => {
    expect(foldText('Zwłóknienia')).toBe('zwloknienia');
    expect(foldText('ŁÓDŹ żółć ĘĄŚŃ')).toBe('lodz zolc easn');
  });

  test('folds text that is already decomposed', () => {
    expect(foldText('zwłóknienia')).toBe('zwloknienia');
  });
});

test('queryWords splits on any whitespace and drops repeats', () => {
  expect(queryWords('  Kot\tkot  PIES ')).toEqual(['kot', 'pies']);
  expect(queryWords('   ')).toEqual([]);
});

describe('searchTasks', () => {
  const tasks = [
    mk('Badanie zwłóknienia wątroby', ['wyniki u dr Nowak'], '2026-10-20'),
    mk('Call the dentist about the crown', ['ask about zirconia'], '2026-10-16'),
    mk('Water the plants', [], '2026-10-19'),
    mk('Learn Polish sign language'),
  ];

  test('a blank query finds nothing', () => {
    expect(searchTasks(tasks, '')).toEqual([]);
    expect(searchTasks(tasks, '  ')).toEqual([]);
  });

  test('matching ignores case and diacritics, both ways', () => {
    expect(titles(searchTasks(tasks, 'zwloknienia'))).toEqual(['Badanie zwłóknienia wątroby']);
    expect(titles(searchTasks([mk('zwloknienia bez ogonków')], 'ZWŁÓKNIENIA'))).toEqual(['zwloknienia bez ogonków']);
    expect(titles(searchTasks(tasks, 'WATROBY'))).toEqual(['Badanie zwłóknienia wątroby']);
  });

  test('every word must appear, in any order, as part of a word', () => {
    expect(titles(searchTasks(tasks, 'crown dent'))).toEqual(['Call the dentist about the crown']);
    expect(titles(searchTasks(tasks, 'crown plants'))).toEqual([]);
    expect(titles(searchTasks(tasks, 'the'))).toEqual(['Call the dentist about the crown', 'Water the plants']);
  });

  test('words may be split between the title and the notes', () => {
    const hits = searchTasks(tasks, 'dentist zirconia');
    expect(titles(hits)).toEqual(['Call the dentist about the crown']);
    expect(hits[0]!.tier).toBe(1);
    expect(hits[0]!.note).toEqual({ text: 'ask about zirconia', marks: [[10, 18]] });
  });

  test('a note-only match carries its note line; a title match carries none', () => {
    const [hit] = searchTasks(tasks, 'nowak');
    expect(hit!.tier).toBe(2);
    expect(hit!.note).toEqual({ text: 'wyniki u dr Nowak', marks: [[12, 17]] });
    expect(hit!.title.marks).toEqual([]);
    expect(searchTasks(tasks, 'crown')[0]!.note).toBeNull();
  });

  test('the note shown is the one holding the most words', () => {
    const [hit] = searchTasks([mk('Trip', ['pack the tent', 'tent pegs and rope', 'rope'])], 'rope tent');
    expect(hit!.note!.text).toBe('tent pegs and rope');
  });

  test('title matches come first, then mixed, then note-only; each by date, undated last', () => {
    const list = [
      mk('notes only, early', ['milk'], '2026-10-01'),
      mk('milk, undated'),
      mk('milk, late', [], '2026-12-01'),
      mk('milk, early', [], '2026-10-02'),
      mk('note and title: oat', ['milk'], '2026-09-01'),
    ];
    expect(titles(searchTasks(list, 'milk'))).toEqual([
      'milk, early', 'milk, late', 'milk, undated', 'note and title: oat', 'notes only, early',
    ]);
    expect(titles(searchTasks(list, 'milk oat'))).toEqual(['note and title: oat']);
  });

  test('marks cover every occurrence in the original text, merged and diacritics kept', () => {
    const [hit] = searchTasks([mk('Żółw żółty, ZOLW')], 'zol zolw');
    expect(hit!.title.marks).toEqual([[0, 4], [5, 8], [12, 16]]);
    expect(markedParts(hit!.title)).toEqual([
      { text: 'Żółw', hit: true }, { text: ' ', hit: false }, { text: 'żół', hit: true },
      { text: 'ty, ', hit: false }, { text: 'ZOLW', hit: true },
    ]);
  });

  test('a mark includes combining marks of a decomposed character', () => {
    const [hit] = searchTasks([mk('zwłók')], 'zwlo');
    expect(hit!.title.marks).toEqual([[0, 5]]);
  });
});

describe('searchDone', () => {
  const done = parseDone(
    [
      '- [x] Send the invoice ✅ 2026-09-02',
      '    - for October',
      '- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-12',
      'free text',
      '- [x] Invoice for Kowalski ✅ 2026-10-14',
      '- [x] Wysłać fakturę ✅ 2026-10-14',
    ].join('\n'),
  );

  test('matches done titles, newest first, a later line first on the same day', () => {
    expect(searchDone(done, 'invoice').map((h) => [h.entry.title, h.index])).toEqual([
      ['Invoice for Kowalski', 4],
      ['Send the invoice', 0],
    ]);
    expect(searchDone(done, 'faktur wyslac').map((h) => h.entry.doneOn)).toEqual(['2026-10-14']);
    expect(searchDone(done, 'plants').map((h) => h.entry.doneOn)).toEqual(['2026-10-12']);
    expect(searchDone(done, 'free')).toEqual([]);
    expect(searchDone(done, '')).toEqual([]);
  });

  test('matches done notes when the entry has them, title matches first', () => {
    const withNotes = (title: string, doneOn: string, notes: string[]) =>
      ({ title, repeat: null, doneOn, notes }) as DoneEntry;
    const doc = {
      lines: [
        { entry: withNotes('Call the bank', '2026-10-15', ['ask about the loan']), raw: '' },
        { entry: withNotes('Loan papers', '2026-09-01', []), raw: '' },
      ],
    };
    const hits = searchDone(doc, 'loan');
    expect(hits.map((h) => h.entry.title)).toEqual(['Loan papers', 'Call the bank']);
    expect(hits[1]!.note).toEqual({ text: 'ask about the loan', marks: [[14, 18]] });
  });
});
