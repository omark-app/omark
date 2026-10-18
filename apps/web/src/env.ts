export const STORAGE_MODE: 'fake' | 'onedrive' =
  import.meta.env.VITE_STORAGE === 'fake' ? 'fake' : 'onedrive';
export const DEFAULT_ONEDRIVE_FOLDER = 'ALAI/TaskApp';
export const ONEDRIVE_FOLDER: string = import.meta.env.VITE_ONEDRIVE_FOLDER || DEFAULT_ONEDRIVE_FOLDER;
export const MSAL_CLIENT_ID: string = import.meta.env.VITE_MSAL_CLIENT_ID || '';
/** Short commit hash of this build (vite.config.ts), shown beside the sync status. */
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID || 'dev';
