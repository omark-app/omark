import { expect, test } from 'vitest';
import { computeStats, formatStats, parseDone, type Stats } from '../src/index.ts';

const TODAY = '2026-10-16';

const dated = (...dates: string[]) => parseDone(dates.map((d) => `- [x] Task ✅ ${d}`).join('\n') + '\n');

test('no entries: zeros and dashes', () => {
  const s = computeStats(parseDone(''), TODAY);
  expect(s).toEqual({ today: 0, avg: null, last7: 0, prev7: null, trend: null, all: 0 });
  expect(formatStats(s)).toBe('Today 0 (–) · 7d 0 (–) · All 0');
});

test('only entries from today: no average yet', () => {
  const s = computeStats(dated(TODAY, TODAY), TODAY);
  expect(s.today).toBe(2);
  expect(s.avg).toBeNull();
  expect(s.all).toBe(2);
});

test('average counts zero days, excludes today, and 7d comparison waits for 14 days', () => {
  const doc = dated('2026-10-14', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-16', '2026-10-16');
  const s = computeStats(doc, TODAY);
  expect(s).toEqual({ today: 3, avg: 1.5, last7: 3, prev7: null, trend: null, all: 6 });
  expect(formatStats(s)).toBe('Today 3 (1.5) · 7d 3 (–) · All 6');
});

test('prev7 and trend over 14 full days', () => {
  const up = dated('2026-10-02', '2026-10-09', '2026-10-09', '2026-10-15', '2026-10-15', '2026-10-15');
  const s = computeStats(up, TODAY);
  expect(s).toEqual({ today: 0, avg: 6 / 14, last7: 5, prev7: 1, trend: 'up', all: 6 });
  expect(formatStats(s)).toBe('Today 0 (0.4) · 7d 5 (1 ↑) · All 6');

  const down = dated('2026-10-02', '2026-10-02', '2026-10-02', '2026-10-15');
  const d = computeStats(down, TODAY);
  expect(d.trend).toBe('down');
  expect(formatStats(d)).toBe('Today 0 (0.3) · 7d 1 (3 ↓) · All 4');

  const flat = dated('2026-10-02', '2026-10-10');
  const f = computeStats(flat, TODAY);
  expect(f.trend).toBe('flat');
  expect(formatStats(f)).toBe('Today 0 (0.1) · 7d 1 (1 →) · All 2');
});

test('lines without an entry or a done date are not counted', () => {
  const doc = parseDone('- [x] no date\nrandom\n- [ ] open ✅ 2026-10-16\n- [x] Real ✅ 2026-10-16\n');
  expect(computeStats(doc, TODAY)).toMatchObject({ today: 1, all: 1 });
});

test('recurring completions each count; entries after today count toward all only', () => {
  const doc = parseDone('- [x] Water 🔁 every day ✅ 2026-10-15\n- [x] Water 🔁 every day ✅ 2026-10-16\n- [x] Future ✅ 2026-10-20\n');
  expect(computeStats(doc, TODAY)).toMatchObject({ today: 1, last7: 1, all: 3 });
});

test('avg is shown to one decimal place', () => {
  const s: Stats = { today: 4, avg: 3.2, last7: 23, prev7: 19, trend: 'up', all: 412 };
  expect(formatStats(s)).toBe('Today 4 (3.2) · 7d 23 (19 ↑) · All 412');
});
