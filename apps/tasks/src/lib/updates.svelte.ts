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
  /** The worker that controlled the page when it loaded (null for an uncontrolled load). */
  loaded: ServiceWorker | null;
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
  /** How long to wait at most while a new worker is still installing. */
  takeoverCapMs: number;
}

/** What the UI reads and calls. */
export interface Updates {
  /** A newer build is deployed and waits to be loaded (the footer offers it). */
  readonly available: boolean;
  /** The page is about to reload into the newer build (the UI takes no input meanwhile). */
  readonly applying: boolean;
  /** Tells the updater whether something is in progress (an open sheet, a drag, a field or a draft). */
  setBusy(isBusy: () => boolean): void;
  /** The footer tap: update now. `confirmLoss` decides when edits would be lost. */
  updateNow(confirmLoss: () => boolean): Promise<void>;
  /** Removes every listener and timer. */
  stop(): void;
}

/** Served next to the app, never precached (see vite.config.ts), so it always names the deployed build. */
export const VERSION_URL = '/version.json';

/**
 * The worker the page loaded under, read when this module loads (before anything awaits): the
 * navigation's own update check can put a new worker in control while the store is still opening.
 */
const LOADED_UNDER: ServiceWorker | null =
  typeof navigator === 'undefined' ? null : (navigator.serviceWorker?.controller ?? null);

/** The real page's parts, for whatever `overrides` leaves out (tests run without a DOM). */
function withDefaults(overrides: Partial<UpdateDeps>): UpdateDeps {
  const or = <K extends keyof UpdateDeps>(key: K, real: () => UpdateDeps[K]): UpdateDeps[K] =>
    key in overrides ? (overrides[key] as UpdateDeps[K]) : real();
  return {
    workers: or('workers', () => navigator.serviceWorker),
    loaded: or('loaded', () => LOADED_UNDER),
    fetch: or('fetch', () => (url, init) => fetch(url, init)),
    reload: or('reload', () => () => location.reload()),
    build: or('build', () => BUILD_ID),
    storage: or('storage', () => {
      try {
        return sessionStorage;
      } catch {
        return null; // Storage blocked: no loop guard, so only the footer offers updates.
      }
    }),
    now: or('now', () => () => performance.now()),
    doc: or('doc', () => document),
    win: or('win', () => window),
    idleMs: or('idleMs', () => 60_000),
    pollMs: or('pollMs', () => 5_000),
    intervalMs: or('intervalMs', () => 30 * 60_000),
    takeoverMs: or('takeoverMs', () => 10_000),
    takeoverCapMs: or('takeoverCapMs', () => 30_000),
  };
}

/** sessionStorage: the build an update was last attempted for, and how far it got. */
const GUARD_KEY = 'taskapp:update-attempt';
/** The steps of an attempt: a normal update, then one with the service worker removed. */
const NORMAL = 1;
const UNREGISTER = 2;
/** Input events that mean the page is in use. The handler is one assignment, so mousemove is cheap. */
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'] as const;
/**
 * A failed check on open or return is tried again this long after the one before (2 s and 5 s after the
 * first): a resumed iPhone app often asks before its radio is awake.
 */
const RETRY_MS = [2_000, 3_000];

/** How an attempt was started: on open or return, by an idle page, or by the footer tap. */
interface How {
  idle?: boolean;
  confirmLoss?: () => boolean;
}

/**
 * Loads the newest deployed build. Navigations are served from the service worker's precache, so a page
 * opened after a deploy runs the old JS, and an iOS home-screen app is resumed rather than reopened. So
 * this asks `/version.json` which build is deployed: on open (call it once the store is open), on every
 * return to the page (again after 2 s and 5 s if that fails), on focus, on coming back online, and every
 * 30 minutes while visible.
 *
 * A newer build is loaded at once on open and on return, unless the UI is busy. Otherwise it is offered
 * in the footer (`available`) and loaded once there has been no input for a minute and the UI is not
 * busy. The store puts its edits in a cache that survives the reload, once before and again right before
 * reloading; if it can't, the reload waits and is tried again later. A loop guard allows one normal
 * update and one with the service worker removed per deployed build and tab; after that, or without
 * sessionStorage, only the footer offers it.
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
  /** The attempt under way: one at a time (focus and visibilitychange often come together). */
  let running: Promise<void> | null = null;
  let isBusy = (): boolean => false;
  let lastInput = deps.now();
  /** A blocked or failed attempt waits until then before the next automatic one. */
  let retryAt = 0;
  const retries = new Set<ReturnType<typeof setTimeout>>();

  // A newer worker controls the page when it is not the one the page loaded under. A page loaded without
  // a worker is claimed by its own build's worker: only a later change is newer.
  let controller = workers?.controller ?? null;
  let newerWorker = deps.loaded !== null && controller !== null && controller !== deps.loaded;
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

  /** The deployed build, or null when there is no information (offline or an error). */
  async function deployed(): Promise<string | null> {
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
  async function check(when: 'open' | 'use', retry = 0): Promise<void> {
    if (deps.build === 'dev') return;
    const build = await deployed();
    if (build === null) {
      if (when === 'open' && retry < RETRY_MS.length && visible()) {
        const timer = setTimeout(() => {
          retries.delete(timer);
          void check('open', retry + 1);
        }, RETRY_MS[retry]);
        retries.add(timer);
      }
      return;
    }
    target = build === deps.build ? null : build;
    if (target !== null && when === 'open' && !isBusy()) await attempt({});
  }

  /** Starts an attempt, or joins the one under way; a tap then tries again itself. */
  function attempt(how: How): Promise<void> {
    if (running) return how.confirmLoss ? running.then(() => attempt(how)) : running;
    const current = run(how).finally(() => {
      running = null;
    });
    running = current;
    return current;
  }

  /**
   * Saves the edits, then reloads into `target`. While edits would be lost it waits, unless the user says
   * go ahead (`confirmLoss`, from the footer tap). Automatic attempts stop once the loop guard is spent.
   */
  async function run(how: How): Promise<void> {
    const build = target;
    if (applying || build === null) return;
    const step = tried(build);
    if (!how.confirmLoss && (deps.storage === null || step >= UNREGISTER)) return;
    const since = lastInput;
    await store.flush();
    const loses = store.wouldLoseEdits();
    const confirmed = loses && !!how.confirmLoss?.();
    if (loses && !confirmed) {
      retryAt = deps.now() + deps.idleMs;
      return;
    }
    /** Right before leaving: the edits made meanwhile are saved, and an idle page is still idle. */
    const ready = async (): Promise<boolean> => {
      if (how.idle && lastInput !== since) return false;
      await store.flush();
      return confirmed || !store.wouldLoseEdits();
    };
    applying = true;
    if (!(await install(build, step, ready))) {
      applying = false;
      retryAt = deps.now() + deps.idleMs;
    }
  }

  /**
   * Lets a new service worker take control, then reloads. If none does in time, or that was tried
   * already, removes the worker and reloads: the check just proved the network works, and the page
   * registers its worker again. False when nothing was reloaded: `update()` failed, or `ready` said no.
   */
  async function install(build: string, step: number, ready: () => Promise<boolean>): Promise<boolean> {
    const registration = await workers?.getRegistration().catch(() => undefined);
    if (!workers || !registration) {
      if (!(await ready())) return false;
      record(build, UNREGISTER); // a reload is all there is to try
      deps.reload();
      return true;
    }
    if (step < NORMAL) {
      const result = newerWorker ? 'took' : await takeover(registration);
      if (result === 'failed') return false;
      if (result === 'took') {
        if (!(await ready())) return false;
        record(build, NORMAL);
        deps.reload();
        return true;
      }
    }
    if (!(await ready())) return false;
    record(build, UNREGISTER);
    await Promise.all((await workers.getRegistrations()).map((r) => r.unregister())).catch(() => {});
    deps.reload();
    return true;
  }

  /**
   * Asks for the new worker and waits up to `takeoverMs` for it to take control, or up to
   * `takeoverCapMs` while one is still installing or waiting.
   */
  function takeover(registration: ServiceWorkerRegistration): Promise<'took' | 'timeout' | 'failed'> {
    return new Promise((resolve) => {
      const done = (result: 'took' | 'timeout' | 'failed'): void => {
        clearTimeout(timer);
        workers!.removeEventListener('controllerchange', took);
        resolve(result);
      };
      const took = (): void => done('took');
      const giveUp = (): void => done('timeout');
      // Past `takeoverMs`, a worker still installing or waiting gets until `takeoverCapMs`.
      let timer = setTimeout(() => {
        if (registration.installing || registration.waiting) timer = setTimeout(giveUp, deps.takeoverCapMs - deps.takeoverMs);
        else giveUp();
      }, deps.takeoverMs);
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
    void attempt({ idle: true });
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
    updateNow: (confirmLoss) => attempt({ confirmLoss }),
    stop() {
      workers?.removeEventListener('controllerchange', onController);
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pageshow', onPageShow);
      win.removeEventListener('focus', onUse);
      win.removeEventListener('online', onUse);
      for (const type of INPUT_EVENTS) win.removeEventListener(type, onInput, { capture: true });
      clearInterval(poll);
      clearInterval(periodic);
      for (const timer of retries) clearTimeout(timer);
    },
  };
}
