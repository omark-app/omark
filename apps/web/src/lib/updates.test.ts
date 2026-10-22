import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installUpdates } from './updates.svelte.ts';
import type { UpdateDeps } from './updates.svelte.ts';

const RUNNING = 'aaaaaaa';
const NEWER = 'bbbbbbb';
const MINUTE = 60_000;

/**
 * A stand-in for the page: `document` and `window` as bare event targets, `/version.json` answering
 * `deployed`, and a service worker container whose registration can find a new worker. `takesOver` says
 * whether `registration.update()` leads to a new worker taking control.
 */
function fakePage(opts: { controlled?: boolean; workers?: boolean; takesOver?: boolean } = {}) {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const win = new EventTarget();
  const answer = { deployed: NEWER as string, ok: true, fails: false };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    void url;
    void init;
    if (answer.fails) throw new TypeError('Failed to fetch');
    return { ok: answer.ok, json: async () => ({ build: answer.deployed }) };
  });
  const workers = Object.assign(new EventTarget(), {
    controller: (opts.controlled === false ? null : {}) as ServiceWorker | null,
    getRegistration: vi.fn(async () => registration as unknown as ServiceWorkerRegistration),
    getRegistrations: vi.fn(async () => [registration as unknown as ServiceWorkerRegistration]),
  });
  const takeover = (): void => {
    workers.controller = {} as ServiceWorker;
    workers.dispatchEvent(new Event('controllerchange'));
  };
  const registration = {
    update: vi.fn(async () => {
      if (opts.takesOver !== false) setTimeout(takeover, 500);
    }),
    unregister: vi.fn(async () => true),
  };
  const saved = new Map<string, string>();
  const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
  const reload = vi.fn();
  const deps: UpdateDeps = {
    workers: opts.workers === false ? undefined : workers,
    fetch,
    reload,
    build: RUNNING,
    storage,
    now: () => Date.now(),
    doc,
    win,
    idleMs: MINUTE,
    pollMs: 1000,
    intervalMs: 30 * MINUTE,
    takeoverMs: 10_000,
  };
  return {
    deps,
    answer,
    fetch,
    reload,
    registration,
    workers,
    takeover,
    fire: (type: string, init: Record<string, unknown> = {}) => win.dispatchEvent(Object.assign(new Event(type), init)),
    visibility: (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

const fakeStore = (loses = false) => ({ flush: vi.fn(async () => {}), wouldLoseEdits: vi.fn(() => loses) });

/** Lets fetches, flushes and timers up to `ms` from now run. */
const settle = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => {});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('installUpdates: checking', () => {
  it('asks /version.json, uncached, on open and on every return, not on leaving', async () => {
    const page = fakePage();
    page.answer.deployed = RUNNING;
    installUpdates(fakeStore(), page.deps);
    await settle();
    expect(page.fetch).toHaveBeenCalledTimes(1);
    expect(page.fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    page.visibility('hidden');
    await settle();
    expect(page.fetch).toHaveBeenCalledTimes(1);
    page.visibility('visible');
    await settle();
    expect(page.fetch).toHaveBeenCalledTimes(2);
  });

  it('the same build deployed: no reload, nothing offered', async () => {
    const page = fakePage();
    page.answer.deployed = RUNNING;
    const updates = installUpdates(fakeStore(), page.deps);
    await settle(60 * MINUTE);
    expect(page.reload).not.toHaveBeenCalled();
    expect(updates.available).toBe(false);
  });

  it('never reloads without information: offline, a non-OK answer, a dev build', async () => {
    const offline = fakePage();
    offline.answer.fails = true;
    installUpdates(fakeStore(), offline.deps);
    const missing = fakePage();
    missing.answer.ok = false;
    installUpdates(fakeStore(), missing.deps);
    const dev = fakePage();
    installUpdates(fakeStore(), { ...dev.deps, build: 'dev' });
    await settle(60 * MINUTE);
    for (const page of [offline, missing, dev]) expect(page.reload).not.toHaveBeenCalled();
    expect(dev.fetch).not.toHaveBeenCalled();
  });
});

describe('installUpdates: on open and return', () => {
  it('a newer build on open: flushes, waits for the new worker to take control, then reloads', async () => {
    const page = fakePage();
    const store = fakeStore();
    installUpdates(store, page.deps);
    await settle();
    expect(store.flush).toHaveBeenCalled();
    expect(page.registration.update).toHaveBeenCalled();
    expect(page.reload).not.toHaveBeenCalled(); // the new worker has not taken control yet
    await settle(500);
    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(store.flush).toHaveBeenCalledBefore(page.reload);
    expect(page.registration.unregister).not.toHaveBeenCalled();
  });

  it('a newer build found on return reloads at once', async () => {
    const page = fakePage();
    page.answer.deployed = RUNNING;
    installUpdates(fakeStore(), page.deps);
    await settle();
    page.answer.deployed = NEWER;
    page.visibility('hidden');
    page.visibility('visible');
    await settle(500);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('a return from the back-forward cache counts as a return', async () => {
    const page = fakePage();
    page.answer.deployed = RUNNING;
    installUpdates(fakeStore(), page.deps);
    await settle();
    page.answer.deployed = NEWER;
    page.fire('pageshow', { persisted: false });
    await settle(500);
    expect(page.fetch).toHaveBeenCalledTimes(1);
    page.fire('pageshow', { persisted: true });
    await settle(500);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('without service workers, flushes and reloads', async () => {
    const page = fakePage({ workers: false });
    const store = fakeStore();
    installUpdates(store, page.deps);
    await settle();
    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(store.flush).toHaveBeenCalledBefore(page.reload);
  });

  it('shows "updating" while it applies', async () => {
    const page = fakePage();
    const updates = installUpdates(fakeStore(), page.deps);
    await settle();
    expect(updates.applying).toBe(true);
  });
});

describe('installUpdates: a page that stays open', () => {
  /** A page that opened on the deployed build, after which `NEWER` is deployed. */
  async function openPage(opts: Parameters<typeof fakePage>[0] = {}) {
    const page = fakePage(opts);
    page.answer.deployed = RUNNING;
    const store = fakeStore();
    const updates = installUpdates(store, page.deps);
    await settle();
    page.answer.deployed = NEWER;
    return { page, store, updates };
  }

  it('checks on focus and on coming back online', async () => {
    const { page } = await openPage();
    page.fire('focus');
    await settle();
    expect(page.fetch).toHaveBeenCalledTimes(2);
    page.fire('online');
    await settle();
    expect(page.fetch).toHaveBeenCalledTimes(3);
  });

  it('checks every 30 minutes while visible, not while hidden', async () => {
    const { page } = await openPage();
    page.answer.deployed = RUNNING;
    await settle(30 * MINUTE);
    expect(page.fetch).toHaveBeenCalledTimes(2);
    page.visibility('hidden');
    await settle(60 * MINUTE);
    expect(page.fetch).toHaveBeenCalledTimes(2);
  });

  it('offers a newer build found mid-use and loads it after a minute with no input', async () => {
    const { page, updates } = await openPage();
    await settle(50_000);
    page.fire('keydown');
    page.fire('focus');
    await settle();
    expect(updates.available).toBe(true);
    expect(page.reload).not.toHaveBeenCalled();
    await settle(55_000);
    page.fire('pointerdown');
    await settle(55_000);
    expect(page.reload).not.toHaveBeenCalled(); // input 55 s ago
    await settle(6_000);
    await settle(500); // the new worker takes control
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('does not load it while the UI is busy', async () => {
    const { page, updates } = await openPage();
    let busy = true;
    updates.setBusy(() => busy);
    page.fire('focus');
    await settle(10 * MINUTE);
    expect(updates.available).toBe(true);
    expect(page.reload).not.toHaveBeenCalled();
    busy = false;
    await settle(1_500);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('a return loads it at once, busy or not', async () => {
    const { page, updates } = await openPage();
    updates.setBusy(() => true);
    page.fire('focus');
    await settle();
    page.visibility('hidden');
    page.visibility('visible');
    await settle(500);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });
});

describe('installUpdates: applying', () => {
  it('does not reload while edits would be lost, and tries again later', async () => {
    const page = fakePage();
    const store = fakeStore(true);
    installUpdates(store, page.deps);
    await settle();
    expect(store.flush).toHaveBeenCalledTimes(1);
    expect(page.reload).not.toHaveBeenCalled();
    store.wouldLoseEdits.mockReturnValue(false);
    await settle(2 * MINUTE);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('a new worker that already took control since the page loaded: reloads without waiting', async () => {
    const page = fakePage({ takesOver: false });
    page.answer.deployed = RUNNING;
    installUpdates(fakeStore(), page.deps);
    await settle();
    page.takeover();
    page.answer.deployed = NEWER;
    page.visibility('visible');
    await settle();
    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(page.registration.unregister).not.toHaveBeenCalled();
  });

  it('the first worker to claim an uncontrolled page is its own build', async () => {
    const page = fakePage({ controlled: false });
    page.answer.deployed = RUNNING;
    installUpdates(fakeStore(), page.deps);
    await settle();
    page.takeover();
    page.answer.deployed = NEWER;
    page.visibility('visible');
    await settle();
    expect(page.registration.update).toHaveBeenCalled();
    expect(page.reload).not.toHaveBeenCalled();
    await settle(500);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('when no new worker takes control within 10 s, removes the old one and reloads', async () => {
    const page = fakePage({ takesOver: false });
    installUpdates(fakeStore(), page.deps);
    await settle(9_000);
    expect(page.reload).not.toHaveBeenCalled();
    await settle(1_000);
    expect(page.registration.unregister).toHaveBeenCalled();
    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(page.registration.unregister).toHaveBeenCalledBefore(page.reload);
  });

  it('when update() fails (the network dropped), keeps the worker and tries again later', async () => {
    const page = fakePage();
    page.registration.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    installUpdates(fakeStore(), page.deps);
    await settle();
    expect(page.registration.unregister).not.toHaveBeenCalled();
    expect(page.reload).not.toHaveBeenCalled();
    await settle(2 * MINUTE);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });
});

describe('installUpdates: loop guard', () => {
  /** Opens the page again in the same tab session, still on the old build. */
  function reopen(prev: ReturnType<typeof fakePage>, opts: Parameters<typeof fakePage>[0] = {}) {
    const page = fakePage(opts);
    page.deps.storage = prev.deps.storage;
    return page;
  }

  it('tries a normal update, then removing the worker, then only offers the footer line', async () => {
    const first = fakePage();
    installUpdates(fakeStore(), first.deps);
    await settle(500);
    expect(first.reload).toHaveBeenCalledTimes(1);
    expect(first.registration.unregister).not.toHaveBeenCalled();

    const second = reopen(first); // the reload came back on the old build
    installUpdates(fakeStore(), second.deps);
    await settle();
    expect(second.registration.update).not.toHaveBeenCalled(); // straight to removing the worker
    expect(second.registration.unregister).toHaveBeenCalled();
    expect(second.reload).toHaveBeenCalledTimes(1);

    const third = reopen(second);
    const updates = installUpdates(fakeStore(), third.deps);
    await settle(60 * MINUTE);
    third.visibility('visible');
    await settle(MINUTE);
    expect(third.reload).not.toHaveBeenCalled();
    expect(updates.available).toBe(true);
  });

  it('without service workers, one reload per target build', async () => {
    const first = fakePage({ workers: false });
    installUpdates(fakeStore(), first.deps);
    await settle();
    expect(first.reload).toHaveBeenCalledTimes(1);
    const second = reopen(first, { workers: false });
    installUpdates(fakeStore(), second.deps);
    await settle(MINUTE);
    expect(second.reload).not.toHaveBeenCalled();
    second.answer.deployed = 'ccccccc'; // another deploy: a new target
    second.visibility('visible');
    await settle();
    expect(second.reload).toHaveBeenCalledTimes(1);
  });
});

describe('installUpdates: the footer tap', () => {
  it('updates at once, busy or not', async () => {
    const page = fakePage({ workers: false });
    page.answer.deployed = RUNNING;
    const updates = installUpdates(fakeStore(), page.deps);
    updates.setBusy(() => true);
    await settle();
    page.answer.deployed = NEWER;
    page.fire('focus');
    await settle();
    expect(page.reload).not.toHaveBeenCalled();
    await updates.updateNow(() => true);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads once the loop guard is spent', async () => {
    const first = fakePage({ workers: false });
    installUpdates(fakeStore(), first.deps);
    await settle();
    const second = fakePage({ workers: false });
    second.deps.storage = first.deps.storage;
    const updates = installUpdates(fakeStore(), second.deps);
    await settle(MINUTE);
    expect(second.reload).not.toHaveBeenCalled();
    await updates.updateNow(() => true);
    expect(second.reload).toHaveBeenCalledTimes(1);
  });

  it('asks before losing edits, and does nothing when the answer is no', async () => {
    const page = fakePage({ workers: false });
    page.answer.deployed = RUNNING;
    const store = fakeStore(true);
    const updates = installUpdates(store, page.deps);
    await settle();
    page.answer.deployed = NEWER;
    page.fire('focus');
    await settle();
    const confirmLoss = vi.fn(() => false);
    await updates.updateNow(confirmLoss);
    expect(confirmLoss).toHaveBeenCalledTimes(1);
    expect(page.reload).not.toHaveBeenCalled();
    confirmLoss.mockReturnValue(true);
    await updates.updateNow(confirmLoss);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });
});

describe('installUpdates: teardown', () => {
  it('removes every listener and timer', async () => {
    const page = fakePage();
    page.answer.deployed = RUNNING;
    installUpdates(fakeStore(), page.deps).stop();
    await settle();
    const calls = page.fetch.mock.calls.length;
    page.answer.deployed = NEWER;
    page.visibility('visible');
    page.fire('focus');
    page.fire('online');
    page.fire('pageshow', { persisted: true });
    await settle(60 * MINUTE);
    expect(page.fetch).toHaveBeenCalledTimes(calls);
    expect(page.reload).not.toHaveBeenCalled();
  });
});
