
export interface RemoteFile {
  text: string;
  etag: string;
}

export interface StorageAdapter {
  /** null = the file does not exist. */
  read(name: string): Promise<RemoteFile | null>;
  /** ifMatch null = create only. Throws PreconditionFailedError on mismatch. */
  write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string }>;
}
