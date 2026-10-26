import type { RemoteFile, StorageAdapter } from './adapter.ts';
import { AuthRequiredError, PreconditionFailedError } from './errors.ts';
import { createHttp, type Http, type Reply } from './http.ts';

const API = 'https://www.googleapis.com/';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DEFAULT_TIMEOUT_MS = 20_000;

export interface GoogleDriveAdapterOptions {
  /** One folder name in My Drive, created on the first write. */
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
 * (by `createdTime`) is the one in use, for the folder too. Writes go through API v2, the only one that
 * honours `If-Match` (v3 overwrites whatever the etag). Folder and file ids are kept in memory; when one
 * turns out gone or trashed, both are forgotten and looked up again.
 */
export class GoogleDriveAdapter implements StorageAdapter {
  private folder: string;
  private http: Http;
  private folderId: string | null = null;
  private fileIds = new Map<string, string>();

  constructor(opts: GoogleDriveAdapterOptions) {
    const f = opts.folder;
    if (f === '' || f === '.' || f === '..' || f.includes('/')) throw new Error('The Google Drive folder must be one folder name');
    this.folder = f;
    this.http = createHttp({ getToken: opts.getToken, fetch: opts.fetch, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  }

  /**
   * The etag and the head revision id come together from the v2 metadata, and the text is that revision's
   * content, so a write landing between the two requests cannot pair new text with an older etag.
   */
  async read(name: string): Promise<RemoteFile | null> {
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
          const rev = `${API}drive/v3/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(meta.headRevisionId)}?alt=media`;
          const body = await this.api(rev, {});
          if (!body.ok) throw new Error(`Google Drive download failed: ${body.status}`);
          return { text: body.text, etag: meta.etag };
        }
      }
      this.forget(name);
      if (cached === undefined) return null; // a fresh lookup that is already gone: someone just trashed it
    }
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
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
    return { etag: (JSON.parse(res.text) as { etag: string }).etag };
  }

  /**
   * Drive has no create-if-absent, so: look, create, then look again. When another device created the
   * same name meanwhile, the older file wins and ours goes to the trash, which reads as a 412.
   */
  private async create(name: string, text: string): Promise<{ etag: string }> {
    const folderId = await this.ensureFolder();
    if ((await this.list(fileQuery(name, folderId))).length > 0) throw new PreconditionFailedError(`${name} already exists`);
    const boundary = `boundary-${crypto.randomUUID()}`;
    const meta = { title: name, parents: [{ id: folderId }], mimeType: mimeType(name) };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType(name)}\r\n\r\n${text}\r\n--${boundary}--`;
    const res = await this.api(`${API}upload/drive/v2/files?uploadType=multipart&fields=id,etag`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Google Drive create failed: ${res.status}`);
    const made = JSON.parse(res.text) as { id: string; etag: string };
    const ids = await this.list(fileQuery(name, folderId));
    if (ids[0] !== made.id) {
      const trash = await this.api(`${API}drive/v3/files/${encodeURIComponent(made.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ trashed: true }),
      });
      if (!trash.ok) throw new Error(`Google Drive trash failed: ${trash.status}`);
      this.forget(name); // no file listed at all means the folder itself went to the trash
      throw new PreconditionFailedError(`${name} already exists`);
    }
    this.fileIds.set(name, made.id);
    return { etag: made.etag };
  }

  private async findFile(name: string): Promise<string | null> {
    const folderId = await this.findFolder();
    if (folderId === null) return null;
    return (await this.list(fileQuery(name, folderId)))[0] ?? null;
  }

  private async findFolder(): Promise<string | null> {
    this.folderId ??= (await this.list(this.folderQuery()))[0] ?? null;
    return this.folderId;
  }

  /** Two devices may create the folder at once; both then use the oldest. */
  private async ensureFolder(): Promise<string> {
    const found = await this.findFolder();
    if (found !== null) return found;
    const res = await this.api(`${API}drive/v3/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name: this.folder, mimeType: FOLDER_MIME }),
    });
    if (!res.ok) throw new Error(`Google Drive folder create failed: ${res.status}`);
    const id = (await this.list(this.folderQuery()))[0];
    if (id === undefined) throw new Error('Google Drive did not list the new folder');
    return (this.folderId = id);
  }

  private folderQuery(): string {
    return `name='${escapeQuery(this.folder)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  }

  /** The ids that match `q`, oldest first. */
  private async list(q: string): Promise<string[]> {
    const url = `${API}drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime&fields=files(id)&spaces=drive`;
    const res = await this.api(url, {});
    if (!res.ok) throw new Error(`Google Drive list failed: ${res.status}`);
    return (JSON.parse(res.text) as { files: { id: string }[] }).files.map((f) => f.id);
  }

  /** An authenticated call. A 403 for a missing scope (Drive unticked or revoked) needs a new sign-in. */
  private async api(url: string, init: RequestInit): Promise<Reply> {
    const res = await this.http.authed(url, init);
    if (res.status === 403 && reasonOf(res) === 'insufficientPermissions') {
      throw new AuthRequiredError('Google Drive access not granted');
    }
    return res;
  }

  private forget(name: string): void {
    this.fileIds.delete(name);
    this.folderId = null;
  }
}

function fileQuery(name: string, folderId: string): string {
  return `name='${escapeQuery(name)}' and '${folderId}' in parents and trashed=false`;
}

function escapeQuery(s: string): string {
  return s.replace(/[\\']/g, '\\$&');
}

function mimeType(name: string): string {
  return name.endsWith('.md') ? 'text/markdown' : 'text/plain';
}

function contentType(name: string): string {
  return `${mimeType(name)}; charset=utf-8`;
}

/** The first `reason` in a Google error body, if there is one. */
function reasonOf(res: Reply): string | undefined {
  try {
    return (JSON.parse(res.text) as { error?: { errors?: { reason?: string }[] } }).error?.errors?.[0]?.reason;
  } catch {
    return undefined;
  }
}
