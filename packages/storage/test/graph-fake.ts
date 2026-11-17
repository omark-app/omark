import { quickXorHash } from '../src/quick-xor-hash.ts';

/** In-test emulation of the Graph endpoints the OneDriveAdapter calls. */
const BASE = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/';
const DL = 'https://download.example.test/';
const VERSION_DL = 'https://download.example.test/versions/';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export class GraphFake {
  /** Each file's bytes (a text is kept as UTF-8), its version, and its bytes before the last write. */
  files = new Map<string, { bytes: Uint8Array; n: number; prev?: Uint8Array }>();
  calls: Call[] = [];
  offline = false;
  /** Number of upcoming Graph (not download) requests to answer with 401. */
  unauthorized = 0;
  /** Number of upcoming downloads that serve the file's previous text, as a lagging replica would. */
  staleDownloads = 0;
  /** False to leave the hashes out of the item metadata. */
  hashes = true;
  /** Each file's versions, oldest first, the current one last. */
  versions = new Map<string, Uint8Array[]>();
  /** False to list versions without their pre-authenticated download URLs, so they are read through `/content`. */
  versionUrls = true;

  constructor(private folder: string) {}

  external(name: string, content: string | Uint8Array): void {
    const cur = this.files.get(name);
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.files.set(name, { bytes, n: (cur?.n ?? 0) + 1, prev: cur?.bytes });
    this.versions.set(name, [...(this.versions.get(name) ?? []), bytes]);
  }

  private etag(name: string): string {
    return `"{guid-${name}},${this.files.get(name)!.n}"`;
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    this.calls.push({ url, method, headers });
    if (this.offline) throw new TypeError('Failed to fetch');

    if (url.startsWith(VERSION_DL)) {
      const [name, n] = url.slice(VERSION_DL.length).split('/').map(decodeURIComponent);
      const bytes = this.versions.get(name!)?.[Number(n) - 1];
      return bytes ? new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200 }) : new Response('', { status: 404 });
    }
    if (url.startsWith(DL)) {
      const f = this.files.get(decodeURIComponent(url.slice(DL.length)));
      if (!f) return new Response('', { status: 404 });
      if (this.staleDownloads > 0 && f.prev !== undefined) {
        this.staleDownloads--;
        return new Response(f.prev as Uint8Array<ArrayBuffer>, { status: 200 });
      }
      return new Response(f.bytes as Uint8Array<ArrayBuffer>, { status: 200 });
    }
    if (this.unauthorized > 0) {
      this.unauthorized--;
      return new Response('', { status: 401 });
    }
    if (!url.startsWith(BASE)) return new Response('', { status: 400 });
    let path = decodeURIComponent(url.slice(BASE.length));
    // `…:/versions` (newest first, ids "1.0", "2.0" …) and `…:/versions/<id>/content`.
    const ver = /^(.*):\/versions(?:\/([^/]+)\/content)?$/.exec(path);
    if (ver && method === 'GET') {
      const prefix = this.folder ? `${this.folder}/` : '';
      const kept = this.versions.get(ver[1]!.slice(prefix.length));
      if (!ver[1]!.startsWith(prefix) || !kept) return new Response('{}', { status: 404 });
      if (ver[2] === undefined) {
        const name = ver[1]!.slice(prefix.length);
        const value = kept.map((b, i) => ({
          id: `${i + 1}.0`,
          size: b.length,
          lastModifiedDateTime: new Date(Date.UTC(2026, 10, 17, 0, 0, i)).toISOString(),
          ...(this.versionUrls && { '@microsoft.graph.downloadUrl': `${VERSION_DL}${encodeURIComponent(name)}/${i + 1}` }),
        }));
        return Response.json({ value: value.reverse() });
      }
      const bytes = kept[Number.parseInt(ver[2], 10) - 1];
      return bytes ? new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200 }) : new Response('{}', { status: 404 });
    }
    const isContent = path.endsWith(':/content');
    if (isContent) path = path.slice(0, -':/content'.length);
    const prefix = this.folder ? `${this.folder}/` : '';
    if (!path.startsWith(prefix)) return new Response('', { status: 400 });
    const name = path.slice(prefix.length);
    const f = this.files.get(name);

    if (!isContent && method === 'GET') {
      if (!f) return new Response('{}', { status: 404 });
      return Response.json({
        eTag: this.etag(name),
        '@microsoft.graph.downloadUrl': DL + encodeURIComponent(name),
        file: this.hashes ? { hashes: { quickXorHash: quickXorHash(f.bytes) } } : {},
      });
    }
    if (isContent && method === 'PUT') {
      const ifMatch = headers['if-match'];
      if (headers['if-none-match'] === '*' && f) return new Response('', { status: 412 });
      if (ifMatch !== undefined && (!f || this.etag(name) !== ifMatch)) {
        return new Response('', { status: 412 });
      }
      this.external(name, new Uint8Array(await new Response(init?.body ?? '').arrayBuffer()));
      return Response.json({ eTag: this.etag(name) }, { status: f ? 200 : 201 });
    }
    return new Response('', { status: 400 });
  };
}
