export interface RemoteFile {
  text: string;
  etag: string;
  /**
   * Which file the text came from, when the storage can say (Google Drive: the file id). A storage where
   * a name can point at another file than before fills it, so the sync can tell (#67).
   */
  source?: string;
}

export interface StorageAdapter {
  /** null = the file does not exist. */
  read(name: string): Promise<RemoteFile | null>;
  /** ifMatch null = create only. Throws PreconditionFailedError on mismatch. `source` as in `RemoteFile`. */
  write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string; source?: string }>;
}
