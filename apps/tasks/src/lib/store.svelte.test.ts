import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { allTasks } from '@omark/tasks-core';
import { FakeOneDrive, MemoryCache } from '@omark/storage';
import { createStore } from './store.svelte.ts';
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
