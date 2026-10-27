import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { allTasks } from '@omark/tasks-core';
import { FakeOneDrive, MemoryCache } from '@omark/storage';
import { createStore } from './store.svelte.ts';
import { createTaskEdit } from './task-edit.svelte.ts';
import { createWorkspace } from './workspace.ts';

// A rune test file: `$effect` here only runs if runes compile for Svelte's client runtime.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
});

it('an $effect sees stats and the toast change after add and complete', async () => {
  const drive = new FakeOneDrive({ 'tasks.md': '# Tasks\n' });
  const store = await createStore({
    workspace: createWorkspace(drive, new MemoryCache()),
    clock: { now: () => new Date(2026, 9, 16, 9, 0) },
    isPhone: () => false,
  });

  const seen: string[] = [];
  const stop = $effect.root(() => {
    $effect(() => {
      seen.push(`${store.stats.today} ${store.toast?.message ?? '-'}`);
    });
  });
  flushSync();

  store.add('Buy milk');
  flushSync();
  store.complete(allTasks(store.state.doc)[0]!.id);
  flushSync();
  stop();

  expect(seen).toEqual(['0 -', '0 Added to Today', '1 Done · Buy milk']);
});

it('flush runs registered pending callbacks before staging, until unregistered', async () => {
  const drive = new FakeOneDrive({ 'tasks.md': '# Tasks\n- [ ] Buy milk\n' });
  const store = await createStore({
    workspace: createWorkspace(drive, new MemoryCache()),
    clock: { now: () => new Date(2026, 9, 16, 9, 0) },
    isPhone: () => false,
  });
  const id = allTasks(store.state.doc)[0]!.id;
  const off = store.registerPending(() => store.edit(id, { title: 'Buy oat milk', notes: [] }));
  await store.flush();
  expect(allTasks(store.state.doc)[0]!.title).toBe('Buy oat milk');
  expect(drive.peek('tasks.md')).toContain('Buy oat milk');
  off();
  const run = vi.fn();
  const off2 = store.registerPending(run);
  off2();
  await store.flush();
  expect(run).not.toHaveBeenCalled();
});

it('a pending flush does not rename a habit', async () => {
  const drive = new FakeOneDrive({
    'tasks.md': '# Tasks\n- [ ] Meditate 🌱 🔁 every day 📅 2026-10-16\n',
    'done.md': '- [x] Meditate 🌱 🔁 every day ✅ 2026-10-15\n',
  });
  let answer = false;
  const asked: string[] = [];
  const store = await createStore({
    workspace: createWorkspace(drive, new MemoryCache()),
    clock: { now: () => new Date(2026, 9, 16, 9, 0) },
    isPhone: () => false,
    confirm: (m) => {
      asked.push(m);
      return answer;
    },
  });
  const id = allTasks(store.state.doc)[0]!.id;
  const task = () => allTasks(store.state.doc)[0]!;
  let edit!: ReturnType<typeof createTaskEdit>;
  const stop = $effect.root(() => {
    edit = createTaskEdit(store, id);
  });
  flushSync();

  edit.title = 'Meditate 15 min';
  edit.typed('title');
  edit.notes = 'quietly';
  edit.typed('notes');
  // The page being hidden saves the notes; the rename waits for a final commit (Review Focus 5).
  await store.flush();
  expect(asked).toEqual([]);
  expect(task()).toMatchObject({ title: 'Meditate', notes: ['quietly'] });
  expect(edit.title).toBe('Meditate 15 min');

  // A final commit asks; no puts the stored title back.
  edit.commit(false, true);
  expect(asked).toEqual(['Renaming restarts Meditate at 0. Rename?']);
  expect(task().title).toBe('Meditate');
  expect(edit.title).toBe('Meditate');

  edit.title = 'Meditate 15 min';
  edit.typed('title');
  answer = true;
  edit.commit(false, true);
  expect(task().title).toBe('Meditate 15 min');
  stop();
});
