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
 * Every change to `local` is put in the cache before the network write that sends it. If that cache write
 * fails (e.g. iOS dropped the IndexedDB connection), the edit is still uploaded at once, since OneDrive is
 * then the only copy that outlives the page, and the cache is brought up to date by the next operation
 * that can write it. All network work runs on one promise chain, so writes never overlap and each write
 * sends the latest `local`.
 *
 * Callers start from the text `cached()` or `open()` gives them and record each edit with `stage()`
 * (or `save()`), passing the text the edit started from, so an edit made on an older text is merged onto
 * whatever arrived since. `pull()` brings remote changes in; `text()` is the working text at any moment.
 */
export class FileSync {
  private readonly opts: FileSyncOptions;
  private file: CachedFile;
  /** Bumped on every change to `file`; `persistedVersion` is the latest version the cache holds. */
  private version = 0;
  private persistedVersion = 0;
  private loading: Promise<boolean> | null = null;
  /** Remote content altered `local` since `open` or `pull` last returned. */
  private remoteChanged = false;
  private current: SyncStatus = 'syncing';
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private persisting: Promise<unknown> = Promise.resolve();

  constructor(opts: FileSyncOptions) {
    this.opts = opts;
    this.file = fresh(opts.initial);
  }

  /** The working text (the cached copy once loaded). */
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

  /** Loads the cache without touching the network: the cached working text, or null when there is none. */
  async cached(): Promise<string | null> {
    return (await this.load()) ? this.file.local : null;
  }

  /**
   * Loads the cached copy, then pulls; creates the remote file if missing. Resolves with the text the
   * caller should adopt (the cached text, with status `offline`, when OneDrive is unreachable).
   */
  async open(): Promise<string> {
    const hadCache = await this.load();
    const ok = await this.enqueue(() => this.pullOnce());
    if (!ok && !hadCache && !this.file.dirty) {
      // Never synced and unreachable: keep `initial` as a pending local copy so it is created later.
      // Its base is `initial` too, so if the file turns up meanwhile, merging adds nothing to it.
      this.set({ ...this.file, dirty: true });
      await this.persist().catch(() => this.setStatus('offline'));
    }
    this.remoteChanged = false; // the caller adopts this text
    return this.file.local;
  }

  /**
   * Reads the remote; merges and writes when there are local edits. Resolves with the text the caller
   * should adopt; `changed` is true when remote content altered `local` since `open` or `pull` last
   * returned (including content merged in by an earlier save's 412 retry). Network failures only show
   * in `status()`.
   */
  async pull(): Promise<{ text: string; changed: boolean }> {
    await this.load();
    await this.enqueue(() => this.pullOnce());
    const changed = this.remoteChanged;
    this.remoteChanged = false;
    return { text: this.file.local, changed };
  }

  /**
   * Records an edit: `text` is the caller's new text and `base` the text the edit started from (what
   * `open`, `pull` or the previous `save` gave it). If `local` moved on since `base`, the edit is merged
   * onto it. The result is stored in the cache as dirty before any network call, then written. Resolves
   * when that sync attempt is over; network failures only show in `status()` (the text is safe in the
   * cache and the next pull or save retries). Rejects, with status `offline`, if the cache write fails;
   * the upload then still goes ahead. Used by tests; the app stages (`stage`).
   */
  async save(text: string, base: string): Promise<void> {
    const { synced } = await this.record(text, base);
    await synced;
  }

  /**
   * Like `save`, but resolves as soon as the edit is in the cache; the network write is queued and not
   * waited for (a slow or hung upload never delays caching the next edit). Rejects, with status
   * `offline`, if the cache write fails; the upload then still goes ahead.
   */
  async stage(text: string, base: string): Promise<void> {
    await this.record(text, base);
  }

  /**
   * Applies an edit (merged onto `local` if it moved on since `base`), stores it in the cache as dirty,
   * then queues the write. `synced` resolves when that sync attempt is over and never rejects; it is
   * wrapped so awaiting `record` does not wait for it. If the cache write fails the write is queued anyway
   * and `record` rejects.
   */
  private async record(text: string, base: string): Promise<{ synced: Promise<boolean> }> {
    await this.load();
    const cur = this.file.local;
    const local = base === cur ? text : this.opts.merge(base, text, cur);
    this.set({ ...this.file, local, dirty: true });
    try {
      await this.persist();
    } catch (e) {
      // The cache is broken (e.g. iOS dropped the IndexedDB connection): OneDrive is now the only copy
      // that survives the page, so upload at once rather than waiting for the next pull.
      this.setStatus('offline');
      void this.enqueue(() => this.writeLocal(), true);
      throw e;
    }
    // Skipped when an earlier queued operation already wrote this text.
    return { synced: this.enqueue(() => this.writeLocal(), true) };
  }

  /**
   * Loads the cache once; every public method waits for it before touching state. True if it had a copy.
   * A failed load is not taken as "no cache" (that could overwrite unsynced edits): the call rejects, the
   * status goes `offline`, and the next call tries again.
   */
  private load(): Promise<boolean> {
    this.loading ??= this.opts.cache.get(this.opts.name).then(
      (cached) => {
        if (cached) {
          this.file = cached;
          this.persistedVersion = this.version;
        }
        return cached !== null;
      },
      (e: unknown) => {
        this.loading = null;
        this.setStatus('offline');
        throw e;
      },
    );
    return this.loading;
  }

  /** Runs `op` after every earlier operation. Resolves true on success, false after a failure; never rejects. */
  private enqueue(op: () => Promise<void>, onlyIfDirty = false): Promise<boolean> {
    const run = this.chain.then(async () => {
      if (onlyIfDirty && !this.file.dirty) return true;
      this.setStatus('syncing');
      try {
        await op();
        // A cache write failed earlier: memory is ahead of the cache, so store it now.
        if (this.persistedVersion !== this.version) await this.persist();
      } catch (e) {
        // OfflineError, exhausted 412 retries, transient Graph errors and cache failures all leave the
        // edit in memory (and in the cache when it works); the next pull or save retries.
        this.setStatus(e instanceof AuthRequiredError ? 'signin' : 'offline');
        return false;
      }
      // Still dirty only if a save arrived meanwhile; its own queued operation will write it.
      if (!this.file.dirty) this.setStatus('saved');
      return true;
    });
    this.chain = run.catch(() => {});
    return run.catch(() => false);
  }

  /** Reads the remote, absorbs it, and writes if dirty. */
  private async pullOnce(): Promise<void> {
    await this.absorb(await this.opts.adapter.read(this.opts.name));
    if (this.file.dirty) await this.writeLocal();
  }

  /**
   * Brings a freshly read remote into the state. Uses the state as it is now, so a save made while the
   * read was in flight is merged rather than overwritten. Sets `remoteChanged` when `local` changes.
   */
  private async absorb(remote: RemoteFile | null): Promise<void> {
    const f = this.file;
    if (remote === null) {
      // Missing: create it from `local` (whether never created or deleted elsewhere, the text is kept).
      this.set({ ...f, baseEtag: null, dirty: true });
    } else if (remote.etag === f.baseEtag) {
      return;
    } else if (!f.dirty) {
      this.set({ base: remote.text, baseEtag: remote.etag, local: remote.text, dirty: false });
    } else {
      const merged = this.opts.merge(f.base, f.local, remote.text);
      // A merge that adds nothing to the remote (up to line endings) leaves the file as it is.
      const same = normalize(merged) === normalize(remote.text);
      this.set({ base: remote.text, baseEtag: remote.etag, local: same ? remote.text : merged, dirty: !same });
    }
    if (this.file.local !== f.local) this.remoteChanged = true;
    await this.persist();
  }

  /** Writes `local` under `baseEtag`; on a 412 re-reads, merges and tries again, up to 3 writes in all. */
  private async writeLocal(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      await this.cacheSettled();
      const text = this.file.local;
      try {
        const { etag } = await this.opts.adapter.write(this.opts.name, text, this.file.baseEtag);
        // A save made during the write leaves `local` ahead of what was written: still dirty.
        this.set({ ...this.file, base: text, baseEtag: etag, dirty: this.file.local !== text });
        await this.persist();
        return;
      } catch (e) {
        if (!(e instanceof PreconditionFailedError) || attempt >= MAX_WRITE_ATTEMPTS) throw e;
      }
      await this.absorb(await this.opts.adapter.read(this.opts.name));
      if (!this.file.dirty) return;
    }
  }

  private set(f: CachedFile): void {
    this.file = f;
    this.version++;
  }

  /** Writes the current state to the cache. Puts run in order, each with the state as of its turn. */
  private persist(): Promise<void> {
    const put = this.persisting.then(async () => {
      const version = this.version;
      await this.opts.cache.put(this.opts.name, { ...this.file });
      this.persistedVersion = Math.max(this.persistedVersion, version);
    });
    this.persisting = put.catch(() => {});
    return put;
  }

  /**
   * Waits until every cache write issued so far has finished. Every change to `file` issues one in the
   * same synchronous step, so afterwards the cache has been given the current `file` (a failed put does
   * not block the network write: the text then lives in memory and goes to OneDrive).
   */
  private async cacheSettled(): Promise<void> {
    let p: Promise<unknown>;
    do {
      p = this.persisting;
      await p;
    } while (p !== this.persisting);
  }

  private setStatus(s: SyncStatus): void {
    if (s === this.current) return;
    this.current = s;
    for (const cb of this.listeners) {
      try {
        cb(s);
      } catch (e) {
        console.error('FileSync status listener failed', e);
      }
    }
  }
}

function fresh(initial: string): CachedFile {
  return { base: initial, baseEtag: null, local: initial, dirty: false };
}

/** Text as merging sees it: no BOM, LF line endings, a final newline unless empty. */
function normalize(text: string): string {
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return t === '' || t.endsWith('\n') ? t : `${t}\n`;
}
