import 'fake-indexeddb/auto';
import type { UseStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { AuthRequiredError, OfflineError, PreconditionFailedError } from '../src/errors.ts';
import {
  conflictCopies,
  folderAccess,
  folderSupported,
  LocalFolderAdapter,
  pickFolder,
  requestFolderAccess,
  SavedFolder,
} from '../src/local-folder.ts';
import type { FolderHandle } from '../src/local-folder.ts';
import { adapterContract } from './adapter-contract.ts';
import { MemoryFolder } from './memory-folder.ts';

adapterContract(() => {
  const folder = new MemoryFolder();
  return {
    adapter: new LocalFolderAdapter(folder),
    external: (name, text) => folder.external(name, text),
    // A folder that has gone away (renamed, unplugged) is this adapter's "offline".
    offline: (on) => {
      folder.gone = on;
    },
  };
});

adapterContract(() => {
  const root = new MemoryFolder('Omark');
  return {
    adapter: new LocalFolderAdapter(root, { subfolder: 'tasks' }),
    external: (name, text) => root.sub('tasks').external(name, text),
    offline: (on) => {
      root.gone = on;
    },
  };
});

describe('LocalFolderAdapter in a subfolder', () => {
  it('reads nothing and makes no subfolder until the first write, which makes it', async () => {
    const root = new MemoryFolder('Omark');
    const tasks = new LocalFolderAdapter(root, { subfolder: 'tasks' });
    expect(await tasks.read('tasks.md')).toBeNull();
    expect([...root.folders.keys()]).toEqual([]);
    await tasks.write('tasks.md', '# Tasks\n', null);
    expect(root.folders.get('tasks')?.files.get('tasks.md')?.text).toBe('# Tasks\n');
    expect([...root.files.keys()]).toEqual([]);
  });

  it('is offline when the picked folder has gone away, even before the subfolder exists', async () => {
    const root = new MemoryFolder('Omark');
    root.gone = true;
    await expect(new LocalFolderAdapter(root, { subfolder: 'tasks' }).read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('needs access allowed again when the picked folder lost it', async () => {
    const root = new MemoryFolder('Omark');
    root.permission = 'prompt';
    await expect(new LocalFolderAdapter(root, { subfolder: 'tasks' }).read('tasks.md')).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('refuses a subfolder that is not one plain name', () => {
    for (const subfolder of ['', '.', '..', 'a/b', 'a\\b']) {
      expect(() => new LocalFolderAdapter(new MemoryFolder(), { subfolder })).toThrow(/subfolder/);
    }
  });
});

describe('LocalFolderAdapter', () => {
  it('writes the text to the folder, creating the file', async () => {
    const folder = new MemoryFolder();
    await new LocalFolderAdapter(folder).write('tasks.md', '# Tasks\n', null);
    expect(folder.files.get('tasks.md')?.text).toBe('# Tasks\n');
  });

  it('leaves no empty file behind when creating one fails', async () => {
    const folder = new MemoryFolder();
    folder.failClose = true;
    const adapter = new LocalFolderAdapter(folder);
    await expect(adapter.write('tasks.md', '# Tasks\n', null)).rejects.toMatchObject({ name: 'NoModificationAllowedError' });
    expect(folder.files.has('tasks.md')).toBe(false);
    folder.failClose = false;
    await adapter.write('tasks.md', '# Tasks\n', null);
    expect(folder.files.get('tasks.md')?.text).toBe('# Tasks\n');
  });

  it('keeps an existing file as it was when writing it fails', async () => {
    const folder = new MemoryFolder();
    const adapter = new LocalFolderAdapter(folder);
    const { etag } = await adapter.write('tasks.md', 'a', null);
    folder.failClose = true;
    await expect(adapter.write('tasks.md', 'b', etag)).rejects.toMatchObject({ name: 'NoModificationAllowedError' });
    expect(folder.files.get('tasks.md')?.text).toBe('a');
  });

  it('notices an outside edit of the same size and modified time', async () => {
    const folder = new MemoryFolder();
    const adapter = new LocalFolderAdapter(folder);
    const { etag } = await adapter.write('tasks.md', 'abc', null);
    const before = folder.files.get('tasks.md')!;
    folder.files.set('tasks.md', { text: 'xyz', lastModified: before.lastModified });
    await expect(adapter.write('tasks.md', 'b', etag)).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(folder.files.get('tasks.md')?.text).toBe('xyz');
  });

  it('gives the same etag for the same text, read or written', async () => {
    const folder = new MemoryFolder();
    const adapter = new LocalFolderAdapter(folder);
    const { etag } = await adapter.write('tasks.md', 'zażółć\n', null);
    expect((await adapter.read('tasks.md'))?.etag).toBe(etag);
  });

  it('throws AuthRequiredError for read and write until access is allowed again', async () => {
    const folder = new MemoryFolder();
    folder.external('tasks.md', 'a');
    folder.permission = 'prompt';
    const adapter = new LocalFolderAdapter(folder);
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(adapter.write('tasks.md', 'b', null)).rejects.toBeInstanceOf(AuthRequiredError);
    expect(await requestFolderAccess(folder)).toBe(true);
    expect((await adapter.read('tasks.md'))?.text).toBe('a');
  });

  it('maps a NotAllowedError from the browser to AuthRequiredError', async () => {
    const folder = new MemoryFolder();
    // A handle without the permission methods (older browsers) that still refuses access.
    const bare = {
      kind: 'directory',
      name: 'Tasks',
      keys: () => folder.keys(),
      getFileHandle: async () => {
        throw new DOMException('no', 'NotAllowedError');
      },
    } as unknown as FolderHandle;
    await expect(new LocalFolderAdapter(bare).read('tasks.md')).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('reads a missing file in a present folder as null, and a gone folder as offline', async () => {
    const folder = new MemoryFolder();
    const adapter = new LocalFolderAdapter(folder);
    expect(await adapter.read('done.md')).toBeNull();
    folder.gone = true;
    await expect(adapter.read('done.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('passes other errors through', async () => {
    const folder = new MemoryFolder();
    const odd = {
      ...folder,
      kind: 'directory',
      name: 'Tasks',
      keys: () => folder.keys(),
      getFileHandle: async () => {
        throw new DOMException('a folder', 'TypeMismatchError');
      },
    } as unknown as FolderHandle;
    await expect(new LocalFolderAdapter(odd).read('tasks.md')).rejects.toMatchObject({ name: 'TypeMismatchError' });
  });
});

describe('folder access', () => {
  it('reports the permission state, granted when the handle has no permission methods', async () => {
    const folder = new MemoryFolder();
    expect(await folderAccess(folder)).toBe('granted');
    folder.permission = 'prompt';
    expect(await folderAccess(folder)).toBe('prompt');
    expect(await folderAccess({ kind: 'directory', name: 'x' } as unknown as FolderHandle)).toBe('granted');
  });

  it('requestFolderAccess is false when the user refuses', async () => {
    const folder = new MemoryFolder();
    folder.permission = 'prompt';
    folder.answer = 'denied';
    expect(await requestFolderAccess(folder)).toBe(false);
  });
});

describe('folderSupported and pickFolder', () => {
  it('is supported only where showDirectoryPicker exists', () => {
    expect(folderSupported({})).toBe(false);
    expect(folderSupported({ showDirectoryPicker: async () => new MemoryFolder() })).toBe(true);
  });

  it('picks a folder for reading and writing, and is null when the picker is cancelled', async () => {
    const folder = new MemoryFolder();
    const seen: unknown[] = [];
    const picker = async (opts: unknown) => {
      seen.push(opts);
      return folder;
    };
    expect(await pickFolder({ showDirectoryPicker: picker }, 'tasks')).toBe(folder);
    expect(seen).toEqual([{ id: 'tasks', mode: 'readwrite' }]);
    const cancel = async () => {
      throw new DOMException('cancelled', 'AbortError');
    };
    expect(await pickFolder({ showDirectoryPicker: cancel }, 'tasks')).toBeNull();
  });
});

describe('conflictCopies', () => {
  it('names the sync clients’ copies of the given files, and nothing else', async () => {
    const folder = new MemoryFolder();
    for (const name of [
      'tasks.md',
      'done.md',
      'config.yaml',
      'notes.md',
      'tasks (1).md',
      "tasks (Andrew's conflicted copy 2026-10-27).md",
      'tasks 2.md',
      'done-DESKTOP-4F2K.md',
      'config.sync-conflict-20261027-101500-ABCDEFG.yaml',
      'tasks (1).txt',
      'tasksX.md',
      'mytasks (1).md',
      // Ordinary files a person might keep next to them.
      'tasks-archive.md',
      'done-2025.md',
      'tasks 2026.md',
    ]) {
      folder.external(name, '');
    }
    expect(await conflictCopies(folder, ['tasks.md', 'done.md', 'config.yaml'])).toEqual([
      'config.sync-conflict-20261027-101500-ABCDEFG.yaml',
      'done-DESKTOP-4F2K.md',
      'tasks (1).md',
      "tasks (Andrew's conflicted copy 2026-10-27).md",
      'tasks 2.md',
    ]);
  });

  it('is empty when the folder cannot be listed', async () => {
    const folder = new MemoryFolder();
    folder.gone = true;
    expect(await conflictCopies(folder, ['tasks.md'])).toEqual([]);
  });
});

describe('SavedFolder', () => {
  let n = 0;
  const fresh = (): string => `folder-test-${++n}`;

  it('keeps the handle with an id, and forgets it', async () => {
    const db = fresh();
    // fake-indexeddb clones what it stores, as a browser does; a plain object stands in for the handle.
    const handle = { kind: 'directory', name: 'Tasks' } as unknown as FolderHandle;
    const saved = await new SavedFolder(db).save(handle);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    const loaded = await new SavedFolder(db).load();
    expect(loaded?.id).toBe(saved.id);
    expect(loaded?.handle.name).toBe('Tasks');
    await new SavedFolder(db).forget();
    expect(await new SavedFolder(db).load()).toBeNull();
  });

  it('keeps the id when the same folder is picked again, and makes a new one for another', async () => {
    const db = fresh();
    const store = new SavedFolder(db, memoryStore());
    const a = new MemoryFolder('A');
    const first = await store.save(a);
    expect((await store.save(a)).id).toBe(first.id);
    expect((await store.save(new MemoryFolder('B'))).id).not.toBe(first.id);
  });

  it('keeps the id when asked, for the same folder picked again after a move', async () => {
    const store = new SavedFolder(fresh(), memoryStore());
    const first = await store.save(new MemoryFolder('A'));
    expect((await store.save(new MemoryFolder('A moved'), { keepId: true })).id).toBe(first.id);
    expect((await store.load())?.handle.name).toBe('A moved');
  });

  it('loads as null when IndexedDB fails', async () => {
    const broken = (): UseStore => () => Promise.reject(new Error('blocked'));
    expect(await new SavedFolder(fresh(), broken).load()).toBeNull();
  });
});

/** An idb-keyval store in a Map, without cloning, so a MemoryFolder keeps its methods. */
function memoryStore(): () => UseStore {
  const map = new Map<IDBValidKey, unknown>();
  const objectStore = {
    get: (key: IDBValidKey) => request(map.get(key)),
    put: (value: unknown, key: IDBValidKey) => request(void map.set(key, value)),
    delete: (key: IDBValidKey) => request(void map.delete(key)),
    // idb-keyval's set and del wait for the transaction to complete.
    get transaction() {
      return request(undefined);
    },
  };
  return () => (_mode, callback) => Promise.resolve(callback(objectStore as unknown as IDBObjectStore));
}

function request(result: unknown): IDBRequest {
  const r = { result, error: null, oncomplete: null, onsuccess: null, onerror: null } as unknown as IDBRequest;
  queueMicrotask(() => (r as unknown as { onsuccess?: () => void }).onsuccess?.());
  return r;
}
