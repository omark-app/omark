import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installLifecycle, msUntilMidnight } from './lifecycle.ts';

/** A stand-in for the page: `window` and `document` as bare event targets. */
function fakePage() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  const fire = (target: EventTarget, type: string): void => {
    target.dispatchEvent(new Event(type));
  };
  return {
    focus: () => fire(win, 'focus'),
    online: () => fire(win, 'online'),
    pagehide: () => fire(win, 'pagehide'),
    visibility: (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      fire(doc, 'visibilitychange');
    },
  };
}

const fakeStore = () => ({ refresh: vi.fn(async () => {}), flush: vi.fn(async () => {}), tick: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 16, 9, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('installLifecycle', () => {
  it('refreshes on focus, on becoming visible and on coming back online', () => {
    const page = fakePage();
    const store = fakeStore();
    installLifecycle(store);
    page.focus();
    page.visibility('visible');
    page.online();
    // The store runs one refresh at a time itself (see store.test.ts).
    expect(store.refresh).toHaveBeenCalledTimes(3);
  });

  it('flushes when hidden and on pagehide, without refreshing', () => {
    const page = fakePage();
    const store = fakeStore();
    installLifecycle(store);
    page.visibility('hidden');
    expect(store.flush).toHaveBeenCalledTimes(1);
    page.pagehide();
    expect(store.flush).toHaveBeenCalledTimes(2);
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it('ticks at local midnight, and again at the next one', async () => {
    fakePage();
    const store = fakeStore();
    vi.setSystemTime(new Date(2026, 9, 16, 23, 59, 50));
    installLifecycle(store);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(store.tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.tick).toHaveBeenCalledTimes(1);
    store.tick.mockClear();
    await vi.advanceTimersByTimeAsync(24 * 3600_000 - 1);
    // Only the periodic check (for clocks that jump, e.g. after sleep) ran in between.
    const beforeMidnight = store.tick.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(store.tick.mock.calls.length).toBe(beforeMidnight + 1);
  });

  it('the teardown removes every listener and timer', () => {
    const page = fakePage();
    const store = fakeStore();
    const stop = installLifecycle(store);
    stop();
    page.focus();
    page.online();
    page.visibility('visible');
    page.visibility('hidden');
    page.pagehide();
    vi.advanceTimersByTime(2 * 24 * 3600_000);
    expect(store.refresh).not.toHaveBeenCalled();
    expect(store.flush).not.toHaveBeenCalled();
    expect(store.tick).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('msUntilMidnight', () => {
  const at = (now: Date): Date => new Date(now.getTime() + msUntilMidnight(now));

  it('reaches the start of the next local day', () => {
    expect(msUntilMidnight(new Date(2026, 9, 16, 23, 59, 30))).toBe(30_000);
    expect(at(new Date(2026, 9, 16, 9, 0))).toEqual(new Date(2026, 9, 17));
  });

  it('at midnight exactly, waits for the next one', () => {
    expect(at(new Date(2026, 9, 17))).toEqual(new Date(2026, 9, 18));
  });

  it('follows the calendar across month ends', () => {
    expect(at(new Date(2026, 9, 31, 12, 0))).toEqual(new Date(2026, 10, 1));
  });

  it('counts a DST day as 25 or 23 hours (tests run in Europe/Warsaw)', () => {
    expect(msUntilMidnight(new Date(2026, 9, 25, 0, 0))).toBe(25 * 3600_000); // clocks go back
    expect(msUntilMidnight(new Date(2026, 2, 29, 0, 0))).toBe(23 * 3600_000); // clocks go forward
  });
});
