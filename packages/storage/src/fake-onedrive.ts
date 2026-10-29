import type { RemoteFile, StorageAdapter } from './adapter.ts';
import { OfflineError, PreconditionFailedError } from './errors.ts';

/** In-memory StorageAdapter with per-file eTags "v1", "v2", ... */
export class FakeOneDrive implements StorageAdapter {
  private files = new Map<string, { text: string; version: number }>();
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

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    this.assertOnline();
    const f = this.files.get(name);
    if (ifMatch === null ? f !== undefined : f === undefined || etagOf(f.version) !== ifMatch) {
      throw new PreconditionFailedError(`Precondition failed for ${name}`);
    }
    return { etag: this.put(name, text) };
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
