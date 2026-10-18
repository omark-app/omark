import { afterEach, describe, expect, it, vi } from 'vitest';
import { installUpdates } from './updates.ts';

/** `document` as a bare event target, and a service worker container whose controller can change. */
function fakePage(controlled: boolean) {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  vi.stubGlobal('document', doc);
  const update = vi.fn(async () => {});
  const workers = Object.assign(new EventTarget(), {
    controller: (controlled ? {} : null) as ServiceWorker | null,
    getRegistration: vi.fn(async () => ({ update }) as unknown as ServiceWorkerRegistration),
  });
  return {
    workers,
    update,
    /** A new worker takes control of the page. */
    takeover: () => {
      workers.controller = {} as ServiceWorker;
      workers.dispatchEvent(new Event('controllerchange'));
    },
    visibility: (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

const fakeStore = (loses = false) => ({ flush: vi.fn(async () => {}), wouldLoseEdits: vi.fn(() => loses) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installUpdates', () => {
  it('asks for a new build on every return to the page, not on leaving it', async () => {
    const page = fakePage(true);
    const reload = vi.fn();
    installUpdates(fakeStore(), page.workers, reload);
    page.visibility('hidden');
    expect(page.workers.getRegistration).not.toHaveBeenCalled();
    page.visibility('visible');
    await vi.waitFor(() => expect(page.update).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads on the return after a new build took over, once the edits are cached', async () => {
    const page = fakePage(true);
    const store = fakeStore();
    const reload = vi.fn();
    installUpdates(store, page.workers, reload);
    page.takeover();
    expect(reload).not.toHaveBeenCalled(); // never mid-session
    page.visibility('hidden');
    page.visibility('visible');
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(store.flush).toHaveBeenCalledBefore(reload);
  });

  it('does not reload while edits would be lost, and tries again on the next return', async () => {
    const page = fakePage(true);
    const store = fakeStore(true);
    const reload = vi.fn();
    installUpdates(store, page.workers, reload);
    page.takeover();
    page.visibility('visible');
    await vi.waitFor(() => expect(store.flush).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
    store.wouldLoseEdits.mockReturnValue(false);
    page.visibility('visible');
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('the first worker to claim an uncontrolled page is its own build: no reload', async () => {
    const page = fakePage(false);
    const reload = vi.fn();
    installUpdates(fakeStore(), page.workers, reload);
    page.takeover();
    page.visibility('visible');
    await vi.waitFor(() => expect(page.update).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    page.takeover(); // a later build
    page.visibility('visible');
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does nothing without service workers, and the teardown removes the listeners', async () => {
    expect(() => installUpdates(fakeStore(), undefined)()).not.toThrow();
    const page = fakePage(true);
    const reload = vi.fn();
    installUpdates(fakeStore(), page.workers, reload)();
    page.takeover();
    page.visibility('visible');
    expect(page.workers.getRegistration).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
