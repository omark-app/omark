import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allTasks, DEFAULT_CONFIG, findTask, tasksInBucket } from '@taskapp/core';
import type { BucketKey } from '@taskapp/core';
import { createWorkspace, FakeOneDrive, MemoryCache } from '@taskapp/storage';
import type { CachedFile, FileName, LocalCache, Workspace } from '@taskapp/storage';
import { createStore } from './store.svelte.ts';
import type { AppStore } from './store.svelte.ts';

const SEED_TASKS = `# Always
- Walk before the first coffee

# Tasks
- [ ] Call the dentist 📅 2026-10-16
    - bring the old x-ray
- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-19
- [ ] Send the invoice 📅 2026-10-17
- [ ] Learn Polish sign language
`;

let now: Date;
const clock = { now: () => now };

/** A MemoryCache whose writes can be made to fail, like a full or blocked IndexedDB. */
class FlakyCache extends MemoryCache {
  failing = false;
  override async put(name: FileName, f: CachedFile): Promise<void> {
    if (this.failing) throw new Error('QuotaExceededError');
    return super.put(name, f);
  }
}

async function setup(
  seed: Partial<Record<FileName, string>> = { 'tasks.md': SEED_TASKS },
  opts: { cache?: LocalCache; phone?: boolean; wrap?: (ws: Workspace) => Workspace } = {},
) {
  const drive = new FakeOneDrive(seed);
  const ws = createWorkspace(drive, opts.cache ?? new MemoryCache());
  const store = await createStore({
    workspace: opts.wrap ? opts.wrap(ws) : ws,
    clock,
    isPhone: () => opts.phone ?? false,
  });
  return { drive, store };
}

const idOf = (store: AppStore, title: string): string => {
  const t = allTasks(store.state.doc).find((x) => x.title === title);
  if (!t) throw new Error(`no task "${title}"`);
  return t.id;
};
const titles = (store: AppStore, key: BucketKey): string[] =>
  tasksInBucket(store.state.doc, key, store.ctx).map((t) => t.title);
const allTitles = (store: AppStore): string[] => allTasks(store.state.doc).map((t) => t.title);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  now = new Date(2026, 9, 16, 9, 0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('app store', () => {
  it('adds to Today, toasts, and writes tasks.md after the save delay', async () => {
    const { drive, store } = await setup();
    store.add('Buy milk');
    expect(titles(store, 'today')).toContain('Buy milk');
    expect(store.toast).toEqual({ message: 'Added to Today', undo: true });

    await vi.advanceTimersByTimeAsync(999);
    expect(drive.peek('tasks.md')).not.toContain('Buy milk');
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(drive.peek('tasks.md')).toBe(`${SEED_TASKS}- [ ] Buy milk 📅 2026-10-16\n`));
  });

  it('completing a weekly task moves it on and appends to done.md', async () => {
    const { drive, store } = await setup();
    store.complete(idOf(store, 'Water the plants'));
    expect(store.toast).toEqual({ message: 'Done · next Mon 26 Oct', undo: true });
    await store.flush();
    expect(drive.peek('done.md')).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16\n');
    expect(drive.peek('tasks.md')).toContain('- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-26\n');
    expect(store.stats.today).toBe(1);
  });

  it('undo restores both files', async () => {
    const { drive, store } = await setup();
    store.complete(idOf(store, 'Water the plants'));
    await store.flush();
    store.undo();
    expect(store.toast).toEqual({ message: 'Undone', undo: false });
    await store.flush();
    expect(drive.peek('tasks.md')).toBe(SEED_TASKS);
    expect(drive.peek('done.md')).toBe('');
    expect(store.stats.today).toBe(0);
  });

  it('adds to the bucket from config.yaml', async () => {
    const { store } = await setup({ 'tasks.md': SEED_TASKS, 'config.yaml': 'newTaskBucket: someday\n' });
    store.add('x');
    expect(titles(store, 'someday')).toContain('x');
    expect(store.toast?.message).toBe('Added to Someday');
  });

  it('refresh shows outside changes, keeps the selection and clears undo', async () => {
    const { drive, store } = await setup();
    const dentist = idOf(store, 'Call the dentist');
    store.select(dentist);
    store.add('Buy milk');
    await store.flush();

    drive.externalWrite('tasks.md', `${drive.peek('tasks.md')!}- [ ] From the phone\n`);
    await store.refresh();
    expect(allTitles(store)).toEqual([
      'Call the dentist', 'Water the plants', 'Send the invoice', 'Learn Polish sign language', 'Buy milk',
      'From the phone',
    ]);
    expect(store.selectedId).toBe(dentist);
    expect(findTask(store.state, dentist)?.title).toBe('Call the dentist');

    store.undo();
    expect(store.toast).toEqual({ message: 'Nothing to undo', undo: false });
  });

  it('moves - [x] lines to done.md on open and counts them', async () => {
    const tasks = '# Tasks\n- [ ] Open one\n- [x] Ticked in Obsidian\n- [x] Done last week ✅ 2026-10-09\n';
    const { drive, store } = await setup({ 'tasks.md': tasks });
    expect(store.state.doc.items.some((i) => i.kind === 'done')).toBe(false);
    expect(store.stats.today).toBe(1);
    expect(store.stats.all).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(drive.peek('tasks.md')).toBe('# Always\n\n# Tasks\n- [ ] Open one\n'));
    expect(drive.peek('done.md')).toBe(
      '- [x] Ticked in Obsidian ✅ 2026-10-16\n- [x] Done last week ✅ 2026-10-09\n',
    );
  });

  it('tick after midnight moves tomorrow’s task to Today', async () => {
    const { store } = await setup();
    expect(titles(store, 'week')).toEqual(['Send the invoice']);
    now = new Date(2026, 9, 17, 0, 0, 5);
    store.tick();
    expect(store.ctx.today).toBe('2026-10-17');
    expect(titles(store, 'today')).toEqual(['Call the dentist', 'Send the invoice']);
  });

  it('an invalid config shows the error and uses the defaults', async () => {
    const { store } = await setup({ 'tasks.md': SEED_TASKS, 'config.yaml': 'newTaskBucket: later\n' });
    expect(store.configError).toMatchObject({ line: 1 });
    expect(store.config).toEqual(DEFAULT_CONFIG);
  });

  it('a drop on Later asks for a date and changes nothing', async () => {
    const { store } = await setup();
    const before = store.state;
    const out = store.drop(idOf(store, 'Call the dentist'), { bucket: 'later', beforeId: null });
    expect(out).toEqual({ kind: 'pickDate', suggested: '2026-10-26', beforeId: null });
    expect(store.state).toBe(before);
    expect(store.toast).toBeNull();
  });

  it('edit trims notes and drops blank ones', async () => {
    const { store } = await setup();
    const id = idOf(store, 'Call the dentist');
    store.edit(id, {
      title: '  Call the dentist about the crown ',
      notes: ['  ask about zirconia  ', '', '   ', 'bring the old x-ray'],
    });
    expect(findTask(store.state, id)).toMatchObject({
      title: 'Call the dentist about the crown',
      notes: ['ask about zirconia', 'bring the old x-ray'],
    });
    expect(store.toast).toEqual({ message: 'Saved', undo: true });
  });

  it('an edit that changes nothing is not recorded', async () => {
    const { store } = await setup();
    const id = idOf(store, 'Call the dentist');
    const before = store.state;
    store.edit(id, { title: 'Call the dentist ', notes: ['bring the old x-ray', ' '] });
    expect(store.state).toBe(before);
    expect(store.toast).toBeNull();
    store.undo();
    expect(store.toast?.message).toBe('Nothing to undo');
  });

  it('a rejected save keeps the change and a later flush writes it', async () => {
    const cache = new FlakyCache();
    const { drive, store } = await setup({ 'tasks.md': SEED_TASKS }, { cache });
    cache.failing = true;
    store.add('Buy milk');
    await store.flush();
    expect(drive.peek('tasks.md')).toBe(SEED_TASKS);
    expect(store.status).toBe('offline');
    expect(titles(store, 'today')).toContain('Buy milk');

    cache.failing = false;
    await store.flush();
    expect(drive.peek('tasks.md')).toBe(`${SEED_TASKS}- [ ] Buy milk 📅 2026-10-16\n`);
    expect(store.status).toBe('saved');
  });

  it('a rejected save is merged with an outside change on refresh', async () => {
    const cache = new FlakyCache();
    const { drive, store } = await setup({ 'tasks.md': SEED_TASKS }, { cache });
    cache.failing = true;
    store.add('Local edit');
    await store.flush();
    drive.externalWrite('tasks.md', `${SEED_TASKS}- [ ] Remote edit\n`);
    cache.failing = false;

    await store.refresh();
    await store.flush();
    expect(allTitles(store).filter((t) => t === 'Local edit')).toHaveLength(1);
    expect(allTitles(store)).toContain('Remote edit');
    expect(drive.peek('tasks.md')).toContain('- [ ] Local edit 📅 2026-10-16\n');
    expect(drive.peek('tasks.md')).toContain('- [ ] Remote edit\n');
  });

  it('an edit made while a refresh is in flight is kept and saved on the new base', async () => {
    let during: (() => void) | null = null;
    const { drive, store } = await setup(
      { 'tasks.md': SEED_TASKS },
      {
        wrap: (ws) => ({
          ...ws,
          refresh: async () => {
            const snap = await ws.refresh();
            during?.();
            return snap;
          },
        }),
      },
    );
    drive.externalWrite('tasks.md', `${SEED_TASKS}- [ ] From the phone\n`);
    during = () => store.add('Typed meanwhile');
    await store.refresh();
    during = null;

    expect(allTitles(store)).toContain('From the phone');
    expect(allTitles(store)).toContain('Typed meanwhile');
    await store.flush();
    const text = drive.peek('tasks.md')!;
    expect(text).toContain('- [ ] From the phone\n');
    expect(text).toContain('- [ ] Typed meanwhile 📅 2026-10-16\n');
    expect(text.match(/From the phone/g)).toHaveLength(1);
  });

  it('starts with the configured view and folds, but a phone gets the list', async () => {
    const seed = { 'tasks.md': SEED_TASKS, 'config.yaml': 'defaultView: board\nfoldedOnOpen: [someday]\n' };
    const desk = (await setup(seed)).store;
    expect(desk.view).toBe('board');
    expect(desk.folded).toEqual({ today: false, week: false, next: false, later: false, someday: true });
    desk.switchView();
    expect(desk.view).toBe('list');

    const phone = (await setup(seed, { phone: true })).store;
    expect(phone.view).toBe('list');
    phone.switchView();
    expect(phone.view).toBe('list');
  });

  it('moves the selection on when the selected task leaves the visible list', async () => {
    const { store } = await setup();
    const dentist = idOf(store, 'Call the dentist');
    store.select(dentist);
    store.moveTo(dentist, 'someday');
    expect(store.toast?.message).toBe('Moved to Someday');
    expect(store.selectedId).toBe(idOf(store, 'Send the invoice'));

    const invoice = idOf(store, 'Send the invoice');
    store.moveTo(invoice, 'next');
    expect(store.toast?.message).toBe('Moved to Next week · Sun');
    expect(store.selectedId).toBe(invoice);

    store.remove(invoice);
    expect(store.toast?.message).toBe('Deleted · Send the invoice');
    expect(store.selectedId).toBe(idOf(store, 'Water the plants'));
  });

  it('selectNext walks the visible tasks', async () => {
    const { store } = await setup();
    store.selectNext(1);
    expect(store.selectedId).toBe(idOf(store, 'Call the dentist'));
    store.selectNext(1);
    store.selectNext(1);
    store.selectNext(1);
    expect(store.selectedId).toBe(idOf(store, 'Water the plants'));
    store.selectNext(-1);
    expect(store.selectedId).toBe(idOf(store, 'Send the invoice'));
  });

  it('setRepeat and setAlways toast and can be undone', async () => {
    const { store } = await setup();
    const id = idOf(store, 'Learn Polish sign language');
    store.setRepeat(id, { type: 'weekly', days: [0, 3] });
    expect(store.toast?.message).toBe('Repeats every Mon, Thu');
    expect(findTask(store.state, id)?.date).toBe('2026-10-19');
    store.setRepeat(id, null);
    expect(store.toast?.message).toBe('Repeat removed');
    store.setAlways(['One tab at a time', '  ']);
    expect(store.state.doc.always).toEqual(['One tab at a time']);
    store.undo();
    expect(store.state.doc.always).toEqual(['Walk before the first coffee']);
  });

  it('the toast goes away after 4.2 s', async () => {
    const { store } = await setup();
    store.add('Buy milk');
    await vi.advanceTimersByTimeAsync(4199);
    expect(store.toast).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.toast).toBeNull();
  });
});
