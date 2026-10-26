import { describe, expect, it } from 'vitest';
import {
  allTasks, editTask, canStartHabit, completeTask, doneBlocks, dropHabit, findTask, formedHabits, formHabit, habitHistory, habitsInProgress,
  parseDone, parseTasks, restoreTask, serializeDone, serializeTasks, setHabit, setHabitGoal, setRepeat,
  type HabitConfig, type State,
} from '../src/index.ts';

const CONFIG: HabitConfig = { maxInProgress: 3, goal: 66, missesInARow: 1, missesPerAttempt: { percent: 10 } };
const TODAY = '2026-10-20';

function make(tasks: string, done = ''): State {
  let n = 0;
  return { doc: parseTasks(tasks, () => `id${++n}`), done: parseDone(done) };
}
const idOf = (s: State, title: string) => allTasks(s.doc).find((t) => t.title === title)!.id;
const text = (s: State) => serializeTasks(s.doc);
const tick = (title: string, d: string, rule = 'every day') => `- [x] ${title} 🌱 🔁 ${rule} ✅ ${d}`;

describe('setHabit and setHabitGoal', () => {
  const s = make('# Tasks\n- [ ] Meditate 🔁 every day 📅 2026-10-20\n    - ten minutes\n- [ ] Plain\n- [ ] Later 🔁 every 2 days when done\n');

  it('on adds 🌱, off removes it and its goal, nothing else changes', () => {
    const on = setHabit(s, idOf(s, 'Meditate'), true);
    expect(text(on)).toContain('- [ ] Meditate 🌱 🔁 every day 📅 2026-10-20\n    - ten minutes');
    const goal = setHabitGoal(on, idOf(on, 'Meditate'), 30);
    expect(text(goal)).toContain('Meditate 🌱 30 🔁 every day');
    const off = setHabit(goal, idOf(goal, 'Meditate'), false);
    expect(text(off)).toBe(text(s));
  });

  it('is the same state when already a habit, with no rule, or with when done', () => {
    const on = setHabit(s, idOf(s, 'Meditate'), true);
    expect(setHabit(on, idOf(on, 'Meditate'), true)).toBe(on);
    expect(setHabit(s, idOf(s, 'Plain'), true)).toBe(s);
    expect(setHabit(s, idOf(s, 'Later'), true)).toBe(s);
  });

  it('a goal is 1–999 or null, and only on a habit', () => {
    const on = setHabit(s, idOf(s, 'Meditate'), true);
    const id = idOf(on, 'Meditate');
    expect(findTask(setHabitGoal(on, id, 999), id)!.habit).toEqual({ goal: 999 });
    expect(findTask(setHabitGoal(setHabitGoal(on, id, 5), id, null), id)!.habit).toEqual({ goal: null });
    for (const bad of [0, 1000, 2.5, -1, Number.NaN]) expect(setHabitGoal(on, id, bad)).toBe(on);
    expect(setHabitGoal(s, idOf(s, 'Plain'), 5)).toBe(s);
  });
});

describe('setRepeat drops the habit with an unusable rule', () => {
  it('none or when done leaves no 🌱 anywhere', () => {
    const s = make('# Tasks\n- [ ] Meditate 🌱 30 🔁 every day 📅 2026-10-20\n');
    const id = idOf(s, 'Meditate');
    for (const rule of [null, { type: 'after', n: 2 } as const]) {
      const next = setRepeat(s, id, rule, TODAY);
      expect(text(next)).not.toContain('🌱');
      expect(findTask(next, id)!.habit).toBeUndefined();
    }
    expect(text(setRepeat(s, id, { type: 'weekdays' }, TODAY))).toContain('Meditate 🌱 30 🔁 every weekday');
  });
});

describe('editTask with a typed rule', () => {
  it('a rule a habit cannot have, typed into the title, ends the habit and leaves no 🌱', () => {
    const s = make('# Tasks\n- [ ] Meditate 🌱 30 🔁 every day 📅 2026-10-20\n');
    const id = idOf(s, 'Meditate');
    const next = editTask(s, id, { title: 'Meditate 🔁 every 2 days when done', notes: [] });
    expect(findTask(next, id)!.habit).toBeUndefined();
    expect(text(next)).not.toContain('🌱');
  });
});

describe('formHabit, dropHabit and restoreTask', () => {
  const tasks = '# Tasks\n- [ ] A\n- [ ] Meditate 🌱 🔁 every day 📅 2026-10-20\n    - ten minutes\n- [ ] B\n';

  it('formHabit removes the block, appends the formed line, returns the task and its index', () => {
    const s = make(tasks);
    const r = formHabit(s, idOf(s, 'Meditate'), TODAY)!;
    expect(text(r.state)).toBe('# Tasks\n- [ ] A\n- [ ] B\n');
    // Formed by a goal or config change, no completion line carries the notes: the 🏆 line does.
    expect(serializeDone(r.state.done)).toBe('- [x] Meditate 🌱 🏆 2026-10-20\n    - ten minutes\n');
    expect(r.at).toBe(1);
    expect(r.task).toMatchObject({ title: 'Meditate', notes: ['ten minutes'], habit: { goal: null } });
  });

  it('formed by today\'s completion, the notes stay under the completion line only', () => {
    const s = make(tasks);
    const { state } = completeTask(s, idOf(s, 'Meditate'), TODAY);
    const r = formHabit(state, idOf(state, 'Meditate'), TODAY)!;
    expect(serializeDone(r.state.done)).toBe(`${tick('Meditate', TODAY)}\n    - ten minutes\n- [x] Meditate 🌱 🏆 2026-10-20\n`);
  });

  it('the notes under a 🏆 line read back as its block, and merge with it', () => {
    const s = make(tasks);
    const done = serializeDone(formHabit(s, idOf(s, 'Meditate'), TODAY)!.state.done);
    const d = parseDone(done);
    expect(d.lines.map((l) => [l.end?.kind ?? null, l.raw])).toEqual([
      ['formed', '- [x] Meditate 🌱 🏆 2026-10-20'], [null, '    - ten minutes'],
    ]);
    expect(habitHistory(d, CONFIG).formed).toHaveLength(1);
    expect(doneBlocks(done)).toEqual(['- [x] Meditate 🌱 🏆 2026-10-20\n    - ten minutes']);
  });

  it('restoreTask with the task minus its habit puts it back where it was', () => {
    const s = make(tasks);
    const r = formHabit(s, idOf(s, 'Meditate'), TODAY)!;
    const { habit: _, ...plain } = r.task;
    const back = restoreTask(r.state, plain, r.at);
    expect(text(back)).toBe(text(setHabit(s, idOf(s, 'Meditate'), false)));
    expect(restoreTask(r.state, plain, 99).doc.items.at(-1)).toMatchObject({ kind: 'task', task: { title: 'Meditate' } });
  });

  it('null for an unknown id or a non-habit', () => {
    const s = make(tasks);
    expect(formHabit(s, 'nope', TODAY)).toBeNull();
    expect(formHabit(s, idOf(s, 'A'), TODAY)).toBeNull();
  });

  it('dropHabit removes the block and appends the dropped line', () => {
    const s = make(tasks);
    const next = dropHabit(s, idOf(s, 'Meditate'), TODAY);
    expect(text(next)).toBe('# Tasks\n- [ ] A\n- [ ] B\n');
    expect(serializeDone(next.done)).toBe('- [-] Meditate 🌱 ❌ 2026-10-20\n');
    expect(dropHabit(s, idOf(s, 'A'), TODAY)).toBe(s);
  });
});

describe('canStartHabit and habitsInProgress', () => {
  const habits = (n: number) =>
    make(`# Tasks\n${Array.from({ length: n }, (_, i) => `- [ ] H${i} 🌱 🔁 every day`).join('\n')}\n- [ ] Plain\n`);
  it('is true under the limit, false at or over it, true with no limit', () => {
    expect(habitsInProgress(habits(2).doc)).toHaveLength(2);
    expect(canStartHabit(habits(2).doc, CONFIG)).toBe(true);
    expect(canStartHabit(habits(3).doc, CONFIG)).toBe(false);
    expect(canStartHabit(habits(4).doc, CONFIG)).toBe(false);
    expect(canStartHabit(habits(4).doc, { ...CONFIG, maxInProgress: 0 })).toBe(true);
  });
});

describe('formedHabits', () => {
  it('lists the open habits that reached the goal, in file order', () => {
    const s = make(
      '# Tasks\n- [ ] A 🌱 2 🔁 every day\n- [ ] B 🌱 🔁 every day\n- [ ] C 🌱 1 🔁 every day\n',
      [tick('A', '2026-10-19'), tick('A', '2026-10-20'), tick('B', '2026-10-20'), tick('C', '2026-10-20')].join('\n') + '\n',
    );
    expect(formedHabits(s, TODAY, CONFIG)).toEqual([idOf(s, 'A'), idOf(s, 'C')]);
  });

  it('counts a habit completed through completeTask', () => {
    const s = make('# Tasks\n- [ ] Meditate 🌱 🔁 every day 📅 2026-10-20\n');
    const { state } = completeTask(s, idOf(s, 'Meditate'), TODAY);
    expect(formedHabits(state, TODAY, { ...CONFIG, goal: 1 })).toEqual([idOf(state, 'Meditate')]);
  });
});

describe('habitHistory', () => {
  it('a formed habit with one restart', () => {
    const d = parseDone([
      tick('Read', '2026-09-01'), tick('Read', '2026-09-02'),
      tick('Read', '2026-09-10'), tick('Read', '2026-09-11'), tick('Read', '2026-09-12'),
      '- [x] Read 🌱 🏆 2026-09-12',
    ].join('\n') + '\n');
    expect(habitHistory(d, CONFIG)).toEqual({
      formed: [{ title: 'Read', goal: 3, first: '2026-09-10', last: '2026-09-12', days: 3, attempts: 2 }],
      dropped: [],
    });
  });

  it('a dropped habit has its best count and attempts', () => {
    const d = parseDone([
      tick('Gym', '2026-09-01'), tick('Gym', '2026-09-02'), tick('Gym', '2026-09-03'),
      tick('Gym', '2026-09-10'),
      '- [-] Gym 🌱 ❌ 2026-09-12',
    ].join('\n') + '\n');
    expect(habitHistory(d, CONFIG)).toEqual({
      formed: [], dropped: [{ title: 'Gym', best: 3, attempts: 2, on: '2026-09-12' }],
    });
  });

  it('a title dropped, added again and formed shows in both lists, newest first', () => {
    const d = parseDone([
      tick('Walk', '2026-08-01'),
      '- [-] Walk 🌱 ❌ 2026-08-05',
      tick('Walk', '2026-09-01'), tick('Walk', '2026-09-02'),
      '- [x] Walk 🌱 🏆 2026-09-02',
      tick('Run', '2026-09-03'),
      '- [-] Run 🌱 ❌ 2026-09-04',
    ].join('\n') + '\n');
    const h = habitHistory(d, CONFIG);
    expect(h.formed).toEqual([{ title: 'Walk', goal: 2, first: '2026-09-01', last: '2026-09-02', days: 2, attempts: 1 }]);
    expect(h.dropped.map((r) => [r.title, r.on])).toEqual([['Run', '2026-09-04'], ['Walk', '2026-08-05']]);
  });

  it('walks with the rule of the last completion', () => {
    const d = parseDone([
      tick('Swim', '2026-09-07', 'every week on Monday'), tick('Swim', '2026-09-14', 'every week on Monday'),
      '- [x] Swim 🌱 🏆 2026-09-14',
    ].join('\n') + '\n');
    expect(habitHistory(d, CONFIG).formed[0]).toMatchObject({ goal: 2, attempts: 1, days: 8 });
  });
});
