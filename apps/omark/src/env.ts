import { APP_ENV, STORAGE_MODE } from 'tasks/src/env.ts';

export { APP_ENV, STORAGE_MODE };

/**
 * The Omark folder in My Drive (one app spec, section 4). OneDrive needs no name: the app folder is named after
 * the registration (`Apps/Omark`, `Apps/Omark Staging`). Staging, previews and local runs share the staging one.
 */
export const GOOGLE_ROOT = APP_ENV === 'production' ? 'Omark' : 'Omark Staging';

/** Where "Try the demo" goes; unset means the public demo. */
export const DEMO_URL: string = (import.meta.env.VITE_DEMO_URL as string | undefined)?.trim() || 'https://demo.omark.app';
