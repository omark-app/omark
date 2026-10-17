/** eTag mismatch, or the file already exists on create. */
export class PreconditionFailedError extends Error {
  override name = 'PreconditionFailedError';
}

/** The network is unreachable. */
export class OfflineError extends Error {
  override name = 'OfflineError';
}

/** The token was rejected even after a refresh; the user must sign in again. */
export class AuthRequiredError extends Error {
  override name = 'AuthRequiredError';
}
