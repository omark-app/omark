import type { DriveRoot } from '@taskapp/storage';
import { envForHost, folderFor, hostConfig, lookFor } from './lib/environment.ts';

export const STORAGE_MODE: 'fake' | 'onedrive' =
  import.meta.env.VITE_STORAGE === 'fake' ? 'fake' : 'onedrive';
/** The hosts and folders this build serves, from its build variables. */
export const HOSTS = hostConfig(import.meta.env);
/** Production, staging, a PR preview or local, from the host name (staging and production share one build). */
export const APP_ENV = envForHost(typeof location === 'undefined' ? '' : location.hostname, HOSTS);
export const LOOK = lookFor(APP_ENV);
export const ONEDRIVE_FOLDER: string = folderFor(APP_ENV, import.meta.env.VITE_ONEDRIVE_FOLDER ?? '', HOSTS);
/** `full` reaches the whole drive (the owner's deployment); anything else, the app folder. Must match the helper's `ONEDRIVE_SCOPE`. */
export const ONEDRIVE_ROOT: DriveRoot = import.meta.env.VITE_ONEDRIVE_SCOPE === 'full' ? 'drive' : 'approot';

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
/** Short commit hash of this build (`dev` when unknown), and when it was built (UTC). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'unknown time';
