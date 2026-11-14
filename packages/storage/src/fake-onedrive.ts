import { binaryType } from './adapter.ts';
import type { BinaryStore, KnownVersion, RemoteFile, StorageAdapter } from './adapter.ts';
import { OfflineError, PreconditionFailedError } from './errors.ts';

/** In-memory StorageAdapter with per-file eTags "v1", "v2", ..., and binary files (`data`) beside the texts. */
export class FakeOneDrive implements StorageAdapter, BinaryStore {
  private files = new Map<string, { text: string; version: number; data?: Blob }>();
  private offline = false;

  constructor(files: Record<string, string> = {}) {
    for (const [name, text] of Object.entries(files)) {
      this.files.set(name, { text, version: 1 });
    }
  }

  /** Simulates another device writing the file. */
  externalWrite(name: string, text: string): void {
    this.put(name, text);
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
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
    return etagOf(version);
  }

  private assertOnline(): void {
    if (this.offline) throw new OfflineError('Offline');
  }
}

function etagOf(version: number): string {
  return `"v${version}"`;
}
