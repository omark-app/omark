import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { allTasks } from '@taskapp/core';
import { createWorkspace, FakeOneDrive, MemoryCache } from '@taskapp/storage';
import { createStore } from './store.svelte.ts';

// A rune test file: `$effect` here only runs if runes compile for Svelte's client runtime.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
});

it('an $effect sees stats and the toast change after add and complete', async () => {
  const drive = new FakeOneDrive({ 'tasks.md': '# Always\n\n# Tasks\n' });
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
