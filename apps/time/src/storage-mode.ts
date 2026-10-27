/**
 * Where the calendar and the files come from. `google` (the default): the signed-in Google account, its
 * calendar and the chosen storage. `fake`: a fake calendar and a drive in this browser's IndexedDB, with a
 * stubbed sign-in, for the e2e tests and the PR previews. Pure, so vite.config.ts can read it too.
 */
export type StorageMode = 'fake' | 'google';

/** Reads `VITE_STORAGE`: `fake` as it is, anything else is `google`. */
export function storageMode(value: unknown): StorageMode {
  return value === 'fake' ? 'fake' : 'google';
}
