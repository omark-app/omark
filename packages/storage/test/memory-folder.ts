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
  /** Folders inside this one; they share its permission and go away with it. */
  readonly folders = new Map<string, MemoryFolder>();
  permission: FolderPermission = 'granted';
  gone = false;
  /** Makes closing a write stream fail (a lock, a full disk), after the file was created. */
  failClose = false;
  /** Answers to `requestPermission`; the default grants it. */
  answer: FolderPermission = 'granted';
  private clock = 1;

  constructor(
    readonly name = 'Tasks',
    private readonly parent: MemoryFolder | null = null,
  ) {}

  /** Writes a file as another program would. */
  external(name: string, text: string): void {
    this.files.set(name, { text, lastModified: ++this.clock });
  }

  /** The folder `name` inside this one, made as another program would when missing. */
  sub(name: string): MemoryFolder {
    let folder = this.folders.get(name);
    if (!folder) this.folders.set(name, (folder = new MemoryFolder(name, this)));
    return folder;
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MemoryFolder> {
    this.check();
    if (!this.folders.has(name) && !opts?.create) throw notFound(name);
    return this.sub(name);
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
    yield* [...this.files.keys(), ...this.folders.keys()];
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
    this.parent?.check();
    if (this.gone) throw notFound(this.name);
    if (this.permission !== 'granted') throw new DOMException('Permission needed', 'NotAllowedError');
  }
}
