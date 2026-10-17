import type { AppStore } from './store.svelte.ts';

/**
 * A backstop for the midnight timer: timers can fire late after a device sleeps, or the clock can be
 * changed. `tick` is cheap and only re-renders when the day or week actually moved on.
 */
const TICK_MS = 30_000;

/** Milliseconds from `now` to the start of the next local day (a calendar day, so DST days are 23 or 25 h). */
export function msUntilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Spec 3.5 and planning decision 13: re-read the files when the app regains focus or comes back online,
 * save when it is hidden or closed, and recompute the buckets at local midnight. Returns a teardown that
 * removes every listener and timer.
 */
export function installLifecycle(store: Pick<AppStore, 'refresh' | 'flush' | 'tick'>): () => void {
  // Regaining focus fires both `focus` and `visibilitychange`: one refresh at a time is enough.
  let refreshing: Promise<void> | null = null;
  const refresh = (): void => {
    refreshing ??= store.refresh().finally(() => {
      refreshing = null;
    });
  };
  // `flush` runs the registered pending-edit callbacks synchronously before it stages, so typing still
  // waiting for its debounce is committed before the page goes away.
  const flush = (): void => void store.flush();
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
    else refresh();
  };

  let midnight: ReturnType<typeof setTimeout>;
  const armMidnight = (): void => {
    midnight = setTimeout(() => {
      store.tick();
      armMidnight();
    }, msUntilMidnight(new Date()));
  };
  armMidnight();
  const periodic = setInterval(() => store.tick(), TICK_MS);

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('pagehide', flush);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
    window.removeEventListener('pagehide', flush);
    clearTimeout(midnight);
    clearInterval(periodic);
  };
}
