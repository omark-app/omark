import { clear, createStore, get, keys, promisifyRequest as promisify, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { RemoteFile, StorageAdapter } from './adapter.ts';
import { ReopeningStore } from './cache.ts';
import { OfflineError, PreconditionFailedError } from './errors.ts';

interface StoredFile {
  text: string;
  version: number;
}

/**
 * A StorageAdapter that keeps its files in IndexedDB, with the same eTags as FakeOneDrive ("v1", "v2", ...).
 * A fake drive that survives reloads, for the demo.
 */
export class IdbDrive implements StorageAdapter {
  private readonly db: ReopeningStore;
  private offline = false;

  constructor(dbName: string, openStore: (dbName: string, storeName: string) => UseStore = createStore) {
    this.db = new ReopeningStore(dbName, openStore);
  }

  /** Simulates another device writing the file. */
  async externalWrite(name: string, text: string): Promise<void> {
    await this.put(name, text);
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
  }

  async peek(name: string): Promise<string | null> {
    return (await this.db.run((store) => get<StoredFile>(name, store)))?.text ?? null;
  }

  async isEmpty(): Promise<boolean> {
    return (await this.db.run((store) => keys(store))).length === 0;
  }

  /** Writes each file as version 1. Meant for an empty drive. */
  async seed(files: Record<string, string>): Promise<void> {
    for (const [name, text] of Object.entries(files)) {
      await this.db.run((store) => set(name, { text, version: 1 } satisfies StoredFile, store));
    }
  }

  async clear(): Promise<void> {
    await this.db.run((store) => clear(store));
  }

  async read(name: string): Promise<RemoteFile | null> {
    this.assertOnline();
    const f = await this.db.run((store) => get<StoredFile>(name, store));
    return f ? { text: f.text, etag: etagOf(f.version) } : null;
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    this.assertOnline();
    const etag = await this.put(name, text, ifMatch);
    if (etag === null) throw new PreconditionFailedError(`Precondition failed for ${name}`);
    return { etag };
  }

  /**
   * Stores the text as the next version in one transaction. With `ifMatch` given (null = must not exist),
   * stores nothing and returns null when it does not match.
   */
  private async put(name: string, text: string, ifMatch?: string | null): Promise<string | null> {
    return this.db.run((store) =>
      // One readwrite transaction: the get and the set see no other writer in between.
      store('readwrite', async (objectStore) => {
        const f = await promisify<StoredFile | undefined>(objectStore.get(name));
        if (ifMatch !== undefined && !matches(f, ifMatch)) return null;
        const version = (f?.version ?? 0) + 1;
        await promisify(objectStore.put({ text, version }, name));
        return etagOf(version);
      }),
    );
  }

  private assertOnline(): void {
    if (this.offline) throw new OfflineError('Offline');
  }
}

function etagOf(version: number): string {
  return `"v${version}"`;
}

/** Does the file satisfy an If-Match? null means the file must not exist. */
function matches(f: StoredFile | undefined, ifMatch: string | null): boolean {
  if (ifMatch === null) return f === undefined;
  return f !== undefined && etagOf(f.version) === ifMatch;
}
