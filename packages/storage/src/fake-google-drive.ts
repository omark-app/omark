/**
 * In-memory emulation of the Drive endpoints the GoogleDriveAdapter calls, as measured against the live API.
 * It answers exactly those requests and throws on any other, so a changed query fails the tests.
 */
const API = 'https://www.googleapis.com';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const NAME = String.raw`'((?:[^'\\]|\\.)*)'`;
/** A folder by name: at the top of My Drive (no parent named), or in a parent folder. */
const FOLDER_QUERY = new RegExp(
  `^name=${NAME} and mimeType='${FOLDER_MIME.replaceAll('.', '\\.')}'(?: and '([^'\\\\]+)' in parents)? and trashed=false$`,
);
const FILE_QUERY = new RegExp(`^name=${NAME} and '([^'\\\\]+)' in parents and trashed=false$`);

export interface DriveCall {
  method: string;
  url: string;
  headers: Record<string, string>;
}

interface Item {
  id: string;
  name: string;
  /** The folder it is in; null for a folder at the top of My Drive. */
  parent: string | null;
  isFolder: boolean;
  created: number;
  trashed: boolean;
  etag: string;
  /** Every etag the item has had: a stale one gets 412, one never issued gets 500. */
  etags: Set<string>;
  headRevisionId: string;
  /** Each revision's bytes (a text as UTF-8). */
  revisions: Map<string, Uint8Array>;
  /** Made while lists lag: only calls with this Authorization header list it, until `settleLists`. */
  unlistedFor?: string;
}

interface Hold {
  match: (call: DriveCall) => boolean;
  reached: () => void;
  gate: Promise<void>;
}

export class FakeGoogleDrive {
  calls: DriveCall[] = [];
  private items = new Map<string, Item>();
  private clock = 0;
  private offline = false;
  private full = false;
  private lagging = false;
  private holds: Hold[] = [];

  /** The folder's path from the top of My Drive, one name per level. */
  private path: string[];

  /** `files` go into a new folder `folder` (a path such as `Omark/tasks`); without files there is no folder yet. */
  constructor(files: Record<string, string> = {}, folder = 'Omark Tasks') {
    this.path = folder.split('/');
    for (const [name, text] of Object.entries(files)) this.externalWrite(name, text);
  }

  /** Simulates another device writing the file, creating the folders and the file as needed. */
  externalWrite(name: string, text: string): void {
    let folder: Item | undefined;
    for (const level of this.path) {
      const parent: string | null = folder?.id ?? null;
      folder = this.childFolder(level, parent) ?? this.add(level, parent, true);
    }
    const file = this.currentFile(name);
    if (file) this.setContent(file, utf8(text));
    else this.setContent(this.add(name, folder!.id), utf8(text));
  }

  peek(name: string): string | null {
    const file = this.currentFile(name);
    return file ? new TextDecoder().decode(file.revisions.get(file.headRevisionId)!) : null;
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
  }

  /**
   * Lists that lag, as Drive's can right after a create: a file or folder made meanwhile is listed only
   * to the device that made it (by its Authorization header) until `settleLists`. Reads by id still work.
   */
  setListLag(lag: boolean): void {
    this.lagging = lag;
  }

  /** Every item made while lists lagged shows in every list from now on. */
  settleLists(): void {
    for (const item of this.items.values()) delete item.unlistedFor;
  }

  /** Takes every trashed file and folder out of the trash, as a user restoring them would. */
  restoreTrashed(): void {
    for (const item of this.items.values()) {
      if (!item.trashed) continue;
      item.trashed = false;
      this.newEtag(item);
    }
  }

  /** A full Drive: creating or updating a file answers 403 `storageQuotaExceeded`; reads still work. */
  setFull(full: boolean): void {
    this.full = full;
  }

  /** A rename-like change elsewhere: a new etag, the same text. */
  touchMetadata(name: string): void {
    this.newEtag(this.mustFind(name));
  }

  trash(name: string): void {
    const file = this.mustFind(name);
    file.trashed = true;
    this.newEtag(file);
  }

  /**
   * Trashes the folder and the files in it. As in Drive, a file added to the trashed folder later is not
   * trashed: it is listed and its `labels.trashed` is false.
   */
  trashFolder(): void {
    const folder = this.mustFindFolder();
    for (const item of [...this.items.values()].filter((i) => i === folder || i.parent === folder.id)) {
      item.trashed = true;
      this.newEtag(item);
    }
  }

  /** Deletes the folder and its files for good, past the trash. */
  deleteFolder(): void {
    const folder = this.mustFindFolder();
    for (const item of [...this.items.values()]) {
      if (item === folder || item.parent === folder.id) this.items.delete(item.id);
    }
  }

  /** The names of the untrashed folders at every level, oldest first. */
  folders(): string[] {
    return this.sorted((i) => i.isFolder && !i.trashed).map((i) => i.name);
  }

  /** The names of the untrashed files in every folder, oldest first. */
  files(): string[] {
    return this.sorted((i) => !i.isFolder && !i.trashed).map((i) => i.name);
  }

  /**
   * Holds the reply to the next request `match` accepts until `release()`, to stage a race between two
   * devices. The reply is worked out when the request arrives, and `reached` settles then.
   */
  holdReply(match: (call: DriveCall) => boolean): { reached: Promise<void>; release: () => void } {
    let reached!: () => void;
    let release!: () => void;
    const reachedP = new Promise<void>((r) => (reached = r));
    this.holds.push({ match, reached, gate: new Promise<void>((r) => (release = r)) });
    return { reached: reachedP, release };
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: DriveCall = { method: init?.method ?? 'GET', url: String(input), headers: {} };
    new Headers(init?.headers).forEach((v, k) => (call.headers[k] = v));
    this.calls.push(call);
    if (this.offline) throw new TypeError('Failed to fetch');
    const raw = init?.body;
    if (raw !== undefined && typeof raw !== 'string' && !(raw instanceof Blob)) unexpected(call);
    // A Blob (a picture's multipart insert) arrives as its bytes, one character per byte.
    const body = raw instanceof Blob ? binary(new Uint8Array(await raw.arrayBuffer())) : raw;
    const res = this.answer(call, body, raw instanceof Blob);
    const i = this.holds.findIndex((h) => h.match(call));
    if (i >= 0) {
      const [hold] = this.holds.splice(i, 1);
      hold!.reached();
      await hold!.gate;
    }
    return res;
  };

  private answer(call: DriveCall, body: string | undefined, bytes: boolean): Response {
    if (!call.headers['authorization']?.startsWith('Bearer ')) return googleError(401, 'authError');
    const url = new URL(call.url);
    if (url.origin !== API) unexpected(call);
    const path = url.pathname;
    const { method } = call;
    let m: RegExpExecArray | null;
    if (method === 'GET' && path === '/drive/v3/files') return this.list(call, url);
    if (method === 'POST' && path === '/drive/v3/files') return this.createFolder(call, url, body);
    if (method === 'PATCH' && (m = /^\/drive\/v3\/files\/([^/]+)$/.exec(path))) return this.trashItem(call, url, m[1]!, body);
    if (method === 'GET' && (m = /^\/drive\/v2\/files\/([^/]+)$/.exec(path))) return this.metadata(call, url, m[1]!);
    if (method === 'GET' && (m = /^\/drive\/v3\/files\/([^/]+)\/revisions\/([^/]+)$/.exec(path))) {
      return this.revision(call, url, m[1]!, m[2]!);
    }
    if (method === 'POST' && path === '/upload/drive/v2/files') return this.insert(call, url, bytes ? body : body && binary(utf8(body)));
    if (bytes) unexpected(call);
    if (method === 'PUT' && (m = /^\/upload\/drive\/v2\/files\/([^/]+)$/.exec(path))) return this.update(call, url, m[1]!, body);
    unexpected(call);
  }

  /** v3 list: the folder by name, or a file by name in a folder. */
  private list(call: DriveCall, url: URL): Response {
    expectQuery(call, url, { q: url.searchParams.get('q') ?? '', orderBy: 'createdTime', fields: 'files(id)', spaces: 'drive' });
    const q = url.searchParams.get('q')!;
    let found: Item[];
    let m: RegExpExecArray | null;
    if ((m = FOLDER_QUERY.exec(q))) {
      const [name, parent] = [unescape(m[1]!), m[2] ?? null];
      found = this.sorted((i) => i.isFolder && i.parent === parent && i.name === name && !i.trashed && this.listed(i, call));
    } else if ((m = FILE_QUERY.exec(q))) {
      const [name, parent] = [unescape(m[1]!), m[2]!];
      found = this.sorted((i) => !i.isFolder && i.parent === parent && i.name === name && !i.trashed && this.listed(i, call));
    } else unexpected(call);
    return Response.json({ files: found.map((i) => ({ id: i.id })) });
  }

  /** v3 create, metadata only: a folder at the top of My Drive, or in the folder `parents` names. */
  private createFolder(call: DriveCall, url: URL, body: string | undefined): Response {
    expectQuery(call, url, { fields: 'id' });
    const keys = body?.includes('"parents"') ? ['mimeType', 'name', 'parents'] : ['mimeType', 'name'];
    const meta = jsonBody(call, body, keys) as { name: string; mimeType: string; parents?: string[] };
    if (meta.mimeType !== FOLDER_MIME || (meta.parents && meta.parents.length !== 1)) unexpected(call);
    const parent = meta.parents?.[0] ?? null;
    if (parent !== null && !this.items.get(parent)?.isFolder) return googleError(404, 'notFound');
    return Response.json({ id: this.add(meta.name, parent, true, this.by(call)).id });
  }

  private trashItem(call: DriveCall, url: URL, id: string, body: string | undefined): Response {
    expectQuery(call, url, {});
    const patch = jsonBody(call, body, ['trashed']) as { trashed: unknown };
    if (patch.trashed !== true) unexpected(call);
    const item = this.items.get(decodeURIComponent(id));
    if (!item) return googleError(404, 'notFound');
    item.trashed = true;
    this.newEtag(item);
    return Response.json({ id: item.id });
  }

  /** v2 metadata: the etag and the head revision, read together. */
  private metadata(call: DriveCall, url: URL, id: string): Response {
    expectQuery(call, url, { fields: 'etag,headRevisionId,labels/trashed' });
    const item = this.items.get(decodeURIComponent(id));
    if (!item) return googleError(404, 'notFound');
    return Response.json({ etag: item.etag, headRevisionId: item.headRevisionId, labels: { trashed: item.trashed } });
  }

  /** v3 revision content: exactly the bytes of that revision. */
  private revision(call: DriveCall, url: URL, id: string, revisionId: string): Response {
    expectQuery(call, url, { alt: 'media' });
    const content = this.items.get(decodeURIComponent(id))?.revisions.get(decodeURIComponent(revisionId));
    if (content === undefined) return googleError(404, 'notFound');
    return new Response(content as Uint8Array<ArrayBuffer>, { status: 200 });
  }

  /** v2 multipart insert: metadata `{ title, parents: [{ id }], mimeType }`, then the content. `body` one character per byte. */
  private insert(call: DriveCall, url: URL, body: string | undefined): Response {
    expectQuery(call, url, { uploadType: 'multipart', fields: 'id,etag' });
    if (this.full) return googleError(403, 'storageQuotaExceeded');
    const boundary = /^multipart\/related; boundary=(\S+)$/.exec(call.headers['content-type'] ?? '')?.[1];
    if (!boundary || body === undefined) unexpected(call);
    const parts = body.split(`--${boundary}`);
    if (parts.length !== 4 || parts[0] !== '' || parts[3] !== '--') unexpected(call);
    const [metaPart, mediaPart] = [part(call, parts[1]!), part(call, parts[2]!)];
    if (metaPart.type !== 'application/json; charset=UTF-8') unexpected(call);
    const meta = jsonBody(call, new TextDecoder().decode(bytesOf(metaPart.content)), ['mimeType', 'parents', 'title']) as {
      title: string;
      parents: { id: string }[];
      mimeType: string;
    };
    const type = meta.mimeType.startsWith('text/') ? `${meta.mimeType}; charset=utf-8` : meta.mimeType;
    if (mediaPart.type !== type || meta.parents.length !== 1) unexpected(call);
    const folder = this.items.get(meta.parents[0]!.id);
    if (!folder || !folder.isFolder) return googleError(404, 'notFound');
    const file = this.add(meta.title, folder.id, false, this.by(call));
    this.setContent(file, bytesOf(mediaPart.content));
    return Response.json({ id: file.id, etag: file.etag });
  }

  /** v2 media update, honouring `If-Match` (v3 would ignore it). */
  private update(call: DriveCall, url: URL, id: string, body: string | undefined): Response {
    expectQuery(call, url, { uploadType: 'media', fields: 'etag' });
    if (this.full) return googleError(403, 'storageQuotaExceeded');
    const ifMatch = call.headers['if-match'];
    const typed = /^text\/\S+; charset=utf-8$/.test(call.headers['content-type'] ?? '');
    if (ifMatch === undefined || body === undefined || !typed) unexpected(call);
    const file = this.items.get(decodeURIComponent(id));
    if (!file || file.isFolder) return googleError(404, 'notFound');
    if (ifMatch !== file.etag) {
      if (!file.etags.has(ifMatch)) return googleError(500, 'backendError');
      return Response.json(
        { error: { code: 412, message: 'Precondition Failed', errors: [{ reason: 'conditionNotMet' }] } },
        { status: 412 },
      );
    }
    this.setContent(file, utf8(body));
    return Response.json({ etag: file.etag });
  }

  /** `by`: the Authorization header of the call that made it, while lists lag. */
  private add(name: string, parent: string | null, isFolder = false, by?: string): Item {
    const n = ++this.clock;
    const item: Item = {
      id: `id${n}`,
      name,
      parent,
      isFolder,
      created: n,
      trashed: false,
      etag: '',
      etags: new Set(),
      headRevisionId: '',
      revisions: new Map(),
      ...(by !== undefined && { unlistedFor: by }),
    };
    this.items.set(item.id, item);
    this.newEtag(item);
    return item;
  }

  private setContent(file: Item, content: Uint8Array): void {
    file.headRevisionId = `rev${++this.clock}`;
    file.revisions.set(file.headRevisionId, content);
    this.newEtag(file);
  }

  /** Etags look like Drive's: a quoted base64 timestamp. Any change, metadata included, gets a new one. */
  private newEtag(item: Item): void {
    item.etag = `"${btoa(String(1_793_000_000_000 + ++this.clock)).replace(/=+$/, '')}"`;
    item.etags.add(item.etag);
  }

  /** Who made an item now, for the lag: the call's Authorization header while lists lag, else nobody. */
  private by(call: DriveCall): string | undefined {
    return this.lagging ? call.headers['authorization'] : undefined;
  }

  /** Whether a list from `call` shows `item` yet. */
  private listed(item: Item, call: DriveCall): boolean {
    return item.unlistedFor === undefined || item.unlistedFor === call.headers['authorization'];
  }

  private sorted(keep: (i: Item) => boolean): Item[] {
    return [...this.items.values()].filter(keep).sort((a, b) => a.created - b.created);
  }

  /** The oldest untrashed folder with this name in `parent` (null: the top of My Drive). */
  private childFolder(name: string, parent: string | null): Item | undefined {
    return this.sorted((i) => i.isFolder && i.parent === parent && i.name === name && !i.trashed)[0];
  }

  /** The folder at the end of the path, taking the oldest at each level, as the adapter does. */
  private currentFolder(): Item | undefined {
    let folder: Item | undefined;
    for (const level of this.path) {
      folder = this.childFolder(level, folder?.id ?? null);
      if (!folder) return undefined;
    }
    return folder;
  }

  private currentFile(name: string): Item | undefined {
    const folder = this.currentFolder();
    return folder && this.sorted((i) => i.parent === folder.id && i.name === name && !i.trashed)[0];
  }

  private mustFindFolder(): Item {
    const folder = this.currentFolder();
    if (!folder) throw new Error('FakeGoogleDrive: no folder');
    return folder;
  }

  private mustFind(name: string): Item {
    const file = this.currentFile(name);
    if (!file) throw new Error(`FakeGoogleDrive: no ${name}`);
    return file;
  }
}

function unexpected(call: DriveCall): never {
  throw new Error(`FakeGoogleDrive: unexpected request ${call.method} ${call.url}`);
}

/** The query must have exactly these parameters. */
function expectQuery(call: DriveCall, url: URL, expected: Record<string, string>): void {
  const actual = [...url.searchParams].sort(([a], [b]) => a.localeCompare(b));
  const wanted = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) unexpected(call);
}

/** A JSON object with exactly these keys. */
function jsonBody(call: DriveCall, body: string | undefined, keys: string[]): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(body ?? '');
  } catch {
    unexpected(call);
  }
  if (typeof value !== 'object' || value === null || Object.keys(value).sort().join() !== keys.join()) unexpected(call);
  return value as Record<string, unknown>;
}

/** One multipart part: `\r\nContent-Type: <type>\r\n\r\n<content>\r\n`. */
function part(call: DriveCall, raw: string): { type: string; content: string } {
  const m = /^\r\nContent-Type: ([^\r\n]+)\r\n\r\n([\s\S]*)\r\n$/.exec(raw);
  if (!m) unexpected(call);
  return { type: m[1]!, content: m[2]! };
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Bytes as a string of one character each, so a multipart body splits on its boundaries without decoding. */
function binary(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

const bytesOf = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

function unescape(quoted: string): string {
  return quoted.replace(/\\(.)/g, '$1');
}

function googleError(status: number, reason: string): Response {
  return Response.json({ error: { code: status, message: reason, errors: [{ reason }] } }, { status });
}
