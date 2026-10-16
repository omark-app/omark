import type { FileName, RemoteFile, StorageAdapter } from './adapter.ts';
import { AuthRequiredError, OfflineError, PreconditionFailedError } from './errors.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/root:/';
const DEFAULT_TIMEOUT_MS = 20_000;

export interface OneDriveAdapterOptions {
  folder: string;
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
  /** Per request, body included; a request that takes longer fails with `OfflineError`. Default 20 s. */
  timeoutMs?: number;
}

/** A response whose body has been read in full. */
interface Reply {
  status: number;
  ok: boolean;
  text: string;
}

export class OneDriveAdapter implements StorageAdapter {
  private base: string;
  private getToken: () => Promise<string>;
  private fetchFn: typeof fetch;
  private timeoutMs: number;

  constructor(opts: OneDriveAdapterOptions) {
    const folder = opts.folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    this.base = GRAPH + folder + '/';
    this.getToken = opts.getToken;
    this.fetchFn = opts.fetch ?? ((...args) => globalThis.fetch(...args));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async read(name: FileName): Promise<RemoteFile | null> {
    const meta = await this.graph(this.base + encodeURIComponent(name), {});
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`Graph read failed: ${meta.status}`);
    const item = JSON.parse(meta.text) as { eTag: string; '@microsoft.graph.downloadUrl': string };
    // The pre-authenticated download URL must not receive the bearer token.
    const body = await this.send(item['@microsoft.graph.downloadUrl'], {});
    if (!body.ok) throw new Error(`Download failed: ${body.status}`);
    return { text: body.text, etag: item.eTag };
  }

  async write(name: FileName, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    const res = await this.graph(this.base + encodeURIComponent(name) + ':/content', {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...(ifMatch === null ? { 'If-None-Match': '*' } : { 'If-Match': ifMatch }),
      },
      body: text,
    });
    if (res.status === 412 || (res.status === 409 && ifMatch === null)) {
      throw new PreconditionFailedError(`Precondition failed for ${name}`);
    }
    if (!res.ok) throw new Error(`Graph write failed: ${res.status}`);
    const item = JSON.parse(res.text) as { eTag: string };
    return { etag: item.eTag };
  }

  /** Authenticated Graph call: one retry with a fresh token on 401. */
  private async graph(url: string, init: RequestInit): Promise<Reply> {
    for (let attempt = 0; attempt < 2; attempt++) {
      // MSAL can stall too (a hung token refresh), so the token gets the same time limit as a request.
      const token = await this.withTimeout(() => this.getToken());
      const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
      const res = await this.send(url, { ...init, headers });
      if (res.status !== 401) return res;
    }
    throw new AuthRequiredError('Sign-in required');
  }

  /** One request, body read in full, within the time limit. A fetch TypeError means the network is down. */
  private async send(url: string, init: RequestInit): Promise<Reply> {
    try {
      return await this.withTimeout(async (signal) => {
        const res = await this.fetchFn(url, { ...init, signal });
        return { status: res.status, ok: res.ok, text: await res.text() };
      });
    } catch (e) {
      if (e instanceof TypeError) throw new OfflineError('Network unreachable');
      throw e;
    }
  }

  /**
   * Runs `work` within `timeoutMs`. On timeout its signal is aborted and the call fails with
   * `OfflineError`, even if `work` ignores the abort.
   */
  private async withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new OfflineError('Request timed out'));
      }, this.timeoutMs);
    });
    const run = Promise.resolve().then(() => work(controller.signal)); // a synchronous throw rejects too
    run.catch(() => {}); // a late failure after the timeout must not go unhandled
    try {
      return await Promise.race([run, timedOut]);
    } catch (e) {
      if (!(e instanceof OfflineError) && controller.signal.aborted) throw new OfflineError('Request timed out');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
