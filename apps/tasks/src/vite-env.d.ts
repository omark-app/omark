/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `onedrive` (default), `demo` or `fake` (src/env.ts). */
  readonly VITE_STORAGE?: string;
  /** Where the demo's "Use it for real" link goes; default https://omark.app. */
  readonly VITE_REAL_USE_URL?: string;
  readonly VITE_PROD_HOST?: string;
  readonly VITE_STAGING_HOST?: string;
  /** Comma-separated. */
  readonly VITE_PREVIEW_HOST_SUFFIXES?: string;
  readonly VITE_PROD_FOLDER?: string;
  readonly VITE_STAGING_FOLDER?: string;
  readonly VITE_ONEDRIVE_SCOPE?: string;
}
