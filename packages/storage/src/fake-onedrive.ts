import { binaryType, LANDED_LOOKBACK } from './adapter.ts';
import type { BinaryStore, KnownVersion, RemoteFile, StorageAdapter } from './adapter.ts';
import { OfflineError, PreconditionFailedError } from './errors.ts';

/** In-memory StorageAdapter with per-file eTags "v1", "v2", ..., and binary files (`data`) beside the texts. */
export class FakeOneDrive implements StorageAdapter, BinaryStore {
  private files = new Map<string, { text: string; version: number; data?: Blob }>();
  /** Each file's texts, oldest first, the current one last: its version history. */
  private history = new Map<string, string[]>();
  private offline = false;
  /** What an offline call says could not be reached: `signin` stands for the sign-in server (#157). */
  private unreachable: 'storage' | 'signin' = 'storage';

  constructor(files: Record<string, string> = {}) {
    for (const [name, text] of Object.entries(files)) {
      this.files.set(name, { text, version: 1 });
      this.history.set(name, [text]);
    }
  }

  /** Simulates another device writing the file. */
  externalWrite(name: string, text: string): void {
    this.put(name, text);
  }

  /** `unreachable: 'signin'` fails every call as if the sign-in server, not the storage, could not be reached. */
  setOffline(offline: boolean, unreachable: 'storage' | 'signin' = 'storage'): void {
    this.offline = offline;
    this.unreachable = unreachable;
  }

  peek(name: string): string | null {
    return this.files.get(name)?.text ?? null;
  }

  /** The names of the files there, sorted. */
  names(): string[] {
    return [...this.files.keys()].sort();
  }

  async read(name: string): Promise<RemoteFile | null> {
    this.assertOnline();
    const f = this.files.get(name);
    return f ? { text: f.text, etag: etagOf(f.version) } : null;
  }

  /** As OneDrive's: `'unchanged'` while the file still has `known`'s eTag. */
  async readIfChanged(name: string, known: KnownVersion): Promise<RemoteFile | null | 'unchanged'> {
    const f = await this.read(name);
    return f !== null && f.etag === known.etag ? 'unchanged' : f;
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    this.assertOnline();
    const f = this.files.get(name);
    if (ifMatch === null ? f !== undefined : f === undefined || etagOf(f.version) !== ifMatch) {
      throw new PreconditionFailedError(`Precondition failed for ${name}`);
    }
    return { etag: this.put(name, text) };
  }

  /** As OneDrive's: the newest of `texts` among the file's last `LANDED_LOOKBACK` versions, back to `base`. */
  async landed(name: string, texts: string[], base: string): Promise<string | null> {
    this.assertOnline();
    for (const t of (this.history.get(name) ?? []).slice(-LANDED_LOOKBACK).reverse()) {
      if (texts.includes(t)) return t;
      if (t === base) return null;
    }
    return null;
  }

  async readBytes(name: string): Promise<Blob | null> {
    this.assertOnline();
    const f = this.files.get(name);
    return f ? (f.data ?? new Blob([f.text], { type: binaryType(name) })) : null;
  }

  async createBytes(name: string, data: Blob): Promise<void> {
    this.assertOnline();
    if (this.files.has(name)) throw new PreconditionFailedError(`${name} already exists`);
    this.files.set(name, { text: '', version: 1, data });
  }

  private put(name: string, text: string): string {
    const version = (this.files.get(name)?.version ?? 0) + 1;
    this.files.set(name, { text, version });
    this.history.set(name, [...(this.history.get(name) ?? []), text]);
    return etagOf(version);
  }

  private assertOnline(): void {
    if (this.offline) throw new OfflineError('Offline', this.unreachable);
  }
}

function etagOf(version: number): string {
  return `"v${version}"`;
}
