import { FileSync } from '@omark/storage';
import type { LocalCache, StorageAdapter, SyncStatus } from '@omark/storage';
import { mergeEventsFile, mergeProjects, mergeTimeConfig, PROJECT_COLUMNS } from '@omark/time-core';

export const PROJECTS = 'projects.csv';
export const CONFIG = 'config.yaml';
export const PROJECTS_HEADER = `${PROJECT_COLUMNS.join(',')}\n`;

/** The three kinds of file in the folder (spec 7), as text. */
export interface TextFiles {
  /** The latest text: the folder's, pulled in when it can be reached, else this device's copy; `initial` when it is nowhere yet. */
  read(name: string, initial: string): Promise<string>;
  /** Writes `text`, an edit of `base` (what `read` gave); merged onto whatever arrived since. */
  write(name: string, text: string, base: string): Promise<void>;
}

/** In memory, for tests: `texts` is the folder, `writes` every write in order. */
export class MemoryFiles implements TextFiles {
  readonly texts = new Map<string, string>();
  readonly writes: string[] = [];

  async read(name: string, initial: string): Promise<string> {
    if (!this.texts.has(name)) this.texts.set(name, initial);
    return this.texts.get(name)!;
  }

  async write(name: string, text: string): Promise<void> {
    this.writes.push(name);
    this.texts.set(name, text);
  }
}

/**
 * The folder through `FileSync`: one per file, each with this device's copy in the cache, so the app opens
 * offline, and with a conditional write that merges and retries when another device wrote first.
 */
export class FolderFiles implements TextFiles {
  private readonly syncs = new Map<string, FileSync>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly cache: LocalCache,
    private readonly today: () => string,
  ) {}

  async read(name: string, initial: string): Promise<string> {
    return (await this.file(name, initial).pull()).text;
  }

  async write(name: string, text: string, base: string): Promise<void> {
    await this.file(name, base).stage(text, base);
  }

  /** `offline` or `signin` when any file is, else `saved`, or `syncing` while one is. */
  status(): SyncStatus {
    const all = [...this.syncs.values()].map((s) => s.status());
    for (const s of ['signin', 'offline', 'syncing'] as const) if (all.includes(s)) return s;
    return 'saved';
  }

  /** A change this device made that has not reached the folder yet (a failed read is not one). */
  async hasUnsynced(): Promise<boolean> {
    for (const name of this.syncs.keys()) if ((await this.cache.get(name))?.dirty) return true;
    return false;
  }

  onStatus(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private file(name: string, initial: string): FileSync {
    let sync = this.syncs.get(name);
    if (!sync) {
      sync = new FileSync({ name, adapter: this.adapter, cache: this.cache, merge: mergeFor(name, this.today), initial });
      sync.onStatus(() => this.listeners.forEach((cb) => cb()));
      this.syncs.set(name, sync);
    }
    return sync;
  }
}

/**
 * The one Omark app's folder for Time (one app spec, section 4): `projects.csv` at the top of the Omark folder,
 * shared with Goals, and every other file in Time's own `time/`.
 */
export function routed(top: StorageAdapter, own: StorageAdapter): StorageAdapter {
  const of = (name: string) => (name === PROJECTS ? top : own);
  const exists = top.exists && own.exists
    ? async (source: string) => (await own.exists!(source)) || (await top.exists!(source))
    : undefined;
  return {
    read: (name) => of(name).read(name),
    write: (name, text, ifMatch) => of(name).write(name, text, ifMatch),
    ...(exists && { exists }),
  };
}

function mergeFor(name: string, today: () => string): (base: string, local: string, remote: string) => string {
  if (name === PROJECTS) return mergeProjects;
  if (name === CONFIG) return (b, l, r) => mergeTimeConfig(b, l, r, today());
  return mergeEventsFile;
}
