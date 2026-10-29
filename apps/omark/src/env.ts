import { APP_ENV, REAL_USE_URL, STORAGE_MODE } from 'tasks/src/env.ts';

/** `REAL_USE_URL`: where the demo's "Use it for real" goes (`VITE_REAL_USE_URL`, default omark.app). */
export { APP_ENV, REAL_USE_URL, STORAGE_MODE };

/**
 * The Omark folder in My Drive (one app spec, section 4). OneDrive needs no name: the app folder is named after
 * the registration (`Apps/Omark`, `Apps/Omark Staging`). Staging, previews and local runs share the staging one.
 */
export const GOOGLE_ROOT = APP_ENV === 'production' ? 'Omark' : 'Omark Staging';

/** Where "Try the demo" goes; unset means the public demo. */
export const DEMO_URL: string = (import.meta.env.VITE_DEMO_URL as string | undefined)?.trim() || 'https://demo.omark.app';
