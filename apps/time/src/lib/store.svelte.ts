import { AuthRequiredError, OfflineError } from '@omark/storage';
import type { CalendarInfo } from '@omark/calendar';
import { defaultTimeConfigText, localDate, parseTimeConfig, setTimeConfig } from '@omark/time-core';
import type { TimeConfig } from '@omark/time-core';
import type { AppDeps, Place } from './boot.ts';
import { colourAfterSync, confirmClear, planClear } from './colouring.ts';
import type { ColourDeps, ColourOutcome } from './colouring.ts';
import { CONFIG } from './files.ts';
import { FRESH_PREFS } from './prefs.ts';
import type { StorageKind } from './prefs.ts';
import type { ColourJob } from './state.ts';
import { readSummary, sync } from './sync.ts';
import type { SyncResult } from './sync.ts';

export type Phase = 'loading' | 'signin' | 'storage' | 'calendars' | 'ready' | 'error';
/**
 * `offline`: Google or the storage can't be reached; `signin`: the sign-in has lapsed or lacks a permission;
 * `folder`: the browser wants permission for the folder on this computer again (`allowFolder`, from a click).
 */
export type SyncState = 'syncing' | 'synced' | 'offline' | 'signin' | 'folder' | 'failed';
/** `running`: patches are going out; `colourLeft` says how many. */
export type ColourState = ColourOutcome | 'running';

/**
 * The app's state for the UI, and what the UI can do. Syncs and colour runs take turns on one lock: a sync
 * asked for while one runs (a click, a settings change) runs once after it, and a colour pass stops at its
 * next patch when colouring is turned off or a sync is waiting. Actions never reject; a failure shows in
 * `sync` and `error`.
 */
export class TimeStore {
  phase = $state<Phase>('loading');
  error = $state<string | null>(null);
  sync = $state<SyncState>('syncing');
  syncedAt = $state<number | null>(null);
  rows = $state(0);
  fixCount = $state(0);
  colour = $state<ColourState>('off');
  colourLeft = $state(0);
  /** How many tracker colours a clear would take off; set while the clear is offered. */
  clearOffer = $state<number | null>(null);
  calendars = $state<CalendarInfo[]>([]);
  /** Why the calendar list could not be read, for the first run's calendars step. */
  calendarsError = $state<string | null>(null);
  config = $state<TimeConfig | null>(null);
  storage = $state<StorageKind | null>(null);
  /** What the texts call the storage: "Google Drive", or "the folder Hours". */
  storageName = $state('');
  /** The browser's permission for the folder was refused when asked. */
  folderRefused = $state(false);
  /** Sign-out was asked for while a change had not reached the storage yet; `signOut({ anyway: true })` goes on. */
  signOutPending = $state(false);

  private place: Place | null = null;
  /** The sync or colour run that holds the lock, and the one sync waiting for it. */
  private running: Promise<void> | null = null;
  private waiting: Promise<void> | null = null;
  private waitingRebuild = false;
  private last: SyncResult | null = null;
  private clearJobs: ColourJob[] = [];
  private stopped = false;

  constructor(private readonly deps: AppDeps) {}

  /** The first run offers a folder on this computer only where the browser can pick one. */
  get canPickFolder(): boolean {
    return this.deps.canPickFolder;
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      await this.deps.auth.handleRedirect();
    } catch (e) {
      this.fail(e);
      return;
    }
    if (!this.deps.auth.isSignedIn()) {
      this.phase = 'signin';
      return;
    }
    const prefs = await this.deps.prefs.load();
    // A folder picked on another browser, or one IndexedDB lost, is picked again.
    if (!prefs.storage || !(await this.open(prefs.storage))) {
      this.phase = 'storage';
      return;
    }
    if (!prefs.started) {
      this.phase = 'calendars';
      await this.loadCalendars();
      return;
    }
    this.phase = 'ready';
    await this.syncNow();
  }

  signIn(): Promise<void> {
    return this.guard(async () => {
      await this.deps.auth.signIn();
      await this.start();
    });
  }

  /**
   * First run, step 1. Google Drive needs Drive access added to the sign-in first. A folder on this computer
   * needs the picker, which must open straight from the click, before anything else is awaited.
   */
  chooseStorage(kind: StorageKind): Promise<void> {
    return this.guard(async () => {
      if (kind === 'local-folder') {
        if (!(await this.deps.pickFolder())) return;
        await this.deps.prefs.save({ ...(await this.deps.prefs.load()), storage: kind });
        this.place = null;
        await this.start();
        return;
      }
      const prefs = await this.deps.prefs.load();
      if (!prefs.askedDrive) await this.deps.auth.addAccess('drive');
      await this.deps.prefs.save({ ...prefs, storage: kind, askedDrive: true });
      await this.start();
    });
  }

  /** The browser wants permission for the folder again: asks (from a click), then syncs. */
  allowFolder(): Promise<void> {
    return this.guard(async () => {
      if (!this.place?.folder) return;
      this.folderRefused = !(await this.place.folder.allow());
      if (!this.folderRefused) await this.syncNow();
    });
  }

  /** The folder moved or was renamed: picks it again, keeping this device's copy of its files. */
  pickFolderAgain(): Promise<void> {
    return this.guard(async () => {
      if (!(await this.deps.pickFolder({ again: true }))) return;
      this.folderRefused = false;
      this.place = null;
      await this.open('local-folder');
      await this.syncNow();
    });
  }

  /** First run, step 2: the calendars to read go into config.yaml, then the first sync. */
  chooseCalendars(ids: string[]): Promise<void> {
    return this.guard(async () => {
      await this.writeConfig({ calendars: ids });
      const prefs = await this.deps.prefs.load();
      await this.deps.prefs.save({ ...prefs, started: true });
      this.phase = 'ready';
      await this.syncNow();
    });
  }

  /** Runs a sync after the one in progress, if any; asked for again before that one starts, it runs once. */
  syncNow(opts: { rebuild?: boolean } = {}): Promise<void> {
    if (opts.rebuild) this.waitingRebuild = true;
    this.waiting ??= this.afterRunning(async () => {
      this.waiting = null;
      const rebuild = this.waitingRebuild;
      this.waitingRebuild = false;
      await this.runSync({ rebuild });
    });
    return this.waiting;
  }

  rebuild(): Promise<void> {
    return this.syncNow({ rebuild: true });
  }

  setCalendars(ids: string[]): Promise<void> {
    return this.guard(async () => {
      await this.writeConfig({ calendars: ids });
      await this.syncNow();
    });
  }

  /**
   * Turning colouring on asks Google for edit access the first time on this device (spec 8). Turning it off
   * stops a pass that is running and offers to clear the colours the tracker set.
   */
  setColouring(on: boolean): Promise<void> {
    return this.guard(async () => {
      await this.writeConfig({ colourEvents: on });
      if (on) {
        const prefs = await this.deps.prefs.load();
        if (!prefs.askedEdit) {
          await this.deps.prefs.save({ ...prefs, askedEdit: true });
          await this.deps.auth.addAccess('edit');
        }
        await this.syncNow();
        return;
      }
      await this.syncNow();
      if (this.last && this.config?.colourEvents === false) {
        this.clearJobs = await planClear(this.last, { source: this.deps.source });
        this.clearOffer = this.clearJobs.length > 0 ? this.clearJobs.length : null;
      }
    });
  }

  /** The answer to the clear offer. Only a yes saves the clear, so nothing else ever runs it unasked. */
  answerClear(clear: boolean): Promise<void> {
    const jobs = this.clearJobs;
    this.clearJobs = [];
    this.clearOffer = null;
    if (!clear || !this.place || jobs.length === 0) return Promise.resolve();
    const place = this.place;
    return this.afterRunning(() => this.runColours(() => confirmClear(jobs, this.colourDeps(place, 'clear'))));
  }

  giveEditAccess(): Promise<void> {
    return this.guard(async () => {
      const prefs = await this.deps.prefs.load();
      await this.deps.prefs.save({ ...prefs, askedEdit: true });
      await this.deps.auth.addAccess('edit');
      await this.syncNow();
    });
  }

  /**
   * Signs out, then forgets everything this device kept for the account: the copy of the files, the sync
   * state and the choices, so the next account on this device starts clean. A change that has not reached
   * the storage yet would be lost, so that asks first (`signOutPending`).
   */
  signOut(opts: { anyway?: boolean } = {}): Promise<void> {
    return this.guard(async () => {
      this.stopped = true;
      await this.waiting?.catch(() => {});
      await this.running?.catch(() => {});
      if (!opts.anyway && this.place && (await this.place.files.hasUnsynced())) {
        this.signOutPending = true;
        this.stopped = false;
        return;
      }
      this.signOutPending = false;
      await this.deps.auth.signOut();
      await this.deps.forget();
      await this.deps.prefs.save({ ...FRESH_PREFS });
      this.place = null;
      this.storage = null;
      this.storageName = '';
      this.folderRefused = false;
      this.last = null;
      this.config = null;
      this.calendars = [];
      this.rows = 0;
      this.fixCount = 0;
      this.syncedAt = null;
      this.colour = 'off';
      this.clearOffer = null;
      this.clearJobs = [];
      this.phase = 'signin';
    });
  }

  async loadCalendars(): Promise<void> {
    try {
      this.calendars = await this.deps.source.listCalendars();
      this.calendarsError = null;
    } catch (e) {
      this.noteFailure(e);
      this.calendarsError =
        e instanceof OfflineError ? "Omark Time can't reach Google right now." : e instanceof Error ? e.message : String(e);
    }
  }

  /** Opens the place the files live in; false when it can't be (no folder picked on this device). */
  private async open(kind: StorageKind): Promise<boolean> {
    if (this.storage === kind && this.place) return true;
    const place = await this.deps.openPlace(kind);
    if (!place) return false;
    this.storage = kind;
    this.storageName = place.folder ? `the folder ${place.folder.name}` : 'Google Drive';
    this.place = place;
    place.files.onStatus(() => {
      if (this.sync === 'synced') this.sync = this.filesState('synced');
    });
    return true;
  }

  /** The storage's own state where it is worse than `ok`: FileSync keeps write failures to its status. */
  private filesState(ok: SyncState): SyncState {
    const files = this.place?.files.status();
    if (files === 'offline') return 'offline';
    // For a folder, "sign in" means the browser wants permission again.
    if (files === 'signin') return this.place?.folder ? 'folder' : 'signin';
    return ok;
  }

  /** Runs `work` once the lock is free, holding it meanwhile. */
  private afterRunning(work: () => Promise<void>): Promise<void> {
    const turn = (this.running ?? Promise.resolve()).catch(() => {}).then(() => {
      const run = work().finally(() => {
        if (this.running === run) this.running = null;
      });
      this.running = run;
      return run;
    });
    return turn;
  }

  private async runSync(opts: { rebuild?: boolean }): Promise<void> {
    if (!this.place) return;
    const place = this.place;
    this.sync = 'syncing';
    try {
      // Without permission every read of the folder fails; the copy on this device shows until it is given.
      if (place.folder && (await place.folder.access()) !== 'granted') {
        this.sync = 'folder';
        Object.assign(this, await readSummary(place.files, place.state, this.deps.now));
        return;
      }
      const result = await sync({ source: this.deps.source, files: place.files, state: place.state, now: this.deps.now }, opts);
      this.last = result;
      this.config = result.config;
      this.rows = result.rows;
      this.fixCount = result.fixCount;
      this.syncedAt = this.deps.now();
      this.sync = this.filesState('synced');
      if (this.calendars.length === 0) await this.loadCalendars();
      await this.runColours(() => colourAfterSync(result, this.colourDeps(place, 'colour')));
    } catch (e) {
      this.noteFailure(e);
      const summary = await readSummary(place.files, place.state, this.deps.now).catch(() => null);
      if (summary) Object.assign(this, summary);
      await this.readConfig().catch(() => {});
    } finally {
      await this.deps.persist?.();
    }
  }

  private async runColours(run: () => Promise<ColourOutcome>): Promise<void> {
    this.colour = 'running';
    try {
      this.colour = await run();
    } catch (e) {
      this.colour = 'stopped';
      this.noteFailure(e);
    } finally {
      this.colourLeft = 0;
      await this.deps.persist?.();
    }
  }

  /** A colour pass stops when colouring is turned off or a sync is waiting; a clear only on sign-out. */
  private colourDeps(place: Place, kind: 'colour' | 'clear'): ColourDeps {
    return {
      source: this.deps.source,
      state: place.state,
      shouldStop: () => this.stopped || (kind === 'colour' && (this.config?.colourEvents !== true || this.waiting !== null)),
      onProgress: (left: number) => {
        this.colourLeft = left;
        void this.deps.persist?.();
      },
    };
  }

  private today(): string {
    return localDate(this.deps.now(), this.last?.context.timeZone ?? 'UTC');
  }

  private async readConfig(): Promise<void> {
    if (!this.place) return;
    const today = this.today();
    this.config = parseTimeConfig(await this.place.files.read(CONFIG, defaultTimeConfigText(today)), today).config;
  }

  private async writeConfig(changes: Partial<TimeConfig>): Promise<void> {
    if (!this.place) return;
    const today = this.today();
    const base = await this.place.files.read(CONFIG, defaultTimeConfigText(today));
    const text = setTimeConfig(base, changes, today);
    await this.place.files.write(CONFIG, text, base);
    this.config = parseTimeConfig(text, today).config;
  }

  /** Runs a UI action; a failure shows instead of rejecting into the click handler. */
  private async guard(action: () => Promise<void>): Promise<void> {
    try {
      this.error = null;
      await action();
    } catch (e) {
      this.noteFailure(e);
    }
  }

  private noteFailure(e: unknown): void {
    if (e instanceof AuthRequiredError) this.sync = 'signin';
    else if (e instanceof OfflineError) this.sync = 'offline';
    else {
      this.sync = 'failed';
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  private fail(e: unknown): void {
    this.phase = 'error';
    this.error = e instanceof Error ? e.message : String(e);
  }
}
