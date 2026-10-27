import { AuthRequiredError, OfflineError } from '@omark/storage';
import type { CalendarInfo } from '@omark/calendar';
import { defaultTimeConfigText, localDate, parseTimeConfig, setTimeConfig } from '@omark/time-core';
import type { TimeConfig } from '@omark/time-core';
import type { AppDeps, Place } from './boot.ts';
import { colourAfterSync, planClear, runQueue } from './colouring.ts';
import type { ColourOutcome } from './colouring.ts';
import { CONFIG } from './files.ts';
import { FRESH_PREFS } from './prefs.ts';
import type { StorageKind } from './prefs.ts';
import { readSummary, sync } from './sync.ts';
import type { SyncResult } from './sync.ts';

export type Phase = 'loading' | 'signin' | 'storage' | 'calendars' | 'ready' | 'error';
/** `offline`: Google or the storage can't be reached; `signin`: the sign-in has lapsed. */
export type SyncState = 'syncing' | 'synced' | 'offline' | 'signin' | 'failed';
/** `running`: patches are going out; `left` says how many. */
export type ColourState = ColourOutcome | 'running';

/** The app's state for the UI, and what the UI can do. One sync runs at a time. */
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
  config = $state<TimeConfig | null>(null);
  storage = $state<StorageKind | null>(null);

  private place: Place | null = null;
  private running: Promise<void> | null = null;
  private last: SyncResult | null = null;
  private stopped = false;

  constructor(private readonly deps: AppDeps) {}

  async start(): Promise<void> {
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
    if (!prefs.storage) {
      this.phase = 'storage';
      return;
    }
    this.open(prefs.storage);
    if (!prefs.started) {
      await this.loadCalendars();
      this.phase = 'calendars';
      return;
    }
    this.phase = 'ready';
    await this.syncNow();
  }

  signIn(): Promise<void> {
    return this.deps.auth.signIn().then(() => this.start());
  }

  /** First run, step 1. Google Drive needs Drive access added to the sign-in first. */
  async chooseStorage(kind: StorageKind): Promise<void> {
    const prefs = await this.deps.prefs.load();
    await this.deps.prefs.save({ ...prefs, storage: kind, askedDrive: true });
    if (!prefs.askedDrive) await this.deps.auth.addAccess('drive');
    await this.start();
  }

  /** First run, step 2: the calendars to read go into config.yaml, then the first sync. */
  async chooseCalendars(ids: string[]): Promise<void> {
    await this.writeConfig({ calendars: ids });
    const prefs = await this.deps.prefs.load();
    await this.deps.prefs.save({ ...prefs, started: true });
    this.phase = 'ready';
    await this.syncNow();
  }

  syncNow(opts: { rebuild?: boolean } = {}): Promise<void> {
    if (this.running) return this.running.then(() => (opts.rebuild ? this.syncNow(opts) : undefined));
    this.running = this.runSync(opts).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  rebuild(): Promise<void> {
    return this.syncNow({ rebuild: true });
  }

  async setCalendars(ids: string[]): Promise<void> {
    await this.writeConfig({ calendars: ids });
    await this.syncNow();
  }

  /** Turning colouring on asks Google for edit access the first time on this device (spec 8). */
  async setColouring(on: boolean): Promise<void> {
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
    if (this.last && this.place) {
      const count = await planClear(this.last, { source: this.deps.source, state: this.place.state });
      this.clearOffer = count > 0 ? count : null;
    }
  }

  /** The answer to the clear offer: take the tracker's colours off, or leave them. */
  async answerClear(clear: boolean): Promise<void> {
    this.clearOffer = null;
    if (!this.place) return;
    if (!clear) {
      await this.place.state.save({ ...(await this.place.state.load()), clearQueue: [] });
      return;
    }
    await this.runColours(() => runQueue('clearQueue', this.colourDeps()));
  }

  async giveEditAccess(): Promise<void> {
    const prefs = await this.deps.prefs.load();
    await this.deps.prefs.save({ ...prefs, askedEdit: true });
    await this.deps.auth.addAccess('edit');
    await this.syncNow();
  }

  /**
   * Signs out, then forgets everything this device kept for the account: the copy of the files, the sync
   * state and the choices, so the next account on this device starts clean.
   */
  async signOut(): Promise<void> {
    this.stopped = true;
    await this.running?.catch(() => {});
    try {
      await this.deps.auth.signOut();
    } catch (e) {
      this.noteFailure(e);
      return;
    }
    await this.deps.forget();
    await this.deps.prefs.save({ ...FRESH_PREFS });
    this.place = null;
    this.storage = null;
    this.last = null;
    this.config = null;
    this.calendars = [];
    this.rows = 0;
    this.fixCount = 0;
    this.syncedAt = null;
    this.colour = 'off';
    this.clearOffer = null;
    this.phase = 'signin';
  }

  async loadCalendars(): Promise<void> {
    try {
      this.calendars = await this.deps.source.listCalendars();
    } catch (e) {
      this.noteFailure(e);
    }
  }

  private open(kind: StorageKind): void {
    if (this.storage === kind && this.place) return;
    this.storage = kind;
    this.place = this.deps.openPlace(kind);
    this.place.files.onStatus(() => {
      if (this.sync === 'synced' && this.place?.files.status() === 'offline') this.sync = 'offline';
    });
  }

  private async runSync(opts: { rebuild?: boolean }): Promise<void> {
    if (!this.place) return;
    this.sync = 'syncing';
    this.stopped = false;
    try {
      const result = await sync({ source: this.deps.source, files: this.place.files, state: this.place.state, now: this.deps.now }, opts);
      this.last = result;
      this.config = result.config;
      this.rows = result.rows;
      this.fixCount = result.fixCount;
      this.syncedAt = this.deps.now();
      this.sync = this.place.files.status() === 'offline' ? 'offline' : 'synced';
      if (this.calendars.length === 0) await this.loadCalendars();
      await this.runColours(() => colourAfterSync(result, this.colourDeps()));
    } catch (e) {
      this.noteFailure(e);
      const summary = await readSummary(this.place.files, this.place.state, this.deps.now).catch(() => null);
      if (summary) Object.assign(this, summary);
      await this.readConfig();
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

  private colourDeps() {
    return {
      source: this.deps.source,
      state: this.place!.state,
      shouldStop: () => this.stopped,
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
