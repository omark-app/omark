export const STORAGE_MODE: 'fake' | 'onedrive' =
  import.meta.env.VITE_STORAGE === 'fake' ? 'fake' : 'onedrive';
export const DEFAULT_ONEDRIVE_FOLDER = 'ALAI/TaskApp';
export const ONEDRIVE_FOLDER: string = import.meta.env.VITE_ONEDRIVE_FOLDER || DEFAULT_ONEDRIVE_FOLDER;
export const MSAL_CLIENT_ID: string = import.meta.env.VITE_MSAL_CLIENT_ID || '';

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
/** Short commit hash of this build (`dev` when unknown), and when it was built (UTC). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'unknown time';
