import type { FolderFileHandle, FolderHandle, FolderPermission } from '../src/local-folder.ts';

const notFound = (what: string): DOMException => new DOMException(`${what} not found`, 'NotFoundError');

/**
 * An in-memory stand-in for a picked folder (`FileSystemDirectoryHandle`): files by name, a permission
 * state, and a switch that makes the folder disappear (renamed, unplugged), as a real handle then throws
 * `NotFoundError` for everything.
 */
export class MemoryFolder implements FolderHandle {
  readonly kind = 'directory';
  readonly files = new Map<string, { text: string; lastModified: number }>();
  permission: FolderPermission = 'granted';
  gone = false;
  /** Makes closing a write stream fail (a lock, a full disk), after the file was created. */
  failClose = false;
  /** Answers to `requestPermission`; the default grants it. */
  answer: FolderPermission = 'granted';
  private clock = 1;

  constructor(readonly name = 'Tasks') {}

  /** Writes a file as another program would. */
  external(name: string, text: string): void {
    this.files.set(name, { text, lastModified: ++this.clock });
  }

  async queryPermission(): Promise<FolderPermission> {
    return this.permission;
  }

  async requestPermission(): Promise<FolderPermission> {
    this.permission = this.answer;
    return this.permission;
  }

  async isSameEntry(other: FolderHandle): Promise<boolean> {
    return other === this;
  }

  async removeEntry(name: string): Promise<void> {
    this.check();
    if (!this.files.delete(name)) throw notFound(name);
  }

  async *keys(): AsyncIterableIterator<string> {
    this.check();
    yield* [...this.files.keys()];
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FolderFileHandle> {
    this.check();
    if (!this.files.has(name)) {
      if (!opts?.create) throw notFound(name);
      this.files.set(name, { text: '', lastModified: ++this.clock });
    }
    return {
      kind: 'file',
      name,
      getFile: async () => {
        this.check();
        const f = this.files.get(name);
        if (!f) throw notFound(name);
        return new File([f.text], name, { lastModified: f.lastModified });
      },
      createWritable: async () => {
        this.check();
        let text = '';
        return {
          write: async (data: string) => {
            text += data;
          },
          abort: async () => {},
          // Like a real handle, the file changes only when the stream closes.
          close: async () => {
            this.check();
            if (this.failClose) throw new DOMException('The file is locked', 'NoModificationAllowedError');
            this.files.set(name, { text, lastModified: ++this.clock });
          },
        };
      },
    };
  }

  private check(): void {
    if (this.gone) throw notFound(this.name);
    if (this.permission !== 'granted') throw new DOMException('Permission needed', 'NotAllowedError');
  }
}
