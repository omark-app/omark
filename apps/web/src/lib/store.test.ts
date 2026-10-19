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
  /** True to fail every put, or a predicate to fail only some files. */
  failing: boolean | ((name: FileName) => boolean) = false;
  override async put(name: FileName, f: CachedFile): Promise<void> {
    if (this.failing === true || (typeof this.failing === 'function' && this.failing(name))) {
      throw new Error('QuotaExceededError');
    }
    return super.put(name, f);
  }
}

/** A drive whose writes (and, separately, reads) can hang until released, like a stalled mobile network. */
class SlowDrive extends FakeOneDrive {
  hold = false;
  /** True to hold every read, or a predicate to hold only some files. */
  holdReads: boolean | ((name: FileName) => boolean) = false;
  private waiting: (() => void)[] = [];
  private stall(): Promise<void> {
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  /** Reads and writes currently hanging. */
  get stalled(): number {
    return this.waiting.length;
  }
  release(): void {
    this.hold = false;
    this.holdReads = false;
    for (const resolve of this.waiting.splice(0)) resolve();
  }
  override async read(name: FileName) {
    if (this.holdReads === true || (typeof this.holdReads === 'function' && this.holdReads(name))) {
      await this.stall();
    }
    return super.read(name);
  }
  override async write(name: FileName, text: string, ifMatch: string | null) {
    if (this.hold) await this.stall();
    return super.write(name, text, ifMatch);
  }
}

/** A drive that counts reads. */
class CountingDrive extends FakeOneDrive {
  reads = 0;
  override async read(name: FileName) {
    this.reads++;
    return super.read(name);
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
  /** Flushes, then waits until every queued upload is over (a pull queues behind them). */
  const synced = async (): Promise<void> => {
    await store.flush();
    await ws.refresh();
  };
  return { drive, store, synced };
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
    const { drive, store, synced } = await setup();
    store.add('Buy milk');
    expect(titles(store, 'today')).toContain('Buy milk');
    expect(store.toast).toEqual({ message: 'Added to Today', undo: true });

    await vi.advanceTimersByTimeAsync(999);
    expect(drive.peek('tasks.md')).not.toContain('Buy milk');
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(drive.peek('tasks.md')).toBe(`${SEED_TASKS}- [ ] Buy milk 📅 2026-10-16\n`));
  });

  it('completing a weekly task moves it on and appends to done.md', async () => {
    const { drive, store, synced } = await setup();
    store.complete(idOf(store, 'Water the plants'));
    expect(store.toast).toEqual({ message: 'Done · next Mon 26 Oct', undo: true });
    await synced();
    expect(drive.peek('done.md')).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16\n');
    expect(drive.peek('tasks.md')).toContain('- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-26\n');
    expect(store.stats.today).toBe(1);
  });

  it('a title typed or edited with 🔁 text repeats, and completing it reschedules instead of deleting (issue #8)', async () => {
    now = new Date(2026, 9, 18, 9, 0); // Sunday
    const { drive, store, synced } = await setup();
    store.add('leki 🔁 every 2 days');
    store.edit(idOf(store, 'Send the invoice'), { title: 'depresja 🔁 every week on Sunday', notes: [] });
    await synced();
    expect(drive.peek('tasks.md')).toContain('- [ ] leki 🔁 every 2 days 📅 2026-10-18\n');
    expect(drive.peek('tasks.md')).toContain('- [ ] depresja 🔁 every week on Sunday 📅 2026-10-17\n');
    store.complete(idOf(store, 'leki'));
    expect(store.toast?.message).toBe('Done · next Tue 20 Oct');
    store.complete(idOf(store, 'depresja'));
    expect(store.toast?.message).toBe('Done · next Sun 25 Oct');
    await synced();
    expect(drive.peek('tasks.md')).toContain('- [ ] leki 🔁 every 2 days 📅 2026-10-20\n');
    expect(drive.peek('tasks.md')).toContain('- [ ] depresja 🔁 every week on Sunday 📅 2026-10-25\n');
    expect(drive.peek('done.md')).toBe(
      '- [x] leki 🔁 every 2 days ✅ 2026-10-18\n- [x] depresja 🔁 every week on Sunday ✅ 2026-10-18\n',
    );
  });

  it('undo restores both files', async () => {
    const { drive, store, synced } = await setup();
    store.complete(idOf(store, 'Water the plants'));
    await synced();
    store.undo();
    expect(store.toast).toEqual({ message: 'Undone', undo: false });
    await synced();
    expect(drive.peek('tasks.md')).toBe(SEED_TASKS);
    expect(drive.peek('done.md')).toBe('');
    expect(store.stats.today).toBe(0);
  });

  it('completing a one-off task carries its notes to done.md, and undo takes them back (Ruling 44)', async () => {
    const { drive, store, synced } = await setup();
    store.complete(idOf(store, 'Call the dentist'));
    await synced();
    expect(drive.peek('done.md')).toBe('- [x] Call the dentist ✅ 2026-10-16\n    - bring the old x-ray\n');
    expect(drive.peek('tasks.md')).not.toContain('Call the dentist');
    expect(store.stats.today).toBe(1);
    expect(store.stats.all).toBe(1);
    store.undo();
    await synced();
    expect(drive.peek('tasks.md')).toBe(SEED_TASKS);
    expect(drive.peek('done.md')).toBe('');
  });

  it('completing a repeating task copies its notes to done.md, and undo takes them back', async () => {
    const tasks = '# Always\n\n# Tasks\n- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-16\n    - the ferns too\n';
    const { drive, store, synced } = await setup({ 'tasks.md': tasks });
    store.complete(idOf(store, 'Water the plants'));
    await synced();
    expect(drive.peek('done.md')).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16\n    - the ferns too\n');
    expect(drive.peek('tasks.md')).toBe(
      '# Always\n\n# Tasks\n- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-19\n    - the ferns too\n',
    );
    expect(store.stats.all).toBe(1);
    store.undo();
    await synced();
    expect(drive.peek('tasks.md')).toBe(tasks);
    expect(drive.peek('done.md')).toBe('');
  });

  it('add reports whether a task was added (a blank title is not)', async () => {
    const { store } = await setup();
    expect(store.add('   ')).toBe(false);
    expect(store.toast).toBeNull();
    expect(store.add('Buy milk', 'next')).toBe(true);
    expect(titles(store, 'next')).toContain('Buy milk');
  });

  it('adds to the bucket from config.yaml', async () => {
    const { store } = await setup({ 'tasks.md': SEED_TASKS, 'config.yaml': 'newTaskBucket: someday\n' });
    store.add('x');
    expect(titles(store, 'someday')).toContain('x');
    expect(store.toast?.message).toBe('Added to Someday');
  });

  it('refresh shows outside changes, keeps the selection and clears undo', async () => {
    const { drive, store, synced } = await setup();
    const dentist = idOf(store, 'Call the dentist');
    store.select(dentist);
    store.add('Buy milk');
    await synced();

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
    const { drive, store, synced } = await setup({ 'tasks.md': tasks });
    expect(store.state.doc.items.some((i) => i.kind === 'done')).toBe(false);
    expect(store.stats.today).toBe(1);
    expect(store.stats.all).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(drive.peek('tasks.md')).toBe('# Always\n\n# Tasks\n- [ ] Open one\n'));
    expect(drive.peek('done.md')).toBe(
      '- [x] Ticked in Obsidian ✅ 2026-10-16\n- [x] Done last week ✅ 2026-10-09\n',
    );
  });

  it('keeps a recurring task ticked in Obsidian without a done date recurring (I1)', async () => {
    const tasks = '# Tasks\n- [x] Water the plants 🔁 every week on Monday 📅 2026-10-16\n    - the ferns too\n';
    const { drive, store } = await setup({ 'tasks.md': tasks });
    expect(allTasks(store.state.doc).map((t) => [t.title, t.date])).toEqual([['Water the plants', '2026-10-19']]);
    expect(store.stats.today).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() =>
      expect(drive.peek('tasks.md')).toBe(
        '# Always\n\n# Tasks\n- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-19\n    - the ferns too\n',
      ),
    );
    expect(drive.peek('done.md')).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16\n    - the ferns too\n');
  });

  it('tick after midnight moves tomorrow’s task to Today and today’s to Overdue', async () => {
    const { store } = await setup();
    expect(titles(store, 'week')).toEqual(['Send the invoice']);
    now = new Date(2026, 9, 17, 0, 0, 5);
    store.tick();
    expect(store.ctx.today).toBe('2026-10-17');
    expect(titles(store, 'today')).toEqual(['Send the invoice']);
    expect(titles(store, 'overdue')).toEqual(['Call the dentist']);
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

  it('a rejected save keeps the change, still uploads it at once, and a later flush settles it (I3)', async () => {
    const cache = new FlakyCache();
    const { drive, store, synced } = await setup({ 'tasks.md': SEED_TASKS }, { cache });
    cache.failing = true;
    store.add('Buy milk');
    await store.flush();
    expect(titles(store, 'today')).toContain('Buy milk');
    // The cache is broken, so OneDrive is the only durable copy: the upload does not wait for a refresh.
    await vi.waitFor(() => expect(drive.peek('tasks.md')).toBe(`${SEED_TASKS}- [ ] Buy milk 📅 2026-10-16\n`));
    await vi.waitFor(() => expect(store.status).toBe('offline'));
    expect(store.wouldLoseEdits()).toBe(true);

    cache.failing = false;
    await synced();
    expect(drive.peek('tasks.md')).toBe(`${SEED_TASKS}- [ ] Buy milk 📅 2026-10-16\n`);
    expect(store.status).toBe('saved');
  });

  it('a rejected save is merged with an outside change on refresh', async () => {
    const cache = new FlakyCache();
    const { drive, store, synced } = await setup({ 'tasks.md': SEED_TASKS }, { cache });
    cache.failing = true;
    store.add('Local edit');
    await store.flush();
    await vi.waitFor(() => expect(drive.peek('tasks.md')).toContain('Local edit'));
    drive.externalWrite('tasks.md', `${drive.peek('tasks.md')}- [ ] Remote edit\n`);
    cache.failing = false;

    await store.refresh();
    await synced();
    expect(allTitles(store).filter((t) => t === 'Local edit')).toHaveLength(1);
    expect(allTitles(store)).toContain('Remote edit');
    expect(drive.peek('tasks.md')).toContain('- [ ] Local edit 📅 2026-10-16\n');
    expect(drive.peek('tasks.md')).toContain('- [ ] Remote edit\n');
  });

  it('an edit made while a refresh is in flight is kept and saved on the new base', async () => {
    let during: (() => void) | null = null;
    const { drive, store, synced } = await setup(
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
    await synced();
    const text = drive.peek('tasks.md')!;
    expect(text).toContain('- [ ] From the phone\n');
    expect(text).toContain('- [ ] Typed meanwhile 📅 2026-10-16\n');
    expect(text.match(/From the phone/g)).toHaveLength(1);
  });

  it('starts with the configured view and folds, but a phone gets the list', async () => {
    const seed = { 'tasks.md': SEED_TASKS, 'config.yaml': 'defaultView: board\nfoldedOnOpen: [someday]\n' };
    const desk = (await setup(seed)).store;
    expect(desk.view).toBe('board');
    // Overdue and Later are empty, so they start folded.
    expect(desk.folded).toEqual({ overdue: true, today: false, week: false, next: false, later: true, someday: true });
    desk.switchView();
    expect(desk.view).toBe('list');

    const phone = (await setup(seed, { phone: true })).store;
    expect(phone.view).toBe('list');
    phone.switchView();
    expect(phone.view).toBe('list');
  });

  it('folds empty buckets until the user unfolds them; the board keeps the dated ones open', async () => {
    const seed = { 'tasks.md': SEED_TASKS, 'config.yaml': 'foldedOnOpen: [today, later, someday]\n' };
    const { store } = await setup(seed);
    expect(store.counts).toEqual({ overdue: 0, today: 1, week: 1, next: 1, later: 0, someday: 1 });
    expect(store.folded).toMatchObject({ overdue: true, today: true, week: false, later: true });
    store.switchView();
    expect(store.folded).toMatchObject({ overdue: true, today: false, week: false, later: true });
    store.toggleFold('later');
    expect(store.folded.later).toBe(false);
    store.complete(idOf(store, 'Send the invoice'));
    expect(store.folded.week).toBe(true);
    store.toggleFold('week');
    expect(store.folded.week).toBe(false);
    store.add('Pack the bag', 'week');
    store.toggleFold('week');
    expect(store.folded.week).toBe(true);
  });

  it('packs the board when it is shown and keeps the columns while the user works', async () => {
    const tasks = `# Tasks
${['A', 'B', 'C', 'D', 'E', 'F'].map((t) => `- [ ] Old ${t} 📅 2026-10-10`).join('\n')}
${['A', 'B', 'C', 'D', 'E'].map((t) => `- [ ] Now ${t} 📅 2026-10-16`).join('\n')}
- [ ] Soon A 📅 2026-10-20
- [ ] Soon B 📅 2026-10-21
- [ ] Far A 📅 2026-12-01
- [ ] Idea A
`;
    const { store } = await setup({ 'tasks.md': tasks, 'config.yaml': 'defaultView: board\n' });
    // This week is empty (only Saturday and Sunday left, nothing due): Overdue gets a column to itself.
    expect(store.boardColumns).toEqual([['overdue'], ['today'], ['week', 'next'], ['later', 'someday']]);
    for (const t of ['A', 'B', 'C', 'D', 'E', 'F']) store.complete(idOf(store, `Old ${t}`));
    store.add('Later still', 'next');
    store.toggleFold('someday');
    // Overdue is empty now but keeps its place until the board is packed again.
    expect(store.boardColumns).toEqual([['overdue'], ['today'], ['week', 'next'], ['later', 'someday']]);
    store.switchView();
    store.switchView();
    expect(store.boardColumns).toEqual([['today'], ['week'], ['next'], ['later', 'someday']]);
    // A task that turns overdue meanwhile joins Today's column.
    store.setDate(idOf(store, 'Soon A'), '2026-10-12');
    expect(store.boardColumns).toEqual([['overdue', 'today'], ['week'], ['next'], ['later', 'someday']]);
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

  it('moving a task to the bucket it is in, or setting the same repeat, is not a change', async () => {
    const { store } = await setup();
    store.moveTo(idOf(store, 'Call the dentist'), 'today');
    store.setRepeat(idOf(store, 'Water the plants'), { type: 'weekly', days: [0] });
    expect(store.toast).toBeNull();
    store.undo();
    expect(store.toast?.message).toBe('Nothing to undo');
  });

  it('an edit still waiting for the save delay survives an outside change and a refresh', async () => {
    const { drive, store, synced } = await setup();
    store.add('Local');
    drive.externalWrite('tasks.md', `${SEED_TASKS}- [ ] Remote\n`);
    await store.refresh();
    await synced();
    expect(allTitles(store).filter((t) => t === 'Local')).toHaveLength(1);
    expect(allTitles(store)).toContain('Remote');
    const text = drive.peek('tasks.md')!;
    expect(text).toContain('- [ ] Local 📅 2026-10-16\n');
    expect(text).toContain('- [ ] Remote\n');
  });

  it('text typed while a refresh reads is kept when the remote edited the same task (I4)', async () => {
    let during: (() => Promise<void>) | null = null;
    const { drive, store, synced } = await setup(
      { 'tasks.md': SEED_TASKS },
      {
        wrap: (ws) => ({
          ...ws,
          refresh: async () => {
            await during?.();
            return ws.refresh();
          },
        }),
      },
    );
    const id = idOf(store, 'Call the dentist');
    store.select(id);
    // Like createTaskEdit: typed text waits in the component until a pending callback commits it.
    let typed: string | null = 'Call the dentist today';
    store.registerPending(() => {
      const t = findTask(store.state, id);
      if (typed !== null && t) store.edit(id, { title: typed, notes: t.notes });
      typed = null;
    });

    during = async () => {
      // The first part of the typing was committed and uploaded when the refresh began...
      await vi.waitFor(() => expect(drive.peek('tasks.md')).toContain('Call the dentist today'));
      // ...then the phone edits the same task, and typing goes on while the read is in flight.
      drive.externalWrite('tasks.md', drive.peek('tasks.md')!.replace('bring the old x-ray', 'bring the x-ray and the card'));
      typed = 'Call the dentist today at 9';
    };
    await store.refresh();

    expect(store.selectedId).toBe(id);
    expect(findTask(store.state, id)?.title).toBe('Call the dentist today at 9');
    await synced();
    const text = drive.peek('tasks.md')!;
    expect(text).toContain('- [ ] Call the dentist today at 9 📅 2026-10-16\n    - bring the old x-ray\n');
    expect(text).toContain('bring the x-ray and the card');
  });

  it('a flush caches the edit even while an earlier upload hangs, so a killed page keeps it', async () => {
    const drive = new SlowDrive({ 'tasks.md': SEED_TASKS });
    const cache = new MemoryCache();
    const store = await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
    drive.hold = true;
    store.add('First');
    await store.flush(); // its upload now hangs
    store.add('Second');
    await store.flush(); // the page is hidden
    expect((await cache.get('tasks.md'))!.local).toContain('- [ ] Second');

    // The page is killed; it reopens from the same cache with no network.
    const offline = new FakeOneDrive({ 'tasks.md': SEED_TASKS });
    offline.setOffline(true);
    const reopened = await createWorkspace(offline, cache).open();
    expect(reopened.tasks).toContain('- [ ] First');
    expect(reopened.tasks).toContain('- [ ] Second');
    drive.release();
  });

  it('starts on the cached text while the network hangs, syncing, then takes in the remote', async () => {
    const drive = new SlowDrive({ 'tasks.md': SEED_TASKS });
    const cache = new MemoryCache();
    await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
    drive.externalWrite('tasks.md', `${SEED_TASKS}- [ ] From another device 📅 2026-10-16\n`);

    drive.holdReads = true; // "lie-fi": connected, but nothing comes back
    const store = await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
    expect(allTitles(store)).toContain('Call the dentist');
    expect(allTitles(store)).not.toContain('From another device');
    expect(store.status).toBe('syncing');
    await vi.waitFor(() => expect(drive.stalled).toBeGreaterThan(0)); // the pull has started by itself

    drive.release();
    await vi.waitFor(() => expect(store.status).toBe('saved'));
    expect(allTitles(store)).toContain('From another device');
  });

  it('a start from the cache packs the board again once, when the first pull brings changes', async () => {
    const drive = new SlowDrive({ 'tasks.md': SEED_TASKS, 'config.yaml': 'defaultView: board\n' });
    const cache = new MemoryCache();
    await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
    const overdue = ['A', 'B', 'C', 'D', 'E', 'F'].map((t) => `- [ ] Old ${t} 📅 2026-10-10\n`).join('');
    drive.externalWrite('tasks.md', `${SEED_TASKS}${overdue}`);

    drive.holdReads = true;
    const store = await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
    expect(store.boardColumns).toEqual([['today'], ['week'], ['next'], ['later', 'someday']]);
    drive.release();
    await vi.waitFor(() => expect(store.status).toBe('saved'));
    expect(store.boardColumns).toEqual([['overdue'], ['today', 'week'], ['next'], ['later', 'someday']]);

    // Later pulls leave the columns alone.
    drive.externalWrite('tasks.md', SEED_TASKS);
    await store.refresh();
    expect(store.counts.overdue).toBe(0);
    expect(store.boardColumns).toEqual([['overdue'], ['today', 'week'], ['next'], ['later', 'someday']]);
  });

  it('a hung refresh does not hold up a flush', async () => {
    const drive = new SlowDrive({ 'tasks.md': SEED_TASKS });
    const cache = new MemoryCache();
    const store = await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
    drive.holdReads = true;
    void store.refresh(); // its reads hang
    await vi.waitFor(() => expect(drive.stalled).toBeGreaterThan(0));
    store.add('Typed meanwhile');
    await store.flush();
    expect((await cache.get('tasks.md'))!.local).toContain('- [ ] Typed meanwhile');
    drive.release();
  });

  it('a done.md cache failure does not duplicate a completion once it recovers', async () => {
    const cache = new FlakyCache();
    const { drive, store, synced } = await setup({ 'tasks.md': SEED_TASKS }, { cache });
    cache.failing = (name) => name === 'done.md';
    store.complete(idOf(store, 'Water the plants'));
    await store.flush();
    drive.externalWrite('tasks.md', `${drive.peek('tasks.md')!}- [ ] Remote\n`);
    cache.failing = false;
    store.add('Later');
    await store.flush();
    await store.refresh();
    await synced();
    const tasks = drive.peek('tasks.md')!;
    expect(tasks.match(/Water the plants/g)).toHaveLength(1);
    expect(tasks).toContain('- [ ] Remote\n');
    expect(tasks).toContain('- [ ] Later 📅 2026-10-16\n');
    expect(drive.peek('done.md')).toBe('- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-16\n');
  });

  describe('a flush while a refresh is reading', () => {
    const RACE_SEED = '# Always\n\n# Tasks\n- [ ] One\n- [ ] Weekly 🔁 every week on Monday 📅 2026-10-19\n';

    async function racing(hold: boolean | ((name: FileName) => boolean) = true) {
      const drive = new SlowDrive({ 'tasks.md': RACE_SEED });
      const ws = createWorkspace(drive, new MemoryCache());
      const store = await createStore({ workspace: ws, clock, isPhone: () => false });
      /** Starts a refresh whose reads hang; `finish` releases them and waits for everything to settle. */
      const startRefresh = async () => {
        drive.holdReads = hold;
        const done = store.refresh();
        await vi.waitFor(() => expect(drive.stalled).toBeGreaterThan(0));
        return async () => {
          drive.release();
          await done;
          await vi.runAllTimersAsync();
          await store.flush();
          await ws.refresh();
        };
      };
      const tasksOnDrive = (title: string): number =>
        (drive.peek('tasks.md')!.match(new RegExp(`^- \\[ \\] ${title}( |$)`, 'gm')) ?? []).length;
      return { drive, store, startRefresh, tasksOnDrive };
    }

    it('a task added, staged and then renamed comes out once, renamed', async () => {
      const { store, startRefresh, tasksOnDrive } = await racing();
      const finish = await startRefresh();
      store.add('E');
      await store.flush();
      store.edit(idOf(store, 'E'), { title: 'F', notes: [] });
      await finish();
      expect(allTitles(store)).toEqual(['One', 'Weekly', 'F']);
      expect(tasksOnDrive('E')).toBe(0);
      expect(tasksOnDrive('F')).toBe(1);
    });

    it('a task added, staged and then completed stays completed', async () => {
      const { drive, store, startRefresh, tasksOnDrive } = await racing();
      const finish = await startRefresh();
      store.add('E');
      await store.flush();
      store.complete(idOf(store, 'E'));
      await finish();
      expect(allTitles(store)).toEqual(['One', 'Weekly']);
      expect(tasksOnDrive('E')).toBe(0);
      expect(drive.peek('done.md')).toBe('- [x] E ✅ 2026-10-16\n');
    });

    it('a task added, staged and then undone stays undone', async () => {
      const { store, startRefresh, tasksOnDrive } = await racing();
      const finish = await startRefresh();
      store.add('E');
      await store.flush();
      store.undo();
      await finish();
      expect(allTitles(store)).toEqual(['One', 'Weekly']);
      expect(tasksOnDrive('E')).toBe(0);
    });

    it('a staged add is not duplicated and the outside change still arrives', async () => {
      const { drive, store, startRefresh, tasksOnDrive } = await racing();
      drive.externalWrite('tasks.md', `${RACE_SEED}- [ ] Remote\n`);
      const finish = await startRefresh();
      store.add('E');
      await store.flush();
      await finish();
      expect(allTitles(store).filter((t) => t === 'E')).toHaveLength(1);
      expect(allTitles(store)).toContain('Remote');
      expect(tasksOnDrive('E')).toBe(1);
      expect(tasksOnDrive('Remote')).toBe(1);
    });

    it('a staged add is not duplicated when tasks.md was read before the stage', async () => {
      const { drive, store, startRefresh, tasksOnDrive } = await racing((name) => name === 'config.yaml');
      drive.externalWrite('tasks.md', `${RACE_SEED}- [ ] Remote\n`);
      const finish = await startRefresh();
      await new Promise((resolve) => setImmediate(resolve)); // let the tasks.md pull finish
      store.add('E');
      await store.flush();
      await finish();
      expect(allTitles(store).filter((t) => t === 'E')).toHaveLength(1);
      expect(allTitles(store)).toContain('Remote');
      expect(tasksOnDrive('E')).toBe(1);
    });

    it('a completion staged during the refresh is written once', async () => {
      const { drive, store, startRefresh } = await racing();
      const finish = await startRefresh();
      store.complete(idOf(store, 'Weekly'));
      await store.flush();
      await finish();
      expect(drive.peek('done.md')!.match(/Weekly/g)).toHaveLength(1);
      expect(drive.peek('tasks.md')!.match(/Weekly/g)).toHaveLength(1);
      expect(drive.peek('tasks.md')).toContain('📅 2026-10-26');
    });
  });

  it('runs one refresh at a time: callers during a refresh share it', async () => {
    const drive = new CountingDrive({ 'tasks.md': SEED_TASKS });
    const store = await createStore({ workspace: createWorkspace(drive, new MemoryCache()), clock, isPhone: () => false });
    drive.reads = 0;
    await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
    expect(drive.reads).toBe(3); // one read of each file
    await store.refresh();
    expect(drive.reads).toBe(6); // a refresh after it is a new one
  });

  describe('wouldLoseEdits (leaving the page, e.g. to sign in again)', () => {
    async function offlineStore(opts: { durableCache?: boolean; cache?: LocalCache } = {}) {
      const drive = new FakeOneDrive({ 'tasks.md': SEED_TASKS });
      const store = await createStore({
        workspace: createWorkspace(drive, opts.cache ?? new MemoryCache()),
        clock,
        isPhone: () => false,
        durableCache: opts.durableCache,
      });
      drive.setOffline(true);
      return { drive, store };
    }

    it('with a memory-only cache: true while an edit has not reached OneDrive, false once it has', async () => {
      const { drive, store } = await offlineStore();
      expect(store.wouldLoseEdits()).toBe(false);
      store.add('Unsynced');
      await store.flush();
      await vi.waitFor(() => expect(store.status).toBe('offline'));
      expect(store.wouldLoseEdits()).toBe(true);
      drive.setOffline(false);
      await store.refresh();
      expect(store.status).toBe('saved');
      expect(store.wouldLoseEdits()).toBe(false);
    });

    it('with a cache that survives a reload: false once the edit is in it, even offline', async () => {
      const { store } = await offlineStore({ durableCache: true });
      store.add('Cached');
      await store.flush();
      await vi.waitFor(() => expect(store.status).toBe('offline'));
      expect(store.wouldLoseEdits()).toBe(false);
    });

    it('with a cache that survives a reload: true when the edit could not be cached', async () => {
      const cache = new FlakyCache();
      const { store } = await offlineStore({ durableCache: true, cache });
      cache.failing = true;
      store.add('Not cached');
      await store.flush();
      expect(store.wouldLoseEdits()).toBe(true);
    });

    it('is false with no edits, even when nothing could be synced since opening', async () => {
      const drive = new FakeOneDrive();
      drive.setOffline(true);
      const store = await createStore({ workspace: createWorkspace(drive, new MemoryCache()), clock, isPhone: () => false });
      expect(store.status).toBe('offline'); // the files wait to be created
      expect(store.wouldLoseEdits()).toBe(false);
    });
  });
  describe('a cache that stops answering (the PC stuck on "syncing")', () => {
    /** A cache whose writes can be made to never settle, like an IndexedDB that stopped answering. */
    class HangingCache extends MemoryCache {
      hangPuts = false;
      override put(name: FileName, f: CachedFile): Promise<void> {
        return this.hangPuts ? new Promise<never>(() => {}) : super.put(name, f);
      }
    }

    it("reopened from the cache, it still shows the other device's change and leaves syncing", async () => {
      const drive = new FakeOneDrive({ 'tasks.md': SEED_TASKS });
      const cache = new HangingCache();
      await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
      drive.externalWrite('tasks.md', `${SEED_TASKS}- [ ] Added on the phone\n`);

      // Reopen (a reload or Ctrl+F5): the list comes from the cache, then a refresh reads the drive.
      cache.hangPuts = true;
      const store = await createStore({ workspace: createWorkspace(drive, cache), clock, isPhone: () => false });
      expect(allTitles(store)).not.toContain('Added on the phone');
      expect(store.status).toBe('syncing');
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.waitFor(() => expect(allTitles(store)).toContain('Added on the phone'));
      expect(store.status).toBe('offline'); // the cache cannot keep it, and the banner says so
    });
  });

  describe('two devices on one drive', () => {
    const TWO = `# Always

# Tasks
- [ ] A 📅 2026-10-18
- [ ] leki 🔁 every 2 days 📅 2026-10-18
- [ ] dep 🔁 every week on Sunday 📅 2026-10-18
- [ ] B 📅 2026-10-19
`;

    async function devices() {
      now = new Date(2026, 9, 18, 9, 0); // Sunday
      const drive = new FakeOneDrive({ 'tasks.md': TWO });
      const open = async () => {
        const ws = createWorkspace(drive, new MemoryCache());
        const store = await createStore({ workspace: ws, clock, isPhone: () => false });
        return { store, ws };
      };
      return { drive, pc: await open(), phone: await open() };
    }

    /** Stages, then waits until the upload (and any 412 retry it runs) is over, without a refresh. */
    const upload = async (d: { store: AppStore; ws: Workspace }): Promise<void> => {
      await d.store.flush();
      await vi.waitFor(() => expect(d.ws.status()).toBe('saved'));
      await vi.advanceTimersByTimeAsync(0);
    };

    it("a save that merges another device's change shows it at once, with no refresh (#6)", async () => {
      const { drive, pc, phone } = await devices();
      phone.store.complete(idOf(phone.store, 'leki'));
      await upload(phone);
      expect(drive.peek('tasks.md')).toContain('leki 🔁 every 2 days 📅 2026-10-20');

      pc.store.complete(idOf(pc.store, 'A'));
      await upload(pc); // its write meets the phone's change (412), merges and writes again
      expect(drive.peek('tasks.md')).toContain('leki 🔁 every 2 days 📅 2026-10-20');
      await vi.waitFor(() => expect(titles(pc.store, 'next')).toContain('leki'));
      expect(titles(pc.store, 'today')).not.toContain('leki');
      expect(pc.store.stats.today).toBe(2);
      expect(pc.store.status).toBe('saved');
    });

    it('a repeating task completed on both devices, one of them stale, stays one task (#7)', async () => {
      const { drive, pc, phone } = await devices();
      phone.store.complete(idOf(phone.store, 'leki'));
      await phone.store.refresh();
      pc.store.complete(idOf(pc.store, 'dep')); // the PC has not seen the phone's change
      phone.store.complete(idOf(phone.store, 'dep'));
      await pc.store.refresh();
      for (const d of [phone, pc, phone, pc]) {
        await d.store.flush();
        await d.store.refresh();
      }
      const tasks = drive.peek('tasks.md')!;
      expect(tasks.match(/dep 🔁/g)).toHaveLength(1);
      expect(tasks.match(/leki 🔁/g)).toHaveLength(1);
      expect(tasks).toContain('dep 🔁 every week on Sunday 📅 2026-10-25');
      expect(drive.peek('done.md')!.match(/dep/g)).toHaveLength(1);
      for (const d of [pc, phone]) {
        expect(allTitles(d.store).filter((t) => t === 'dep')).toHaveLength(1);
        expect(d.store.stats.today).toBe(2);
      }
    });
  });
});

describe('Tomorrow and Important (#19)', () => {
  it('adds to tomorrow as important and writes ⏫', async () => {
    const { drive, store, synced } = await setup();
    expect(store.add('Call the bank', 'tomorrow', true)).toBe(true);
    expect(titles(store, 'week')[0]).toBe('Call the bank');
    expect(store.toast?.message).toBe('Added to This week');
    await synced();
    expect(drive.peek('tasks.md')).toBe(`${SEED_TASKS}- [ ] Call the bank ⏫ 📅 2026-10-17\n`);
  });

  it('adds on a given date', async () => {
    const { store } = await setup();
    store.add('Deck', { date: '2026-10-23' });
    expect(findTask(store.state, idOf(store, 'Deck'))?.date).toBe('2026-10-23');
  });

  it('moves a task to tomorrow', async () => {
    const { store } = await setup();
    const id = idOf(store, 'Learn Polish sign language');
    store.moveTo(id, 'tomorrow');
    expect(findTask(store.state, id)?.date).toBe('2026-10-17');
    expect(store.toast?.message).toBe('Moved to This week · Sat');
  });

  it('setImportant toasts, sorts the task first and can be undone', async () => {
    const { store } = await setup();
    const id = idOf(store, 'Learn Polish sign language');
    store.setImportant(id, true);
    expect(store.toast?.message).toBe('Marked important');
    expect(findTask(store.state, id)?.important).toBe(true);
    store.setImportant(id, false);
    expect(store.toast?.message).toBe('No longer important');
    store.undo();
    expect(findTask(store.state, id)?.important).toBe(true);
    store.setImportant(id, true);
    expect(store.toast?.message).toBe('Undone');
  });
});
