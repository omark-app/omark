/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROD_HOST?: string;
  readonly VITE_STAGING_HOST?: string;
  /** Comma-separated. */
  readonly VITE_PREVIEW_HOST_SUFFIXES?: string;
  readonly VITE_PROD_FOLDER?: string;
  readonly VITE_STAGING_FOLDER?: string;
  readonly VITE_ONEDRIVE_SCOPE?: string;
}
