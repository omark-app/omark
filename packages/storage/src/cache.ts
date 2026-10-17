import { clear, createStore, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { FileName } from './adapter.ts';

/** Local copy of one remote file: last-synced base, its etag, and the working text. */
export interface CachedFile {
  base: string;
  baseEtag: string | null;
  local: string;
  dirty: boolean;
}

export interface LocalCache {
  get(name: FileName): Promise<CachedFile | null>;
  put(name: FileName, f: CachedFile): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCache implements LocalCache {
  private readonly files = new Map<FileName, CachedFile>();

  async get(name: FileName): Promise<CachedFile | null> {
    const f = this.files.get(name);
    return f ? { ...f } : null;
  }

  async put(name: FileName, f: CachedFile): Promise<void> {
    this.files.set(name, { ...f });
  }

  async clear(): Promise<void> {
    this.files.clear();
  }
}

/**
 * The cache in IndexedDB. If an operation fails, the store is opened afresh and the operation tried once
 * more: iOS can drop the database connection after a long time in the background ("Connection to Indexed
 * Database server lost"), and idb-keyval keeps using a dead connection unless the browser reports it closed.
 */
export class IdbCache implements LocalCache {
  private readonly dbName: string;
  private readonly openStore: (dbName: string, storeName: string) => UseStore;
  private store: UseStore;

  constructor(dbName = 'taskapp', openStore: (dbName: string, storeName: string) => UseStore = createStore) {
    this.dbName = dbName;
    this.openStore = openStore;
    this.store = openStore(dbName, 'files');
  }

  async get(name: FileName): Promise<CachedFile | null> {
    return (await this.retry((store) => get<CachedFile>(name, store))) ?? null;
  }

  async put(name: FileName, f: CachedFile): Promise<void> {
    await this.retry((store) => set(name, f, store));
  }

  async clear(): Promise<void> {
    await this.retry((store) => clear(store));
  }

  private async retry<T>(op: (store: UseStore) => Promise<T>): Promise<T> {
    const store = this.store;
    try {
      return await op(store);
    } catch {
      // Reopen once (unless a concurrent call already did) and try again; a second failure is real.
      if (this.store === store) this.store = this.openStore(this.dbName, 'files');
      return op(this.store);
    }
  }
}
