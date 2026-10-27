/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `google` (default) or `fake` (src/storage-mode.ts). */
  readonly VITE_STORAGE?: string;
  /** Where the demo's "Use it for real" link goes; default https://omark.app. */
  readonly VITE_REAL_USE_URL?: string;
  /** The folder in My Drive; default "Omark Time". */
  readonly VITE_GOOGLE_FOLDER?: string;
}
