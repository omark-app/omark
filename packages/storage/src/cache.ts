import { clear, createStore, get, set } from 'idb-keyval';
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

export class IdbCache implements LocalCache {
  private readonly store;

  constructor(dbName = 'taskapp') {
    this.store = createStore(dbName, 'files');
  }

  async get(name: FileName): Promise<CachedFile | null> {
    return (await get<CachedFile>(name, this.store)) ?? null;
  }

  async put(name: FileName, f: CachedFile): Promise<void> {
    await set(name, f, this.store);
  }

  async clear(): Promise<void> {
    await clear(this.store);
  }
}
