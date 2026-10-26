import type { DriveRoot } from '@omark/storage';
import { envForHost, folderFor, hostConfig, lookFor } from './lib/environment.ts';

/**
 * Where the files live. `onedrive` (the default): the signed-in account's OneDrive. `demo`: a drive in this
 * browser's IndexedDB, seeded with sample files, with no sign-in. `fake`: an in-memory drive for the e2e tests.
 */
export type StorageMode = 'fake' | 'demo' | 'onedrive';

/** Reads `VITE_STORAGE`: `demo` and `fake` as they are, anything else is `onedrive`. */
export function storageMode(value: unknown): StorageMode {
  return value === 'demo' || value === 'fake' ? value : 'onedrive';
}

/** Reads `VITE_REAL_USE_URL`, where the demo's "Use it for real" link goes; unset or blank means omark.app. */
export function realUseUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  return url === '' ? 'https://omark.app' : url;
}

export const STORAGE_MODE = storageMode(import.meta.env.VITE_STORAGE);
export const REAL_USE_URL = realUseUrl(import.meta.env.VITE_REAL_USE_URL);
/** The hosts and folders this build serves, from its build variables. */
export const HOSTS = hostConfig(import.meta.env);
/** Production, staging, a PR preview or local, from the host name (staging and production share one build). */
export const APP_ENV = envForHost(typeof location === 'undefined' ? '' : location.hostname, HOSTS);
export const LOOK = lookFor(APP_ENV, STORAGE_MODE);
export const ONEDRIVE_FOLDER: string = folderFor(APP_ENV, import.meta.env.VITE_ONEDRIVE_FOLDER ?? '', HOSTS);
/** `full` reaches the whole drive (the owner's deployment); anything else, the app folder. Must match the helper's `ONEDRIVE_SCOPE`. */
export const ONEDRIVE_ROOT: DriveRoot = import.meta.env.VITE_ONEDRIVE_SCOPE === 'full' ? 'drive' : 'approot';

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
declare const __BUILD_NUMBER__: number | null | undefined;
/** Short commit hash of this build (`dev` when unknown), and when it was built (UTC). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'unknown time';
/** The CI run number that made this build (the version shown in the footer), or null outside CI. */
export const BUILD_NUMBER: number | null = typeof __BUILD_NUMBER__ === 'number' ? __BUILD_NUMBER__ : null;
