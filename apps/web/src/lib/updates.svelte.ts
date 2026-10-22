import { BUILD_ID } from '../env.ts';
import type { AppStore } from './store.svelte.ts';

/** The parts of `navigator.serviceWorker` used here. */
type Workers = Pick<
  ServiceWorkerContainer,
  'controller' | 'getRegistration' | 'getRegistrations' | 'addEventListener' | 'removeEventListener'
>;

/** The answer of `fetch` as far as it is read here. */
type Answer = Pick<Response, 'ok' | 'json'>;

/** Everything the updater touches, so tests can pass fakes. */
export interface UpdateDeps {
  /** `navigator.serviceWorker`; undefined where there are none (e2e blocks them). */
  workers: Workers | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Answer>;
  reload: () => void;
  /** The running build (`dev` when unknown: then nothing is ever checked). */
  build: string;
  /** Where the loop guard is kept (sessionStorage); null when storage is blocked. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Milliseconds on a clock that only moves forward. */
  now: () => number;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** How long with no input before a page in use may reload. */
  idleMs: number;
  /** How often a waiting update looks whether the page is idle. */
  pollMs: number;
  /** How often a visible page asks for a new build. */
  intervalMs: number;
  /** How long to wait for a new service worker to take control. */
  takeoverMs: number;
}

/** What the UI reads and calls. */
export interface Updates {
  /** A newer build is deployed and waits to be loaded (the footer offers it). */
  readonly available: boolean;
  /** The page is about to reload into the newer build. */
  readonly applying: boolean;
  /** Tells the updater whether something is in progress (an open sheet, a drag, a focused field). */
  setBusy(isBusy: () => boolean): void;
  /** The footer tap: update now. `confirmLoss` decides when edits would be lost. */
  updateNow(confirmLoss: () => boolean): Promise<void>;
  /** Removes every listener and timer. */
  stop(): void;
}

/** Served next to the app, never precached (see vite.config.ts), so it always names the deployed build. */
export const VERSION_URL = '/version.json';

/** The real page's parts, for whatever `overrides` leaves out (tests run without a DOM). */
function withDefaults(overrides: Partial<UpdateDeps>): UpdateDeps {
  const or = <K extends keyof UpdateDeps>(key: K, real: () => UpdateDeps[K]): UpdateDeps[K] =>
    key in overrides ? (overrides[key] as UpdateDeps[K]) : real();
  return {
    workers: or('workers', () => navigator.serviceWorker),
    fetch: or('fetch', () => (url, init) => fetch(url, init)),
    reload: or('reload', () => () => location.reload()),
    build: or('build', () => BUILD_ID),
    storage: or('storage', () => {
      try {
        return sessionStorage;
      } catch {
        return null; // Storage blocked: the loop guard only lasts as long as the page.
      }
    }),
    now: or('now', () => () => performance.now()),
    doc: or('doc', () => document),
    win: or('win', () => window),
    idleMs: or('idleMs', () => 60_000),
    pollMs: or('pollMs', () => 5_000),
    intervalMs: or('intervalMs', () => 30 * 60_000),
    takeoverMs: or('takeoverMs', () => 10_000),
  };
}

/** sessionStorage: the build an update was last attempted for, and how far it got. */
const GUARD_KEY = 'taskapp:update-attempt';
/** The steps of an attempt: a normal update, then one with the service worker removed. */
const NORMAL = 1;
const UNREGISTER = 2;
/** Input events that mean the page is in use. */
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Loads the newest deployed build. Navigations are served from the service worker's precache, so a page
 * opened after a deploy runs the old JS, and an iOS home-screen app is resumed rather than reopened. So
 * this asks `/version.json` which build is deployed: on open (call it once the store is open), on every
 * return to the page, on focus, on coming back online, and every 30 minutes while visible.
 *
 * A newer build is loaded at once on open and on return. Found while the page is in use, it is offered in
 * the footer (`available`) and loaded once there has been no input for a minute and the UI is not busy.
 * Before reloading, the store puts its edits in a cache that survives the reload; if it can't, the
 * reload waits and is tried again later. A loop guard allows one normal update and one with the service
 * worker removed per deployed build and tab; after that only the footer offers it.
 */
export function installUpdates(
  store: Pick<AppStore, 'flush' | 'wouldLoseEdits'>,
  overrides: Partial<UpdateDeps> = {},
): Updates {
  const deps = withDefaults(overrides);
  const { workers, doc, win } = deps;

  /** The newer build deployed, once a check found one. */
  let target = $state<string | null>(null);
  let applying = $state(false);
  /** One attempt at a time (focus and visibilitychange often come together), and none once reloading. */
  let attempting = false;
  let isBusy = (): boolean => false;
  let lastInput = deps.now();
  /** A blocked or failed attempt waits until then before the next automatic one. */
  let retryAt = 0;

  // A page loaded without a worker is claimed by its own build's worker: only a later change is newer.
  let controller = workers?.controller ?? null;
  let newerWorker = false;
  const onController = (): void => {
    if (controller) newerWorker = true;
    controller = workers?.controller ?? null;
  };

  /** How far updating to `build` got in this tab: 0, NORMAL or UNREGISTER. */
  function tried(build: string): number {
    try {
      const saved = JSON.parse(deps.storage?.getItem(GUARD_KEY) ?? 'null') as { build: string; step: number } | null;
      return saved?.build === build ? saved.step : 0;
    } catch {
      return 0;
    }
  }
  function record(build: string, step: number): void {
    try {
      deps.storage?.setItem(GUARD_KEY, JSON.stringify({ build, step }));
    } catch {
      // Storage full or blocked: the guard does not survive the reload.
    }
  }

  /** The deployed build, or null when there is no information (offline, an error, a dev build). */
  async function deployed(): Promise<string | null> {
    if (deps.build === 'dev') return null;
    try {
      const answer = await deps.fetch(VERSION_URL, { cache: 'no-store' });
      if (!answer.ok) return null;
      const body = (await answer.json()) as { build?: unknown };
      return typeof body.build === 'string' && body.build ? body.build : null;
    } catch {
      return null;
    }
  }

  /** `open`: on open or return, a newer build loads at once. `use`: it waits for an idle page. */
  async function check(when: 'open' | 'use'): Promise<void> {
    const build = await deployed();
    if (build === null) return;
    target = build === deps.build ? null : build;
    if (target !== null && when === 'open') await attempt();
  }

  /**
   * Saves the edits, then reloads into `target`. While edits would be lost it waits, unless the user says
   * go ahead (`confirmLoss`, from the footer tap). Automatic attempts stop once the loop guard is spent.
   */
  async function attempt(confirmLoss?: () => boolean): Promise<void> {
    const build = target;
    if (attempting || applying || build === null) return;
    const step = tried(build);
    if (!confirmLoss && step >= UNREGISTER) return;
    attempting = true;
    try {
      await store.flush();
      if (store.wouldLoseEdits() && !confirmLoss?.()) {
        retryAt = deps.now() + deps.idleMs;
        return;
      }
      applying = true;
      if (!(await install(build, step))) {
        applying = false;
        retryAt = deps.now() + deps.idleMs;
      }
    } finally {
      attempting = false;
    }
  }

  /**
   * Lets a new service worker take control, then reloads. If none does within `takeoverMs`, or that was
   * tried already, removes the worker and reloads: the check just proved the network works, and the page
   * registers its worker again. False when `update()` failed: nothing was reloaded.
   */
  async function install(build: string, step: number): Promise<boolean> {
    const registration = await workers?.getRegistration().catch(() => undefined);
    if (!workers || !registration) {
      record(build, UNREGISTER); // a reload is all there is to try
      deps.reload();
      return true;
    }
    if (step < NORMAL) {
      const result = newerWorker ? 'took' : await takeover(registration);
      if (result === 'failed') return false;
      if (result === 'took') {
        record(build, NORMAL);
        deps.reload();
        return true;
      }
    }
    record(build, UNREGISTER);
    await Promise.all((await workers.getRegistrations()).map((r) => r.unregister())).catch(() => {});
    deps.reload();
    return true;
  }

  /** Asks for the new worker and waits up to `takeoverMs` for it to take control. */
  function takeover(registration: ServiceWorkerRegistration): Promise<'took' | 'timeout' | 'failed'> {
    return new Promise((resolve) => {
      const done = (result: 'took' | 'timeout' | 'failed'): void => {
        clearTimeout(timer);
        workers!.removeEventListener('controllerchange', took);
        resolve(result);
      };
      const took = (): void => done('took');
      const timer = setTimeout(() => done('timeout'), deps.takeoverMs);
      workers!.addEventListener('controllerchange', took);
      registration.update().catch(() => done('failed'));
    });
  }

  const visible = (): boolean => doc.visibilityState === 'visible';
  const onVisibility = (): void => {
    if (visible()) void check('open');
  };
  const onPageShow = (e: Event): void => {
    if ((e as PageTransitionEvent).persisted) void check('open');
  };
  const onUse = (): void => void check('use');
  const onInput = (): void => {
    lastInput = deps.now();
  };
  // A waiting update loads once the page is visible, idle for `idleMs`, and nothing is in progress.
  const poll = setInterval(() => {
    const now = deps.now();
    if (target === null || !visible() || now < retryAt || now - lastInput < deps.idleMs || isBusy()) return;
    void attempt();
  }, deps.pollMs);
  const periodic = setInterval(() => {
    if (visible()) void check('use');
  }, deps.intervalMs);

  workers?.addEventListener('controllerchange', onController);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('focus', onUse);
  win.addEventListener('online', onUse);
  for (const type of INPUT_EVENTS) win.addEventListener(type, onInput, { capture: true, passive: true });
  void check('open');

  return {
    get available() {
      return target !== null;
    },
    get applying() {
      return applying;
    },
    setBusy(fn) {
      isBusy = fn;
    },
    updateNow: (confirmLoss) => attempt(confirmLoss),
    stop() {
      workers?.removeEventListener('controllerchange', onController);
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pageshow', onPageShow);
      win.removeEventListener('focus', onUse);
      win.removeEventListener('online', onUse);
      for (const type of INPUT_EVENTS) win.removeEventListener(type, onInput, { capture: true });
      clearInterval(poll);
      clearInterval(periodic);
    },
  };
}
