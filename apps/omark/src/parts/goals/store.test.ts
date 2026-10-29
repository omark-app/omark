import { describe, expect, it } from 'vitest';
import { areas } from '@omark/goals-core';
import { FakeOneDrive, MemoryCache } from '@omark/storage';
import { GoalsStore } from './store.svelte.ts';

const TODAY = '2026-10-29';
const PROJECTS = 'code,description,client,rate,currency,archived\nCLIMB,Climbing trips,,,,\n';

function folders(seed: { goals?: Record<string, string>; top?: Record<string, string>; tasks?: Record<string, string>; time?: Record<string, string> } = {}) {
  const f = {
    goals: new FakeOneDrive(seed.goals),
    top: new FakeOneDrive(seed.top),
    tasks: new FakeOneDrive(seed.tasks),
    time: new FakeOneDrive(seed.time),
  };
  const store = new GoalsStore({ ...f, cache: new MemoryCache(), today: () => TODAY });
  return { ...f, store };
}

describe('GoalsStore', () => {
  it('opens an empty folder as the first run and writes nothing until the first edit', async () => {
    const { store, goals } = folders();
    await store.open();
    expect(store.firstRun).toBe(true);
    expect(goals.names()).toEqual([]);
    await store.addArea('Home');
    await store.settled();
    expect(goals.peek('goals.md')).toBe('## Home #home\n');
    expect(store.firstRun).toBe(false);
  });

  it('edits go through goals-core and keep the other lines byte for byte', async () => {
    const text = '# Vision\n\nCalm.\n\n<!-- mine -->\n\n## Home #home\n- [ ] Fix the roof 📅 2027-01-01 ➕ 2026-01-01\n';
    const { store, goals } = folders({ goals: { 'goals.md': text } });
    await store.open();
    await store.addGoal(0, { text: 'Paint the hall', due: '2027-03-01' });
    await store.settled();
    expect(goals.peek('goals.md')).toBe(text + `- [ ] Paint the hall 📅 2027-03-01 ➕ ${TODAY}\n`);
    await store.editGoal(0, 1, { achieved: true });
    await store.settled();
    expect(areas(store.doc)[0]!.goals[1]).toMatchObject({ achieved: true, doneOn: TODAY });
  });

  it('reads the facts from the other parts: activity, hours, open tasks and habits, and never writes there', async () => {
    const { store, tasks, time, top } = folders({
      goals: { 'goals.md': '## Climbing #climbing\n- [ ] Trips #CLIMB 📅 2027-12-31 ➕ 2025-01-01\n## Family #family\n' },
      top: { 'projects.csv': PROJECTS },
      tasks: {
        'tasks.md': '# Tasks\n\n- [ ] Book flights #CLIMB 📅 2026-11-01\n- [ ] Walk #family 🌱 🔁 every day 📅 2026-10-29\n',
        'done.md': '- [x] Walk #family 🌱 🔁 every day ✅ 2026-10-28\n',
      },
      time: { 'events-2026.csv': 'date,start,end,hours,project,category,description,all_day,known,calendar,event_id\n2026-10-20,2026-10-20T09:00+01:00,2026-10-20T11:00+01:00,2,CLIMB,Gym,,false,true,primary,e1\n' },
    });
    await store.open();
    const [climbing, family] = store.activity;
    expect(climbing).toMatchObject({ codes: ['CLIMB'], lastActivity: '2026-10-20', needsUpdate: false });
    expect(family).toMatchObject({ lastActivity: '2026-10-28', linked: true });
    expect(store.factsFor(areas(store.doc)[0]!.goals[0]!)).toEqual({ hoursThisMonth: 2, hoursSinceSet: 2, openTasks: 1 });
    expect(store.habitsFor(areas(store.doc)[1]!).map((h) => h.title)).toEqual(['Walk #family']);
    expect(store.projects.map((p) => p.code)).toEqual(['CLIMB']);
    expect(tasks.names().sort()).toEqual(['done.md', 'tasks.md']);
    expect(time.names()).toEqual(['events-2026.csv']);
    expect(top.peek('projects.csv')).toBe(PROJECTS);
  });

  it('a stale area needs an update; a missing file gives no facts, not a false alarm', async () => {
    const { store } = folders({ goals: { 'goals.md': '## Home #home\n- [ ] Fix the roof ➕ 2025-01-01\n' } });
    await store.open();
    expect(store.activity[0]).toMatchObject({ needsUpdate: true, lastActivity: '2025-01-01' });
    const fresh = folders({ goals: { 'goals.md': '## Home #home\n- [ ] Fix the roof ➕ 2025-01-01\n', 'config.yaml': 'stale_after: 24\n' } });
    await fresh.store.open();
    expect(fresh.store.activity[0]!.needsUpdate).toBe(false);
  });

  it('creates a project in projects.csv with a code and description only, refusing a taken or bad code', async () => {
    const { store, top } = folders({ top: { 'projects.csv': PROJECTS } });
    await store.open();
    expect(await store.addProject('climb', 'Again')).toMatch(/already/i);
    expect(await store.addProject('1X', 'Bad')).not.toBeNull();
    expect(await store.addProject('HOME', 'The house')).toBeNull();
    await store.settled();
    expect(top.peek('projects.csv')).toBe(`${PROJECTS}HOME,The house,,,,\n`);
    expect(store.projects.map((p) => p.code)).toEqual(['CLIMB', 'HOME']);
  });

  it('a new project with no projects.csv yet creates it with the header', async () => {
    const { store, top } = folders();
    await store.open();
    expect(await store.addProject('HOME', 'The house')).toBeNull();
    await store.settled();
    expect(top.peek('projects.csv')).toBe('code,description,client,rate,currency,archived\nHOME,The house,,,,\n');
  });
});
