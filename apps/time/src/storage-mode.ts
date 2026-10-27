/**
 * Where the calendar and the files come from. `google` (the default): the signed-in Google account, its
 * calendar and the chosen storage. `fake`: a fake calendar and a drive in this browser's IndexedDB, with a
 * stubbed sign-in, for the e2e tests and the PR previews. `demo`: the same, seeded for a visitor and past the
 * first run, for `demo-time.omark.app` (spec 12). Pure, so vite.config.ts can read it too.
 */
export type StorageMode = 'fake' | 'demo' | 'google';

/** Reads `VITE_STORAGE`: `fake` and `demo` as they are, anything else is `google`. */
export function storageMode(value: unknown): StorageMode {
  return value === 'fake' || value === 'demo' ? value : 'google';
}
