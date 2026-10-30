import { binaryType } from './adapter.ts';
import type { BinaryStore, RemoteFile, StorageAdapter } from './adapter.ts';
import { PreconditionFailedError, StorageFullError } from './errors.ts';
import { createHttp, type Http, type Reply } from './http.ts';
import { quickXorHash } from './quick-xor-hash.ts';

/** The app's own folder in OneDrive (`Files.ReadWrite.AppFolder`). */
const APP_FOLDER = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/';
const DEFAULT_TIMEOUT_MS = 20_000;
/** Reads (metadata plus download) tried before giving up on content that does not match its hash. */
const MAX_READ_ATTEMPTS = 3;

export interface OneDriveAdapterOptions {
  /** Where the files live, below the app folder. Empty means the app folder itself. */
  folder: string;
  /** `fresh`: Graph rejected the last token, so get a new one. */
  getToken: (opts?: { fresh?: boolean }) => Promise<string>;
  fetch?: typeof fetch;
  /** Per request, body included; a request that takes longer fails with `OfflineError`. Default 20 s. */
  timeoutMs?: number;
}

interface DriveItem {
  eTag: string;
  '@microsoft.graph.downloadUrl': string;
  file?: { hashes?: { quickXorHash?: string } };
}

export class OneDriveAdapter implements StorageAdapter, BinaryStore {
  private base: string;
  private http: Http;

  constructor(opts: OneDriveAdapterOptions) {
    const parts = opts.folder.split('/').filter(Boolean);
    // `.` and `..` would climb out of the folder (or the app folder) in the Graph path.
    if (parts.some((p) => p === '.' || p === '..')) throw new Error('The OneDrive folder cannot contain . or .. segments');
    const folder = parts.map(encodeURIComponent).join('/');
    this.base = APP_FOLDER + (folder === '' ? '' : folder + '/');
    this.http = createHttp({ getToken: opts.getToken, fetch: opts.fetch, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  }

  /**
   * The eTag comes with the item's metadata and the text from a second request to its download URL. The
   * text is taken only when it matches the hash the metadata reports with that eTag: text older than its
   * eTag (a write landing between the two requests is the other way round, and harmless) would become the
   * base of the next write, and that write, passing `If-Match`, would undo the newer change. On a mismatch
   * both requests are repeated, and after 3 tries the read fails (the sync reads as offline and retries).
   */
  async read(name: string): Promise<RemoteFile | null> {
    const got = await this.download(name);
    return got && { text: got.body.text, etag: got.etag };
  }

  async readBytes(name: string): Promise<Blob | null> {
    const got = await this.download(name);
    return got && new Blob([got.body.bytes as Uint8Array<ArrayBuffer>], { type: binaryType(name) });
  }

  /** The file's content with its eTag, checked against its hash as `read` says; null when there is none. */
  private async download(name: string): Promise<{ body: Reply; etag: string } | null> {
    for (let attempt = 1; ; attempt++) {
      const meta = await this.http.authed(this.base + encodeURIComponent(name), {});
      if (meta.status === 404) return null;
      if (!meta.ok) throw new Error(`Graph read failed: ${meta.status}`);
      const item = JSON.parse(meta.text) as DriveItem;
      // The pre-authenticated download URL must not receive the bearer token.
      const body = await this.http.send(item['@microsoft.graph.downloadUrl'], {});
      if (!body.ok) throw new Error(`Download failed: ${body.status}`);
      const expected = item.file?.hashes?.quickXorHash;
      if (expected === undefined || quickXorHash(body.bytes) === expected) return { body, etag: item.eTag };
      if (attempt >= MAX_READ_ATTEMPTS) throw new Error(`OneDrive sent ${name} content that does not match its eTag`);
    }
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    return this.put(name, text, 'text/plain; charset=utf-8', ifMatch);
  }

  async createBytes(name: string, data: Blob): Promise<void> {
    await this.put(name, data, binaryType(name), null);
  }

  private async put(name: string, body: string | Blob, type: string, ifMatch: string | null): Promise<{ etag: string }> {
    const res = await this.http.authed(this.base + encodeURIComponent(name) + ':/content', {
      method: 'PUT',
      headers: { 'Content-Type': type, ...(ifMatch === null ? { 'If-None-Match': '*' } : { 'If-Match': ifMatch }) },
      body,
    });
    if (res.status === 412 || (res.status === 409 && ifMatch === null)) {
      throw new PreconditionFailedError(`Precondition failed for ${name}`);
    }
    // A full OneDrive answers 507 Insufficient Storage, or 403 with `quotaLimitReached` (#68).
    if (res.status === 507 || (res.status === 403 && graphCode(res.text) === 'quotaLimitReached')) {
      throw new StorageFullError('OneDrive is full');
    }
    if (!res.ok) throw new Error(`Graph write failed: ${res.status}`);
    const item = JSON.parse(res.text) as { eTag: string };
    return { etag: item.eTag };
  }
}

/** The `error.code` of a Graph error body, if there is one. */
function graphCode(text: string): string | undefined {
  try {
    return (JSON.parse(text) as { error?: { code?: string } }).error?.code;
  } catch {
    return undefined;
  }
}
