/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `google` (default) or `fake` (src/storage-mode.ts). */
  readonly VITE_STORAGE?: string;
  /** The folder in My Drive; default "Omark Time". */
  readonly VITE_GOOGLE_FOLDER?: string;
}
