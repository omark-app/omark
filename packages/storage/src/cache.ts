import { clear, createStore, del, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';

/** Local copy of one remote file: last-synced base, its etag, and the working text. */
export interface CachedFile {
  base: string;
  baseEtag: string | null;
  /** The remote file `base` came from (`RemoteFile.source`); missing in older caches and for storages without one. */
  baseSource?: string | null;
  local: string;
  dirty: boolean;
}

export interface LocalCache {
  get(name: string): Promise<CachedFile | null>;
  put(name: string, f: CachedFile): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCache implements LocalCache {
  private readonly files = new Map<string, CachedFile>();

  async get(name: string): Promise<CachedFile | null> {
    const f = this.files.get(name);
    return f ? { ...f } : null;
  }

  async put(name: string, f: CachedFile): Promise<void> {
    this.files.set(name, { ...f });
  }

  async clear(): Promise<void> {
    this.files.clear();
  }
}

/**
 * An idb-keyval store that reopens itself. If an operation fails, the store is opened afresh and the
 * operation tried once more: iOS can drop the database connection after a long time in the background
 * ("Connection to Indexed Database server lost"), and idb-keyval keeps using a dead connection unless the
 * browser reports it closed.
 */
export class ReopeningStore {
  private readonly dbName: string;
  private readonly openStore: (dbName: string, storeName: string) => UseStore;
  private store: UseStore;

  constructor(dbName: string, openStore: (dbName: string, storeName: string) => UseStore = createStore) {
    this.dbName = dbName;
    this.openStore = openStore;
    this.store = openStore(dbName, 'files');
  }

  async run<T>(op: (store: UseStore) => Promise<T>): Promise<T> {
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

/** The cache in IndexedDB. */
export class IdbCache implements LocalCache {
  private readonly store: ReopeningStore;

  constructor(dbName: string, openStore: (dbName: string, storeName: string) => UseStore = createStore) {
    this.store = new ReopeningStore(dbName, openStore);
  }

  async get(name: string): Promise<CachedFile | null> {
    return (await this.store.run((store) => get<CachedFile>(name, store))) ?? null;
  }

  async put(name: string, f: CachedFile): Promise<void> {
    await this.store.run((store) => set(name, f, store));
  }

  async clear(): Promise<void> {
    await this.store.run((store) => clear(store));
  }
}

/** Binary files kept on this device by name (Goals' pictures), so they show offline. */
export interface BlobKeep {
  get(name: string): Promise<Blob | null>;
  put(name: string, data: Blob): Promise<void>;
  delete(name: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryBlobs implements BlobKeep {
  private readonly blobs = new Map<string, Blob>();

  async get(name: string): Promise<Blob | null> {
    return this.blobs.get(name) ?? null;
  }

  async put(name: string, data: Blob): Promise<void> {
    this.blobs.set(name, data);
  }

  async delete(name: string): Promise<void> {
    this.blobs.delete(name);
  }

  async clear(): Promise<void> {
    this.blobs.clear();
  }
}

/** Kept in IndexedDB as bytes and a type, which every browser stores (some once failed with Blobs). */
export class IdbBlobs implements BlobKeep {
  private readonly store: ReopeningStore;

  constructor(dbName: string, openStore: (dbName: string, storeName: string) => UseStore = createStore) {
    this.store = new ReopeningStore(dbName, openStore);
  }

  async get(name: string): Promise<Blob | null> {
    const kept = await this.store.run((store) => get<{ type: string; bytes: ArrayBuffer }>(name, store));
    return kept ? new Blob([kept.bytes], { type: kept.type }) : null;
  }

  async put(name: string, data: Blob): Promise<void> {
    const kept = { type: data.type, bytes: await data.arrayBuffer() };
    await this.store.run((store) => set(name, kept, store));
  }

  async delete(name: string): Promise<void> {
    await this.store.run((store) => del(name, store));
  }

  async clear(): Promise<void> {
    await this.store.run((store) => clear(store));
  }
}
