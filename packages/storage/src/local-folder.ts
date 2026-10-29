import { createStore, del, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import { binaryType } from './adapter.ts';
import type { BinaryStore, RemoteFile, StorageAdapter } from './adapter.ts';
import { AuthRequiredError, OfflineError, PreconditionFailedError, StorageFullError } from './errors.ts';

export type FolderPermission = 'granted' | 'prompt' | 'denied';

/** The part of `FileSystemWritableFileStream` the adapter uses. */
export interface WritableFile {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

/** The part of `FileSystemFileHandle` the adapter uses. */
export interface FolderFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
}

/**
 * The part of `FileSystemDirectoryHandle` the adapter uses, with the permission methods TypeScript's DOM
 * types leave out (they are optional: a handle without them is taken as allowed).
 */
export interface FolderHandle {
  readonly kind: 'directory';
  readonly name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FolderFileHandle>;
  /** Needed only for an adapter on a subfolder. */
  getDirectoryHandle?(name: string, opts?: { create?: boolean }): Promise<FolderHandle>;
  keys(): AsyncIterableIterator<string>;
  removeEntry?(name: string): Promise<void>;
  queryPermission?(desc: { mode: 'readwrite' }): Promise<FolderPermission>;
  requestPermission?(desc: { mode: 'readwrite' }): Promise<FolderPermission>;
  isSameEntry?(other: FolderHandle): Promise<boolean>;
}

const READWRITE = { mode: 'readwrite' } as const;

/**
 * A StorageAdapter on a folder the user picked (File System Access API). The eTag is a SHA-256 of the
 * file's text, so any change made outside (an editor, an agent, a sync client) fails the next conditional
 * write and is merged. The API has no compare-and-swap: a write checks the current text, then replaces the
 * file (`createWritable` swaps it in on `close`), so an outside save in between is not caught.
 * Lost permission is `AuthRequiredError` (the user allows access again with a click, `requestFolderAccess`);
 * a folder that has gone away (renamed, unplugged) is `OfflineError`.
 *
 * With `subfolder`, the files live in that folder inside the picked one (the one Omark app: `tasks/`, or a path
 * such as `goals/images`); a missing subfolder reads as no files and is made on the first write.
 */
export class LocalFolderAdapter implements StorageAdapter, BinaryStore {
  /** The subfolder's path, one name per level; empty for the picked folder itself. */
  private readonly subfolder: string[];

  constructor(
    private readonly folder: FolderHandle,
    opts: { subfolder?: string } = {},
  ) {
    const sub = opts.subfolder?.split('/') ?? [];
    if (sub.some((p) => p === '' || p === '.' || p === '..' || p.includes('\\'))) {
      throw new Error('The subfolder path has an empty, . or .. part, or a backslash');
    }
    this.subfolder = sub;
  }

  async read(name: string): Promise<RemoteFile | null> {
    return this.guard(async () => {
      const dir = await this.dir(false);
      const file = dir && (await this.fileOrNull(dir, name));
      if (!file) return null;
      const text = await (await file.getFile()).text();
      return { text, etag: await etagOf(text) };
    });
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    return this.guard(async () => {
      const found = await this.dir(ifMatch === null);
      const existing = found && (await this.fileOrNull(found, name));
      const current = existing ? await etagOf(await (await existing.getFile()).text()) : null;
      if (current !== ifMatch) throw new PreconditionFailedError(`Precondition failed for ${name}`);
      // Past the check there is a folder: a create made it, an update found its file in it.
      await this.save(found!, name, existing, text);
      return { etag: await etagOf(text) };
    });
  }

  async readBytes(name: string): Promise<Blob | null> {
    return this.guard(async () => {
      const dir = await this.dir(false);
      const file = dir && (await this.fileOrNull(dir, name));
      if (!file) return null;
      return new Blob([await (await file.getFile()).arrayBuffer()], { type: binaryType(name) });
    });
  }

  async createBytes(name: string, data: Blob): Promise<void> {
    return this.guard(async () => {
      const dir = (await this.dir(true))!;
      if (await this.fileOrNull(dir, name)) throw new PreconditionFailedError(`${name} already exists`);
      await this.save(dir, name, null, data);
    });
  }

  /** Writes `data` into the file (`existing`, or a new one by `name`). */
  private async save(dir: FolderHandle, name: string, existing: FolderFileHandle | null, data: string | Blob): Promise<void> {
    // Creating the file puts an empty one there at once; the content lands only when the stream closes.
    const file = existing ?? (await dir.getFileHandle(name, { create: true }));
    let stream: WritableFile | undefined;
    try {
      stream = await file.createWritable();
      await stream.write(data);
      await stream.close();
    } catch (e) {
      await stream?.abort?.().catch(() => {});
      // Take away the empty file this write created (only if still empty), so it never reads as content.
      if (!existing) await this.removeIfEmpty(dir, file).catch(() => {});
      throw e;
    }
  }

  /**
   * The folder the files are in: the picked one, or its subfolder; null when the subfolder does not exist
   * and `create` is false.
   */
  private async dir(create: boolean): Promise<FolderHandle | null> {
    let dir = this.folder;
    try {
      for (const level of this.subfolder) dir = await dir.getDirectoryHandle!(level, { create });
      return dir;
    } catch (e) {
      if (!isError(e, 'NotFoundError')) throw e;
      await this.mustExist(this.folder);
      return null;
    }
  }

  /** The file's handle, or null when it does not exist in a folder that does. */
  private async fileOrNull(dir: FolderHandle, name: string): Promise<FolderFileHandle | null> {
    try {
      return await dir.getFileHandle(name);
    } catch (e) {
      if (!isError(e, 'NotFoundError')) throw e;
      await this.mustExist(dir);
      return null;
    }
  }

  /** A handle to a folder that has gone away says NotFoundError for everything in it, so listing it tells. */
  private async mustExist(dir: FolderHandle): Promise<void> {
    const listing = dir.keys();
    await listing.next();
    await listing.return?.();
  }

  private async removeIfEmpty(dir: FolderHandle, file: FolderFileHandle): Promise<void> {
    if ((await file.getFile()).size === 0) await dir.removeEntry?.(file.name);
  }

  private async guard<T>(op: () => Promise<T>): Promise<T> {
    if ((await folderAccess(this.folder)) !== 'granted') throw this.accessNeeded();
    try {
      return await op();
    } catch (e) {
      if (isError(e, 'NotAllowedError') || isError(e, 'SecurityError')) throw this.accessNeeded();
      if (isError(e, 'NotFoundError')) throw new OfflineError(`The folder ${this.folder.name} can't be found`);
      if (isError(e, 'QuotaExceededError')) throw new StorageFullError(`The disk with the folder ${this.folder.name} is full`);
      throw e;
    }
  }

  private accessNeeded(): AuthRequiredError {
    return new AuthRequiredError(`Access to the folder ${this.folder.name} needs allowing again`);
  }
}

/** The browser's permission for the folder; `granted` when the handle cannot say. */
export async function folderAccess(folder: FolderHandle): Promise<FolderPermission> {
  return (await folder.queryPermission?.(READWRITE)) ?? 'granted';
}

/** Asks the user to allow access again (needs a click or a key press). True when allowed. */
export async function requestFolderAccess(folder: FolderHandle): Promise<boolean> {
  return ((await folder.requestPermission?.(READWRITE)) ?? 'granted') === 'granted';
}

/** What `pickFolder` needs of `window` (TypeScript's DOM types leave it out). */
export interface FolderPicker {
  showDirectoryPicker?: (opts: { id: string; mode: 'readwrite' }) => Promise<unknown>;
}

/** Can this browser pick a folder? Chrome and Edge on a computer; not Safari, Firefox or phones. */
export function folderSupported(win: object): boolean {
  return typeof (win as FolderPicker).showDirectoryPicker === 'function';
}

/**
 * Shows the folder picker for reading and writing (needs a click). `id` lets the browser reopen it where
 * it was last time. Null when the user cancels.
 */
export async function pickFolder(win: object, id: string): Promise<FolderHandle | null> {
  const { showDirectoryPicker } = win as FolderPicker;
  if (!showDirectoryPicker) return null;
  try {
    return (await showDirectoryPicker.call(win, { id, mode: 'readwrite' })) as FolderHandle;
  } catch (e) {
    if (isError(e, 'AbortError')) return null;
    throw e;
  }
}

/**
 * Files in the folder that look like a sync client's copy of one of `names` after a clash: for `notes.md`,
 * `notes (1).md` (Google Drive, Dropbox), `notes 2.md` (iCloud), `notes-DESKTOP-4F2K.md` (OneDrive adds the
 * computer's name, in capitals) and `notes.sync-conflict-….md` (Syncthing). Kept narrow, so `notes-archive.md`
 * or `notes 2026.md` are not taken for one. Sorted; empty when the folder cannot be listed.
 */
export async function conflictCopies(folder: FolderHandle, names: string[]): Promise<string[]> {
  const patterns = names.map((n) => {
    const dot = n.lastIndexOf('.');
    const stem = escape(dot > 0 ? n.slice(0, dot) : n);
    const ext = dot > 0 ? escape(n.slice(dot)) : '';
    const copy = ` \\(.+\\)| \\d{1,2}|-(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]+|\\.sync-conflict-.+`;
    return new RegExp(`^${stem}(?:${copy})${ext}$`);
  });
  const found: string[] = [];
  try {
    for await (const name of folder.keys()) {
      if (patterns.some((p) => p.test(name))) found.push(name);
    }
  } catch {
    return [];
  }
  return found.sort();
}

/** The picked folder and an id of its own, so caches can be kept per folder. */
export interface FolderChoice {
  handle: FolderHandle;
  id: string;
}

const KEY = 'folder';

/**
 * Keeps the picked folder's handle in IndexedDB (browsers can store handles there), so a later visit opens
 * the same folder. Picking the same folder again keeps its id.
 */
export class SavedFolder {
  private readonly store: UseStore;

  constructor(dbName: string, openStore: (dbName: string, storeName: string) => UseStore = createStore) {
    this.store = openStore(dbName, 'folder');
  }

  /** The saved folder, or null when there is none or IndexedDB fails. */
  async load(): Promise<FolderChoice | null> {
    try {
      return (await get<FolderChoice>(KEY, this.store)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * `keepId`: the user is picking the folder they had again (it moved, or access was refused), so its
   * offline copy, and any edits still waiting in it, carries over even though the handle differs.
   */
  async save(handle: FolderHandle, opts: { keepId?: boolean } = {}): Promise<FolderChoice> {
    const old = await this.load();
    const same = old ? opts.keepId || (await old.handle.isSameEntry?.(handle).catch(() => false)) : false;
    const choice: FolderChoice = { handle, id: same && old ? old.id : crypto.randomUUID() };
    await set(KEY, choice, this.store);
    return choice;
  }

  async forget(): Promise<void> {
    await del(KEY, this.store);
  }
}

async function etagOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `"sha256-${hex}"`;
}

function isError(e: unknown, name: string): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === name;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
