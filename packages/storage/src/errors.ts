/** eTag mismatch, or the file already exists on create. */
export class PreconditionFailedError extends Error {
  override name = 'PreconditionFailedError';
}

/** The network is unreachable. */
export class OfflineError extends Error {
  override name = 'OfflineError';
  /**
   * What could not be reached: the storage itself, or the sign-in server (the helper that hands out its access
   * tokens), so the app can name the right one (#157).
   */
  readonly unreachable: 'storage' | 'signin';

  constructor(message?: string, unreachable: 'storage' | 'signin' = 'storage') {
    super(message);
    this.unreachable = unreachable;
  }
}

/** The token was rejected even after a refresh; the user must sign in again. */
export class AuthRequiredError extends Error {
  override name = 'AuthRequiredError';
}

/** The storage has no room left for the write (a full Drive, OneDrive or disk); the sync retries later. */
export class StorageFullError extends Error {
  override name = 'StorageFullError';
}
