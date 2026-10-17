export type FileName = 'tasks.md' | 'done.md' | 'config.yaml';

export interface RemoteFile {
  text: string;
  etag: string;
}

export interface StorageAdapter {
  /** null = the file does not exist. */
  read(name: FileName): Promise<RemoteFile | null>;
  /** ifMatch null = create only. Throws PreconditionFailedError on mismatch. */
  write(name: FileName, text: string, ifMatch: string | null): Promise<{ etag: string }>;
}
