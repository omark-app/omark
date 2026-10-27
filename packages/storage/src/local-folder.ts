import { createStore, del, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { RemoteFile, StorageAdapter } from './adapter.ts';
import { AuthRequiredError, OfflineError, PreconditionFailedError } from './errors.ts';

export type FolderPermission = 'granted' | 'prompt' | 'denied';

/** The part of `FileSystemFileHandle` the adapter uses. */
export interface FolderFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

/**
 * The part of `FileSystemDirectoryHandle` the adapter uses, with the permission methods TypeScript's DOM
 * types leave out (they are optional: a handle without them is taken as allowed).
 */
export interface FolderHandle {
  readonly kind: 'directory';
  readonly name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FolderFileHandle>;
  keys(): AsyncIterableIterator<string>;
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
 */
export class LocalFolderAdapter implements StorageAdapter {
  constructor(private readonly folder: FolderHandle) {}

  async read(name: string): Promise<RemoteFile | null> {
    return this.guard(async () => {
      const file = await this.fileOrNull(name);
      if (!file) return null;
      const text = await (await file.getFile()).text();
      return { text, etag: await etagOf(text) };
    });
  }

  async write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }> {
    return this.guard(async () => {
      const existing = await this.fileOrNull(name);
      const current = existing ? await etagOf(await (await existing.getFile()).text()) : null;
      if (current !== ifMatch) throw new PreconditionFailedError(`Precondition failed for ${name}`);
      const file = existing ?? (await this.folder.getFileHandle(name, { create: true }));
      const stream = await file.createWritable();
      await stream.write(text);
      await stream.close();
      return { etag: await etagOf(text) };
    });
  }

  /** The file's handle, or null when it does not exist in a folder that does. */
  private async fileOrNull(name: string): Promise<FolderFileHandle | null> {
    try {
      return await this.folder.getFileHandle(name);
    } catch (e) {
      if (!isError(e, 'NotFoundError')) throw e;
      // A handle to a folder that has gone away says NotFoundError for every file too.
      await this.folder.keys().next();
      return null;
    }
  }

  private async guard<T>(op: () => Promise<T>): Promise<T> {
    if ((await folderAccess(this.folder)) !== 'granted') throw this.accessNeeded();
    try {
      return await op();
    } catch (e) {
      if (isError(e, 'NotAllowedError') || isError(e, 'SecurityError')) throw this.accessNeeded();
      if (isError(e, 'NotFoundError')) throw new OfflineError(`The folder ${this.folder.name} can't be found`);
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
 * `notes (1).md` (Google Drive, Dropbox), `notes 2.md` (iCloud), `notes-PC.md` (OneDrive) and
 * `notes.sync-conflict-….md` (Syncthing). Sorted; empty when the folder cannot be listed.
 */
export async function conflictCopies(folder: FolderHandle, names: string[]): Promise<string[]> {
  const patterns = names.map((n) => {
    const dot = n.lastIndexOf('.');
    const stem = escape(dot > 0 ? n.slice(0, dot) : n);
    const ext = dot > 0 ? escape(n.slice(dot)) : '';
    return new RegExp(`^${stem}(?: \\(.+\\)| \\d+|-.+|\\.sync-conflict-.+)${ext}$`, 'i');
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

  async save(handle: FolderHandle): Promise<FolderChoice> {
    const old = await this.load();
    const same = old ? await old.handle.isSameEntry?.(handle).catch(() => false) : false;
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
