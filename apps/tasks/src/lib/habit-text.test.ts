import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, habitProgress, parseDone, parseTasks } from '@omark/tasks-core';
import type { WeekCtx } from '@omark/tasks-core';
import { habitStateLine, habitWarning } from './habit-text.ts';

const TODAY = '2026-10-16'; // a Friday
const ctx: WeekCtx = { today: TODAY, weekStart: 1 };
const day = (d: string) => `2026-10-${d}`;

/** The state line of the one habit in `tasks` (its title is `Meditate`), with `done` as done.md. */
function line(tasks: string, done = ''): string {
  const { task, p } = progress(tasks, done);
  return habitStateLine(task, p, ctx);
}
function progress(tasks: string, done = '') {
  const task = parseTasks(`# Tasks\n${tasks}\n`).items.flatMap((i) => (i.kind === 'task' ? [i.task] : []))[0]!;
  return { task, p: habitProgress(task, parseDone(done), TODAY, DEFAULT_CONFIG.habits) };
}
const ticks = (rule: string, ...days: string[]) => days.map((d) => `- [x] Meditate ${rule} ✅ ${day(d)}\n`).join('');

const DAILY = '🌱 🔁 every day';

describe('habitStateLine', () => {
  it('a fresh daily habit shows only its misses', () => {
    expect(line(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`)).toBe('misses 0/6');
  });

  it('a missed yesterday is the last chance', () => {
    expect(line(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`, ticks(DAILY, '13', '14'))).toBe(
      'missed yesterday · one more miss restarts · misses 1/6',
    );
  });

  it('done today shows the estimate', () => {
    expect(line(`- [ ] Meditate ${DAILY} 📅 2026-10-17`, ticks(DAILY, '15', '16'))).toMatch(
      /^done today · misses 0\/6 · formed ~ \d+ \w{3}( '\d\d)?$/,
    );
  });

  it('a restart shows the attempt and best', () => {
    expect(line(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`, ticks(DAILY, '11', '12'))).toBe('attempt 2 (best 2)');
  });

  it('a weekly habit leads with its days', () => {
    const rule = '🌱 🔁 every week on Monday, Wednesday, Friday';
    expect(line(`- [ ] Meditate ${rule} 📅 ${TODAY}`)).toMatch(/^Mon, Wed, Fri · misses 0\/\d+$/);
  });

  it('a missed longer period says last time', () => {
    const rule = '🌱 🔁 every week on Monday';
    expect(line(`- [ ] Meditate ${rule} 📅 ${TODAY}`, `- [x] Meditate ${rule} ✅ 2026-09-21
- [x] Meditate ${rule} ✅ 2026-09-28
`)).toBe('Mon · missed last time · one more miss restarts · misses 1/6');
  });

  it('done in a longer period says this period', () => {
    const rule = '🌱 🔁 every week on Monday';
    expect(line(`- [ ] Meditate ${rule} 📅 ${TODAY}`, ticks(rule, '12'))).toBe("Mon · done this period · misses 0/6 · formed ~ 10 Jan '28");
  });
});

describe('habitWarning', () => {
  const warning = (tasks: string, done = '') => habitWarning(progress(tasks, done).p);

  it('nothing to warn about', () => {
    expect(warning(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`, ticks(DAILY, '15'))).toBeNull();
  });

  it('a missed yesterday', () => {
    expect(warning(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`, ticks(DAILY, '13', '14'))).toBe(
      'Missed yesterday. Miss today and the count restarts at 0.',
    );
  });

  it('a missed longer period', () => {
    const rule = '🌱 🔁 every week on Monday';
    const done = `- [x] Meditate ${rule} ✅ 2026-09-21
- [x] Meditate ${rule} ✅ 2026-09-28
`;
    expect(warning(`- [ ] Meditate ${rule} 📅 ${TODAY}`, done)).toBe(
      'Missed last time. Miss this one and the count restarts at 0.',
    );
  });

  it('no misses left this attempt, with none in a row', () => {
    // Six single misses on 2, 4, …, 12 Oct, each made up the next day: the seventh would restart.
    const done = ticks(DAILY, '01', '03', '05', '07', '09', '11', '13', '14', '15');
    expect(warning(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`, done)).toBe('Miss today and the count restarts at 0.');
  });

  it('a restart', () => {
    expect(warning(`- [ ] Meditate ${DAILY} 📅 ${TODAY}`, ticks(DAILY, '11', '12'))).toBe(
      'Restarted · best 2. The next tick starts attempt 2.',
    );
  });
});
