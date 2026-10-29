import { PreconditionFailedError } from '@omark/storage';
import type { Auth } from '@omark/storage';
import type { Accounts, Place, Storage } from './places.ts';
import { STORAGES } from './places.ts';
import { entryPart, partsOf, route, withParts } from './suite.ts';
import type { Part } from './suite.ts';

/** The device's storage choice (one app spec, section 4: it stays per device). */
const CHOICE_KEY = 'omark:storage';
/** The parts last read from a folder's suite file, per folder, so a known device starts without waiting. */
const partsKey = (place: Place) => `omark:parts:${place.key}`;

/**
 * What the shell shows: opening; the first run's steps (`welcome`: demo or use, `where`: the storage,
 * `parts`: what to use); the parts; or an error that stops the start.
 */
export type Phase = 'loading' | 'welcome' | 'where' | 'parts' | 'ready' | 'error';

const isStorage = (s: unknown): s is Storage => typeof s === 'string' && (STORAGES as readonly string[]).includes(s);

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Site data blocked: the next start decides again.
  }
}

/**
 * The one Omark app's shell: one storage for the device, one Omark folder, and the parts on in it (the suite
 * `config.yaml`). Starts by reading a sign-in redirect's result, then opens the device's storage, or runs the
 * first run (one app spec, section 6).
 */
export class Shell {
  phase = $state<Phase>('loading');
  error = $state<string | null>(null);
  /** The storages the first run offers. */
  storages = $state<Storage[]>([]);
  /** The parts on, in tab order. */
  on = $state<Part[]>([]);
  /** The part on screen, or the one offered (off) at this address. */
  current = $state<Part | null>(null);
  offer = $state<Part | null>(null);
  /** The parts shown at least once: they stay mounted, so each keeps its state across tabs. */
  visited = $state<Part[]>([]);
  /** The first run's ticks (the part in the entry address first). */
  ticked = $state<Part[]>([]);
  place = $state.raw<Place | null>(null);
  /**
   * Each part's last address (its hash too: Tasks' #settings), scroll and focused element (an open search's
   * field), restored when its tab shows again.
   */
  private last: Partial<Record<Part, { url: string; scroll: number; focus: Element | null }>> = {};

  constructor(private readonly accounts: Accounts) {}

  async start(): Promise<void> {
    try {
      await this.begin();
    } catch (e) {
      this.error = message(e);
      this.phase = 'error';
    }
  }

  private async begin(): Promise<void> {
    const { auth } = this.accounts;
    try {
      await auth.handleRedirect();
    } catch (e) {
      // A failed or cancelled sign-in: say why. A device with a usable storage still opens it below.
      this.error = message(e);
    }
    const saved = load(CHOICE_KEY);
    const choice = isStorage(saved) ? saved : null;
    const signedIn = auth.isSignedIn() ? auth.signedInProvider() : null;
    if (choice === 'folder' ? (await this.accounts.savedFolder()) !== null : choice !== null && signedIn === choice) {
      await this.open(choice!);
    } else if (choice === null && isStorage(signedIn)) {
      // Signed in from an earlier visit with no choice kept (site data cleared): that account's folder.
      keep(CHOICE_KEY, signedIn);
      await this.open(signedIn);
    } else if (this.error !== null) {
      await this.toWhere();
    } else {
      this.phase = 'welcome';
    }
  }

  async toWhere(): Promise<void> {
    this.storages = await this.accounts.storages();
    this.phase = 'where';
  }

  /** The first run's "where": a sign-in redirect (the page leaves), or the folder picker, then the folder opens. */
  async choose(storage: Storage): Promise<void> {
    this.error = null;
    try {
      if (storage === 'folder' && !(await this.accounts.pickFolder())) return;
      keep(CHOICE_KEY, storage);
      const { auth } = this.accounts;
      if (storage !== 'folder' && !(auth.isSignedIn() && auth.signedInProvider() === storage)) {
        await auth.signIn(storage, { returnTo: location.pathname });
        // A real sign-in is leaving the page, perhaps still with another provider's session: open nothing.
        // The fake one is done, signed in with this storage.
        if (auth.signedInProvider() !== storage) return;
      }
      await this.open(storage);
    } catch (e) {
      this.error = message(e);
    }
  }

  /** Opens the Omark folder: the parts its suite file lists, or the parts question when it has none yet. */
  async open(storage: Storage): Promise<void> {
    const place = await this.accounts.open(storage);
    if (!place) {
      await this.toWhere();
      return;
    }
    this.place = place;
    const seen = load(partsKey(place));
    if (seen !== null) {
      // A device that has opened this folder before starts at once with the parts it last saw, so a Tasks-only
      // start waits for nothing more than Omark Tasks did; the suite file is read meanwhile.
      this.show(partsOf(seen));
      void this.recheck(place);
      return;
    }
    let text: string | null;
    try {
      text = (await place.root.read('config.yaml'))?.text ?? null;
    } catch {
      // Offline or signed out on a first open here: Tasks alone for now, kept nowhere, so the next start
      // reads the folder again (and asks, if it has no suite file).
      this.show(partsOf(null), undefined, false);
      return;
    }
    const suite = text !== null && /^parts\s*:/m.test(text);
    if (!suite && storage === 'folder' && (await place.root.read('tasks.md').catch(() => null))) {
      // Omark Tasks' own folder (tasks.md and its config.yaml at the top): its config.yaml is not the suite's.
      this.place = null;
      this.error =
        'This folder has Omark Tasks files (tasks.md) at its top. Pick the folder above it, or move tasks.md, done.md and config.yaml into a tasks folder inside it.';
      await this.toWhere();
      return;
    }
    if (text === null) {
      this.askParts();
      return;
    }
    this.show(partsOf(text));
  }

  /** The Auth a part signs in again with: it comes back to the part's address. */
  partAuth(): Auth {
    const auth = this.accounts.auth;
    return { ...auth, signIn: (provider, o) => auth.signIn(provider, { ...o, returnTo: location.pathname }) };
  }

  /** Brings in parts another device turned on or off since this one last looked. */
  private async recheck(place: Place): Promise<void> {
    const before = this.on.join();
    let text: string | null;
    try {
      text = (await place.root.read('config.yaml'))?.text ?? null;
    } catch {
      return; // Offline: the next start looks again.
    }
    // The user changed the parts meanwhile (turned one on): that write is newer than this read.
    if (this.on.join() !== before || this.phase !== 'ready') return;
    if (text === null) {
      this.askParts();
      return;
    }
    const parts = partsOf(text);
    if (parts.join() !== this.on.join()) this.show(parts);
  }

  private askParts(): void {
    this.ticked = [entryPart(location.pathname)];
    this.phase = 'parts';
  }

  /** The first run's "Start": writes the suite file with the ticked parts, unless another device just did. */
  async startWith(parts: Part[]): Promise<void> {
    const place = this.place!;
    this.error = null;
    try {
      try {
        await place.root.write('config.yaml', withParts(null, parts), null);
        this.show(parts);
      } catch (e) {
        if (!(e instanceof PreconditionFailedError)) throw e;
        this.show(partsOf((await place.root.read('config.yaml'))?.text ?? null));
      }
    } catch (e) {
      this.error = message(e);
    }
  }

  /** Turns a part on, at the end of the tabs, and opens it. */
  async turnOn(part: Part): Promise<void> {
    const root = this.place!.root;
    try {
      for (let tries = 0; ; tries++) {
        const file = await root.read('config.yaml');
        const parts = [...partsOf(file?.text ?? null).filter((p) => p !== part), part];
        try {
          await root.write('config.yaml', withParts(file?.text ?? null, parts), file?.etag ?? null);
          this.show(parts, `/${part}`);
          return;
        } catch (e) {
          // Another device changed the file meanwhile: read it again and add the part to theirs.
          if (!(e instanceof PreconditionFailedError) || tries >= 2) throw e;
        }
      }
    } catch (e) {
      this.error = `Could not turn ${part} on: ${message(e)}`;
    }
  }

  /** Goes to a part's tab (a click, a key) without reloading: back where that part was, address and scroll. */
  go(path: string): void {
    this.remember();
    const to = route(path, this.on);
    const target = 'open' in to ? (this.last[to.open]?.url ?? path) : path;
    if (location.pathname + location.search + location.hash !== target) history.pushState(null, '', target);
    this.route();
    const back = this.current ? this.last[this.current] : undefined;
    // After the hidden part shows again (the DOM updates first).
    requestAnimationFrame(() => {
      scrollTo(0, back?.scroll ?? 0);
      if (back?.focus?.isConnected) (back.focus as HTMLElement).focus?.({ preventScroll: true });
    });
  }

  /** Notes where the part on screen is, before another one shows. */
  remember(): void {
    if (!this.current) return;
    const focus = typeof document === 'undefined' ? null : document.activeElement;
    this.last[this.current] = { url: location.pathname + location.search + location.hash, scroll: scrollY, focus };
  }

  /** Shows what the address asks for (also on browser back and forward). */
  route(): void {
    const to = route(location.pathname, this.on);
    if ('go' in to) {
      // The hash and the history entry's state are the part's (Tasks' #settings and its marks): they stay.
      history.replaceState(history.state, '', to.go + location.search + location.hash);
      this.route();
      return;
    }
    if ('offer' in to) {
      this.offer = to.offer;
      this.current = null;
      return;
    }
    this.offer = null;
    this.current = to.open;
    if (!this.visited.includes(to.open)) this.visited = [...this.visited, to.open];
  }

  private show(parts: Part[], path?: string, save = true): void {
    this.on = parts;
    if (save && this.place) keep(partsKey(this.place), withParts(null, parts));
    this.phase = 'ready';
    if (path) history.replaceState(history.state, '', path);
    this.route();
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
