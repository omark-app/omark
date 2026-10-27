import { storageMode } from './storage-mode.ts';
import type { StorageMode } from './storage-mode.ts';

export { storageMode } from './storage-mode.ts';
export type { StorageMode } from './storage-mode.ts';

declare const __STORAGE_MODE__: StorageMode | undefined;
/** Written in as a literal by vite.config.ts, so a real build has no fake code; read from the env under Vitest. */
export const STORAGE_MODE: StorageMode =
  typeof __STORAGE_MODE__ === 'string' ? __STORAGE_MODE__ : storageMode(import.meta.env.VITE_STORAGE);

/** The folder in My Drive (spec 7). Staging can name its own with `VITE_GOOGLE_FOLDER`. */
export const GOOGLE_FOLDER: string = (import.meta.env.VITE_GOOGLE_FOLDER ?? '').trim() || 'Omark Time';

declare const __BUILD_ID__: string | undefined;
declare const __BUILD_NUMBER__: number | null | undefined;
/** Short commit hash of this build (`dev` when unknown), and the CI run number that made it. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
export const BUILD_NUMBER: number | null = typeof __BUILD_NUMBER__ === 'number' ? __BUILD_NUMBER__ : null;

/** The public demo (`VITE_STORAGE=demo`): a fake calendar in this browser, no sign-in (spec 12). */
export const IS_DEMO: boolean = STORAGE_MODE === 'demo';
/** Where the demo's "Use it for real" link goes (`VITE_REAL_USE_URL`); omark.app when unset. */
export const REAL_USE_URL: string = (import.meta.env.VITE_REAL_USE_URL ?? '').trim() || 'https://omark.app';
/**
 * The start of every IndexedDB name the app uses. The demo has its own, so it never reads or wipes a real build's
 * copy where both share an origin (localhost).
 */
export const DB_PREFIX: string = IS_DEMO ? 'omark-time-demo' : 'omark-time';
