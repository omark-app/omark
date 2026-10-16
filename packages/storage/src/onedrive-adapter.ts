import type { FileName, RemoteFile, StorageAdapter } from './adapter.ts';
import { AuthRequiredError, OfflineError, PreconditionFailedError } from './errors.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/root:/';

export interface OneDriveAdapterOptions {
  folder: string;
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
}

export class OneDriveAdapter implements StorageAdapter {
  private base: string;
  private getToken: () => Promise<string>;
  private fetchFn: typeof fetch;

  constructor(opts: OneDriveAdapterOptions) {
    const folder = opts.folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    this.base = GRAPH + folder + '/';
    this.getToken = opts.getToken;
    this.fetchFn = opts.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  async read(name: FileName): Promise<RemoteFile | null> {
    const meta = await this.graph(this.base + encodeURIComponent(name), {});
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`Graph read failed: ${meta.status}`);
    const item = (await meta.json()) as { eTag: string; '@microsoft.graph.downloadUrl': string };
    // The pre-authenticated download URL must not receive the bearer token.
    const body = await this.send(item['@microsoft.graph.downloadUrl'], {});
    if (!body.ok) throw new Error(`Download failed: ${body.status}`);
    return { text: await body.text(), etag: item.eTag };
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
    const item = (await res.json()) as { eTag: string };
    return { etag: item.eTag };
  }

  /** Authenticated Graph call: one retry with a fresh token on 401. */
  private async graph(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken();
      const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
      const res = await this.send(url, { ...init, headers });
      if (res.status !== 401) return res;
    }
    throw new AuthRequiredError('Sign-in required');
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch (e) {
      if (e instanceof TypeError) throw new OfflineError('Network unreachable');
      throw e;
    }
  }
}
