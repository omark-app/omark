import { envForHost, folderFor, lookFor } from './lib/environment.ts';

export const STORAGE_MODE: 'fake' | 'onedrive' =
  import.meta.env.VITE_STORAGE === 'fake' ? 'fake' : 'onedrive';
export const DEFAULT_ONEDRIVE_FOLDER = 'ALAI/TaskApp';
/** Production, staging, a PR preview or local, from the host name (staging and production share one build). */
export const APP_ENV = envForHost(typeof location === 'undefined' ? '' : location.hostname);
export const LOOK = lookFor(APP_ENV);
export const ONEDRIVE_FOLDER: string = folderFor(APP_ENV, import.meta.env.VITE_ONEDRIVE_FOLDER || DEFAULT_ONEDRIVE_FOLDER);

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
/** Short commit hash of this build (`dev` when unknown), and when it was built (UTC). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'unknown time';
