/** In-test emulation of the Graph endpoints the OneDriveAdapter calls. */
const BASE = 'https://graph.microsoft.com/v1.0/me/drive/root:/';
const DL = 'https://download.example.test/';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export class GraphFake {
  files = new Map<string, { text: string; n: number }>();
  calls: Call[] = [];
  offline = false;
  /** Number of upcoming Graph (not download) requests to answer with 401. */
  unauthorized = 0;

  constructor(private folder: string) {}

  external(name: string, text: string): void {
    const cur = this.files.get(name);
    this.files.set(name, { text, n: (cur?.n ?? 0) + 1 });
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

    if (url.startsWith(DL)) {
      const f = this.files.get(decodeURIComponent(url.slice(DL.length)));
      return f ? new Response(f.text, { status: 200 }) : new Response('', { status: 404 });
    }
    if (this.unauthorized > 0) {
      this.unauthorized--;
      return new Response('', { status: 401 });
    }
    if (!url.startsWith(BASE)) return new Response('', { status: 400 });
    let path = decodeURIComponent(url.slice(BASE.length));
    const isContent = path.endsWith(':/content');
    if (isContent) path = path.slice(0, -':/content'.length);
    const prefix = `${this.folder}/`;
    if (!path.startsWith(prefix)) return new Response('', { status: 400 });
    const name = path.slice(prefix.length);
    const f = this.files.get(name);

    if (!isContent && method === 'GET') {
      if (!f) return new Response('{}', { status: 404 });
      return Response.json({
        eTag: this.etag(name),
        '@microsoft.graph.downloadUrl': DL + encodeURIComponent(name),
      });
    }
    if (isContent && method === 'PUT') {
      const ifMatch = headers['if-match'];
      if (headers['if-none-match'] === '*' && f) return new Response('', { status: 412 });
      if (ifMatch !== undefined && (!f || this.etag(name) !== ifMatch)) {
        return new Response('', { status: 412 });
      }
      this.external(name, String(init?.body ?? ''));
      return Response.json({ eTag: this.etag(name) }, { status: f ? 200 : 201 });
    }
    return new Response('', { status: 400 });
  };
}
