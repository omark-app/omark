/** How many versions `StorageAdapter.landed` looks back through, the current one included. */
export const LANDED_LOOKBACK = 25;

export interface RemoteFile {
  text: string;
  etag: string;
  /**
   * Which file the text came from, when the storage can say (Google Drive: the file id). A storage where
   * a name can point at another file than before fills it, so the sync can tell (#67).
   */
  source?: string;
}

/** What a sync already has of a file: the eTag of its base, and its source where the storage gives one. */
export interface KnownVersion {
  etag: string;
  source?: string;
}

export interface StorageAdapter {
  /** null = the file does not exist. */
  read(name: string): Promise<RemoteFile | null>;
  /**
   * Like `read`, but `'unchanged'` when the file the name points at still has `known`'s eTag (and source, when
   * given), without downloading it (#158). For storages where the content costs a request of its own.
   */
  readIfChanged?(name: string, known: KnownVersion): Promise<RemoteFile | null | 'unchanged'>;
  /** ifMatch null = create only. Throws PreconditionFailedError on mismatch. `source` as in `RemoteFile`. */
  write(name: string, text: string, ifMatch: string | null): Promise<{ etag: string; source?: string }>;
  /** Whether the file a `source` names is still there (out of the trash), for storages that give sources. */
  exists?(source: string): Promise<boolean>;
  /**
   * Which of `texts` the file held most recently, looking back through the versions the storage keeps (at most
   * `LANDED_LOOKBACK`, the current one included) but no further than the latest one holding `base`: a write sent
   * on that base can only have landed after it. Null when none of them is there. For storages with a version
   * history: the sync asks it whether a write whose reply was lost landed (#161).
   */
  landed?(name: string, texts: string[], base: string): Promise<string | null>;
}

/**
 * Binary files (Goals' pictures), read whole and created once: never replaced, so no etags or merges. The
 * same errors as `StorageAdapter` (OfflineError, AuthRequiredError, StorageFullError).
 */
export interface BinaryStore {
  /** null = the file does not exist. */
  readBytes(name: string): Promise<Blob | null>;
  /** Create only: PreconditionFailedError when a file of that name is there. */
  createBytes(name: string, data: Blob): Promise<void>;
}

/** The media type a binary file is saved and read as, from its name. */
export function binaryType(name: string): string {
  return /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.png$/i.test(name) ? 'image/png' : 'application/octet-stream';
}
