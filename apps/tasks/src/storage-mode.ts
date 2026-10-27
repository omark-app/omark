/**
 * Where the files live. `onedrive` (the default): the signed-in account's OneDrive. `demo`: a drive in this
 * browser's IndexedDB, seeded with sample files, with no sign-in. `fake`: an in-memory drive for the e2e tests.
 * Pure, so vite.config.ts can read it too.
 */
export type StorageMode = 'fake' | 'demo' | 'onedrive';

/** Reads `VITE_STORAGE`: `demo` and `fake` as they are, anything else is `onedrive`. */
export function storageMode(value: unknown): StorageMode {
  return value === 'demo' || value === 'fake' ? value : 'onedrive';
}
