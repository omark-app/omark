import type { FileName, RemoteFile, StorageAdapter } from './adapter.ts';
import type { CachedFile, LocalCache } from './cache.ts';
import { AuthRequiredError, PreconditionFailedError } from './errors.ts';

export type SyncStatus = 'saved' | 'syncing' | 'offline' | 'signin';

export interface FileSyncOptions {
  name: FileName;
  adapter: StorageAdapter;
  cache: LocalCache;
  /** Three-way merge; merge(b, l, b) = l and merge(b, b, r) = r. */
  merge: (base: string, local: string, remote: string) => string;
  /** Text of a file that exists nowhere yet. */
  initial: string;
}

const MAX_WRITE_ATTEMPTS = 3;

/**
 * Keeps one OneDrive file in sync with a cached local copy. The cache holds `{ base, baseEtag, local,
 * dirty }`: `base` is the last text known to be on OneDrive under `baseEtag`, `local` is the working text.
 * Every change to `local` reaches the cache before the next network call. All network work runs on one
 * promise chain, so writes never overlap and each write sends the latest `local`.
 */
export class FileSync {
  private readonly opts: FileSyncOptions;
  private file: CachedFile;
  /** The text the caller last saw or saved; a save is an edit of this text. */
  private shown: string;
  private current: SyncStatus = 'syncing';
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private persisting: Promise<unknown> = Promise.resolve();

  constructor(opts: FileSyncOptions) {
    this.opts = opts;
    this.file = fresh(opts.initial);
    this.shown = opts.initial;
  }

  text(): string {
    return this.file.local;
  }

  status(): SyncStatus {
    return this.current;
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Loads the cached copy (so `text()` is usable at once), then pulls. Creates the remote file if missing. */
  async open(): Promise<string> {
    const cached = await this.opts.cache.get(this.opts.name);
    this.file = cached ?? fresh(this.opts.initial);
    this.shown = this.file.local;
    const ok = await this.enqueue(() => this.pullOnce());
    if (!ok && !cached) {
      // Never synced and unreachable: keep `initial` as a pending local copy so it is created later.
      // Its base is `initial` too, so if the file turns up meanwhile, merging adds nothing to it.
      this.file = { ...this.file, dirty: true };
      await this.persist();
    }
    this.shown = this.file.local;
    return this.file.local;
  }

  /** Reads the remote; merges and writes when there are local edits. Never throws for network failures. */
  async pull(): Promise<{ text: string; changed: boolean }> {
    await this.enqueue(() => this.pullOnce());
    const changed = this.file.local !== this.shown;
    this.shown = this.file.local;
    return { text: this.file.local, changed };
  }

  /**
   * Stores `text` in the cache as dirty, then writes it. Resolves when that sync attempt is over; network
   * failures only show in `status()` (the text is safe in the cache and the next pull or save retries).
   */
  async save(text: string): Promise<void> {
    // If a pull changed `local` since the caller last saw it, `text` is an edit of the older text:
    // merge so that neither the caller's edit nor the pulled change is dropped.
    const local = this.file.local === this.shown ? text : this.opts.merge(this.shown, text, this.file.local);
    this.file = { ...this.file, local, dirty: true };
    this.shown = text;
    await this.persist();
    // Skipped when an earlier queued operation already wrote this text.
    await this.enqueue(() => this.writeLocal(), true);
  }

  /** Runs `op` after every earlier operation. Resolves true on success, false after a network failure. */
  private enqueue(op: () => Promise<void>, onlyIfDirty = false): Promise<boolean> {
    const run = this.chain.then(async () => {
      if (onlyIfDirty && !this.file.dirty) return true;
      this.setStatus('syncing');
      try {
        await op();
      } catch (e) {
        // OfflineError, exhausted 412 retries and transient Graph errors all leave the edit in the cache.
        this.setStatus(e instanceof AuthRequiredError ? 'signin' : 'offline');
        return false;
      }
      // Still dirty only if a save arrived meanwhile; its own queued operation will write it.
      if (!this.file.dirty) this.setStatus('saved');
      return true;
    });
    this.chain = run;
    return run;
  }

  private async pullOnce(): Promise<void> {
    const remote = await this.opts.adapter.read(this.opts.name);
    await this.absorb(remote);
    if (this.file.dirty) await this.writeLocal();
  }

  /**
   * Brings a freshly read remote into the state. Uses the state as it is now, so a save made while the
   * read was in flight is merged rather than overwritten.
   */
  private async absorb(remote: RemoteFile | null): Promise<void> {
    const f = this.file;
    if (remote === null) {
      // Missing: create it from `local` (whether never created or deleted elsewhere, the text is kept).
      this.file = { ...f, baseEtag: null, dirty: true };
    } else if (remote.etag === f.baseEtag) {
      return;
    } else if (!f.dirty) {
      this.file = { base: remote.text, baseEtag: remote.etag, local: remote.text, dirty: false };
    } else {
      const merged = this.opts.merge(f.base, f.local, remote.text);
      const dirty = merged !== remote.text;
      this.file = { base: remote.text, baseEtag: remote.etag, local: dirty ? merged : remote.text, dirty };
    }
    await this.persist();
  }

  /** Writes `local` under `baseEtag`; on a 412 re-reads, merges and tries again, up to 3 writes in all. */
  private async writeLocal(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      const text = this.file.local;
      try {
        const { etag } = await this.opts.adapter.write(this.opts.name, text, this.file.baseEtag);
        // A save made during the write leaves `local` ahead of what was written: still dirty.
        this.file = { ...this.file, base: text, baseEtag: etag, dirty: this.file.local !== text };
        await this.persist();
        return;
      } catch (e) {
        if (!(e instanceof PreconditionFailedError) || attempt >= MAX_WRITE_ATTEMPTS) throw e;
      }
      await this.absorb(await this.opts.adapter.read(this.opts.name));
      if (!this.file.dirty) return;
    }
  }

  /** Writes the current state to the cache. Puts run in order, each with the state as of its turn. */
  private persist(): Promise<void> {
    const put = this.persisting.then(() => this.opts.cache.put(this.opts.name, { ...this.file }));
    this.persisting = put.catch(() => {});
    return put;
  }

  private setStatus(s: SyncStatus): void {
    if (s === this.current) return;
    this.current = s;
    for (const cb of this.listeners) cb(s);
  }
}

function fresh(initial: string): CachedFile {
  return { base: initial, baseEtag: null, local: initial, dirty: false };
}
