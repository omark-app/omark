import { binaryType } from './adapter.ts';
import type { BinaryStore, KnownVersion, RemoteFile, StorageAdapter } from './adapter.ts';
import { AuthRequiredError, PreconditionFailedError, StorageFullError } from './errors.ts';
import { createHttp, type Http, type Reply } from './http.ts';

const API = 'https://www.googleapis.com/';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DEFAULT_TIMEOUT_MS = 20_000;

export interface GoogleDriveAdapterOptions {
  /** A folder in My Drive, one name (`Omark Tasks`) or a path (`Omark/tasks`); each level is created on the first write. */
  folder: string;
  /** `fresh`: Google rejected the last token, so get a new one. */
  getToken: (opts?: { fresh?: boolean }) => Promise<string>;
  fetch?: typeof fetch;
  /** Per request, body included; a request that takes longer fails with `OfflineError`. Default 20 s. */
  timeoutMs?: number;
}

/** v2 metadata: `etag` changes on any change, `headRevisionId` only when the content does. */
interface Metadata {
  etag: string;
  headRevisionId: string;
  labels: { trashed: boolean };
}

/**
 * Files by name in one folder of My Drive. Drive allows several files with one name, so the oldest
 * (by `createdTime`) is the one in use, for each folder level too. Writes go through API v2, the only one that
 * honours `If-Match` (v3 overwrites whatever the etag). Folder and file ids are kept in memory; when one
 * turns out gone or trashed, both are forgotten and looked up again. One adapter serves several files at
 * once, so concurrent calls share one folder lookup, and one "look up, else create" step for a new file.
 */
export class GoogleDriveAdapter implements StorageAdapter, BinaryStore {
  /** The folder's path, one name per level; the first sits at the top of My Drive. */
  private path: string[];
  private http: Http;
  private folderId: string | null = null;
  /** A folder lookup in progress, shared by concurrent calls. */
  private lookingUpFolder: Promise<string | null> | null = null;
  /** A "look up, else create" step in progress, shared the same way. */
  private ensuringFolder: Promise<string> | null = null;
  private fileIds = new Map<string, string>();

  constructor(opts: GoogleDriveAdapterOptions) {
    const path = opts.folder.split('/');
    if (path.some((p) => p === '' || p === '.' || p === '..')) throw new Error('The Google Drive folder path has an empty, . or .. part');
    this.path = path;
    this.http = createHttp({ getToken: opts.getToken, fetch: opts.fetch, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  }

  /**
   * The etag and the head revision id come together from the v2 metadata, and the text is that revision's
   * content, so a write landing between the two requests cannot pair new text with an older etag.
   */
  async read(name: string): Promise<RemoteFile | null> {
    const got = await this.download(name);
    return got && { text: got.body.text, etag: got.etag, source: got.id };
  }

  /**
   * `read`, stopping after the metadata when the file in use is still `known`'s, with its etag: the head revision
   * is a second request (#158). Another file under the name (#67) is read in full.
   */
  async readIfChanged(name: string, known: KnownVersion): Promise<RemoteFile | null | 'unchanged'> {
    const got = await this.download(name, known);
    return got === 'unchanged' ? got : got && { text: got.body.text, etag: got.etag, source: got.id };
  }

  async readBytes(name: string): Promise<Blob | null> {
    const got = await this.download(name);
    return got && new Blob([got.body.bytes as Uint8Array<ArrayBuffer>], { type: binaryType(name) });
  }

  async createBytes(name: string, data: Blob): Promise<void> {
    await this.create(name, data);
  }

  /**
   * The file's content with its etag, as `read` says; null when there is none, and `'unchanged'`, with no
   * download, when it is the file `unless` names (when it names one) with `unless`'s etag.
   */
  private async download(name: string): Promise<{ body: Reply; etag: string; id: string } | null>;
  private async download(name: string, unless: KnownVersion): Promise<{ body: Reply; etag: string; id: string } | null | 'unchanged'>;
  private async download(name: string, unless?: KnownVersion): Promise<{ body: Reply; etag: string; id: string } | null | 'unchanged'> {
    for (;;) {
      const cached = this.fileIds.get(name);
      const id = cached ?? (await this.findFile(name));
      if (id === null) return null;
      const res = await this.api(`${API}drive/v2/files/${encodeURIComponent(id)}?fields=etag,headRevisionId,labels/trashed`, {});
      if (res.status !== 404) {
        if (!res.ok) throw new Error(`Google Drive read failed: ${res.status}`);
        const meta = JSON.parse(res.text) as Metadata;
        if (!meta.labels.trashed) {
          this.fileIds.set(name, id);
          if (unless && meta.etag === unless.etag && (unless.source === undefined || unless.source === id)) return 'unchanged';
          const rev = `${API}drive/v3/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(meta.headRevisionId)}?alt=media`;
          const body = await this.api(rev, {});
          if (!body.ok) throw new Error(`Google Drive download failed: ${body.status}`);
          return { body, etag: meta.etag, id };
        }
      }
      this.forget(name);
      if (cached === undefined) return null; // a fresh lookup that is already gone: someone just trashed it
    }
  }

  /** Whether the file with this id is still in Drive and not in the trash (a trashed folder trashes it too). */
  async exists(source: string): Promise<boolean> {
    const res = await this.api(`${API}drive/v2/files/${encodeURIComponent(source)}?fields=etag,headRevisionId,labels/trashed`, {});
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`Google Drive read failed: ${res.status}`);
    return !(JSON.parse(res.text) as Metadata).labels.trashed;
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string; source: string }> {
    if (ifMatch === null) return this.create(name, text);
    const id = this.fileIds.get(name) ?? (await this.findFile(name));
    if (id === null) throw new PreconditionFailedError(`Precondition failed for ${name}`);
    const res = await this.api(`${API}upload/drive/v2/files/${encodeURIComponent(id)}?uploadType=media&fields=etag`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType(name), 'If-Match': ifMatch },
      body: text,
    });
    if (res.status === 404) this.forget(name);
    if (res.status === 412 || res.status === 404) throw new PreconditionFailedError(`Precondition failed for ${name}`);
    if (!res.ok) throw new Error(`Google Drive write failed: ${res.status}`);
    this.fileIds.set(name, id);
    return { etag: (JSON.parse(res.text) as { etag: string }).etag, source: id };
  }

  /**
   * Drive has no create-if-absent, so: look, create, then look again. When another device created the
   * same name meanwhile, the older file wins and ours goes to the trash, which reads as a 412.
   */
  private async create(name: string, content: string | Blob): Promise<{ etag: string; source: string }> {
    const folderId = await this.ensureFolder();
    if ((await this.list(fileQuery(name, folderId))).length > 0) throw new PreconditionFailedError(`${name} already exists`);
    const boundary = `boundary-${crypto.randomUUID()}`;
    const meta = { title: name, parents: [{ id: folderId }], mimeType: mimeType(name) };
    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType(name)}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    // A binary file's bytes go in untouched, in a Blob; a text stays one string.
    const body = typeof content === 'string' ? head + content + tail : new Blob([head, content, tail]);
    const res = await this.api(`${API}upload/drive/v2/files?uploadType=multipart&fields=id,etag`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    // The folder was deleted for good after we looked it up; the sync's next try makes a new one.
    if (res.status === 404) throw new PreconditionFailedError(`The folder for ${name} is gone`);
    if (!res.ok) throw new Error(`Google Drive create failed: ${res.status}`);
    const made = JSON.parse(res.text) as { id: string; etag: string };
    const ids = await this.list(fileQuery(name, folderId));
    if (ids[0] !== made.id) {
      const trash = await this.api(`${API}drive/v3/files/${encodeURIComponent(made.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ trashed: true }),
      });
      // A 404: our copy is gone already, with the folder, deleted for good meanwhile.
      if (!trash.ok && trash.status !== 404) throw new Error(`Google Drive trash failed: ${trash.status}`);
      throw new PreconditionFailedError(`${name} already exists`);
    }
    this.fileIds.set(name, made.id);
    return { etag: made.etag, source: made.id };
  }

  private async findFile(name: string): Promise<string | null> {
    const folderId = await this.findFolder();
    if (folderId === null) return null;
    return (await this.list(fileQuery(name, folderId)))[0] ?? null;
  }

  /** The cached folder id, or a lookup (one in progress is shared). `fresh` skips the cached id. */
  private async findFolder(fresh = false): Promise<string | null> {
    if (this.folderId !== null && !fresh) return this.folderId;
    this.lookingUpFolder ??= this.walk(false)
      .then((id) => (this.folderId = id))
      .finally(() => (this.lookingUpFolder = null));
    return this.lookingUpFolder;
  }

  /**
   * The folder for a new file, looked up afresh: Drive accepts a file into a trashed folder, so the cached
   * id could put it in the trash, out of the user's sight. The lookup skips trashed folders. A create that
   * starts while another one is in this step joins it, rather than miss a folder still being made.
   */
  private ensureFolder(): Promise<string> {
    this.ensuringFolder ??= this.walk(true)
      .then((id) => (this.folderId = id!))
      .finally(() => (this.ensuringFolder = null));
    return this.ensuringFolder;
  }

  /** Follows the path level by level; a missing level is null, or is made when `create`. */
  private async walk(create: boolean): Promise<string | null> {
    let parent: string | null = null;
    for (const name of this.path) {
      const found: string | undefined = (await this.list(folderQuery(name, parent)))[0];
      if (found === undefined && !create) return null;
      parent = found ?? (await this.createFolder(name, parent));
    }
    return parent;
  }

  /** Two devices may create a folder at once; both then use the oldest. */
  private async createFolder(name: string, parent: string | null): Promise<string> {
    const res = await this.api(`${API}drive/v3/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent === null ? {} : { parents: [parent] }) }),
    });
    // The parent was deleted for good after we looked it up; the sync's next try makes it again.
    if (res.status === 404) throw new PreconditionFailedError(`The folder for ${name} is gone`);
    if (!res.ok) throw new Error(`Google Drive folder create failed: ${res.status}`);
    const id = (await this.list(folderQuery(name, parent)))[0];
    if (id === undefined) throw new Error('Google Drive did not list the new folder');
    return id;
  }

  /** The ids that match `q`, oldest first. */
  private async list(q: string): Promise<string[]> {
    const url = `${API}drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime&fields=files(id)&spaces=drive`;
    const res = await this.api(url, {});
    if (!res.ok) throw new Error(`Google Drive list failed: ${res.status}`);
    return (JSON.parse(res.text) as { files: { id: string }[] }).files.map((f) => f.id);
  }

  /**
   * An authenticated call. A 403 for a missing scope (Drive unticked or revoked) needs a new sign-in; one
   * for a full Drive is `StorageFullError` (#68).
   */
  private async api(url: string, init: RequestInit): Promise<Reply> {
    const res = await this.http.authed(url, init);
    if (res.status === 403) {
      const reasons = reasonsOf(res);
      if (reasons.includes('insufficientpermissions')) throw new AuthRequiredError('Google Drive access not granted');
      if (reasons.includes('storagequotaexceeded')) throw new StorageFullError('Google Drive is full');
    }
    return res;
  }

  private forget(name: string): void {
    this.fileIds.delete(name);
    this.folderId = null;
  }
}

/** A folder by name at the top of My Drive (`parent` null), or in the folder `parent`. */
function folderQuery(name: string, parent: string | null): string {
  const inParent = parent === null ? '' : ` and '${parent}' in parents`;
  return `name='${escapeQuery(name)}' and mimeType='${FOLDER_MIME}'${inParent} and trashed=false`;
}

function fileQuery(name: string, folderId: string): string {
  return `name='${escapeQuery(name)}' and '${folderId}' in parents and trashed=false`;
}

function escapeQuery(s: string): string {
  return s.replace(/[\\']/g, '\\$&');
}

const isBinary = (name: string): boolean => binaryType(name) !== 'application/octet-stream';

function mimeType(name: string): string {
  if (isBinary(name)) return binaryType(name);
  return name.endsWith('.md') ? 'text/markdown' : 'text/plain';
}

function contentType(name: string): string {
  return isBinary(name) ? mimeType(name) : `${mimeType(name)}; charset=utf-8`;
}

/**
 * The first `reason` in a Google error body's `errors` and the ones in its `details` (newer replies, which
 * spell them `STORAGE_QUOTA_EXCEEDED`), lower case without `_`. A malformed part is skipped, not the rest.
 */
function reasonsOf(res: Reply): string[] {
  let error: unknown;
  try {
    error = (JSON.parse(res.text) as { error?: unknown }).error;
  } catch {
    return [];
  }
  const e = error as { errors?: unknown; details?: unknown } | null | undefined;
  const reasonIn = (x: unknown): unknown => (typeof x === 'object' && x !== null ? (x as { reason?: unknown }).reason : undefined);
  const found = [
    Array.isArray(e?.errors) ? reasonIn(e.errors[0]) : undefined,
    ...(Array.isArray(e?.details) ? e.details.map(reasonIn) : []),
  ];
  return found.filter((r): r is string => typeof r === 'string').map((r) => r.replace(/_/g, '').toLowerCase());
}
