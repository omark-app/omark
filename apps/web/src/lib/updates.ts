import type { AppStore } from './store.svelte.ts';

/** The parts of `navigator.serviceWorker` used here. */
type Workers = Pick<ServiceWorkerContainer, 'controller' | 'getRegistration' | 'addEventListener' | 'removeEventListener'>;

/**
 * iOS resumes a home-screen app without reloading it, so the page can keep running the build it loaded
 * for days after a new one is deployed: the new service worker takes control at once, but the page runs
 * the new build only when it is loaded again. So on every return to the page, ask for a new build; once a
 * new worker has taken control, the next return reloads the page, after the store has put its edits in a
 * cache that survives the reload (if it can't, it tries again on the next return). Returns a teardown.
 */
export function installUpdates(
  store: Pick<AppStore, 'flush' | 'wouldLoseEdits'>,
  workers: Workers | undefined = navigator.serviceWorker,
  reload: () => void = () => location.reload(),
): () => void {
  if (!workers) return () => {};
  let controller = workers.controller;
  let outdated = false;
  const onController = (): void => {
    // A page loaded without a worker is claimed by its own build's worker: only a later change is newer.
    if (controller) outdated = true;
    controller = workers.controller;
  };
  const onVisibility = async (): Promise<void> => {
    if (document.visibilityState !== 'visible') return;
    if (outdated) {
      await store.flush();
      if (!store.wouldLoseEdits()) {
        reload();
        return;
      }
    }
    workers.getRegistration().then((r) => r?.update()).catch(() => {});
  };
  const visibility = (): void => void onVisibility();

  workers.addEventListener('controllerchange', onController);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    workers.removeEventListener('controllerchange', onController);
    document.removeEventListener('visibilitychange', visibility);
  };
}
