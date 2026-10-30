import { BRAND } from '../brand.ts';
import type { StorageMode } from '../storage-mode.ts';

/**
 * Which environment this page runs in, from its host name (doc/factory.md, Environments and CI). The hosts
 * come from build variables (VITE_PROD_HOST and so on); with none set, every host is local. Staging and
 * production run the same build, so the host, not a build variable, picks the look.
 */
export type AppEnv = 'production' | 'staging' | 'preview' | 'local';

/** An empty string means unset. */
export interface HostConfig {
  prodHost: string;
  stagingHost: string;
  /** A host is a preview when it is one of these or a subdomain of one. */
  previewSuffixes: string[];
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Reads the host build variables. Takes `import.meta.env` directly, so non-strings count as unset. */
export function hostConfig(vars: { readonly [key: string]: unknown }): HostConfig {
  return {
    prodHost: text(vars.VITE_PROD_HOST).toLowerCase(),
    stagingHost: text(vars.VITE_STAGING_HOST).toLowerCase(),
    previewSuffixes: text(vars.VITE_PREVIEW_HOST_SUFFIXES)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== ''),
  };
}

export function envForHost(host: string, cfg: HostConfig): AppEnv {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (cfg.prodHost !== '' && h === cfg.prodHost) return 'production';
  if (cfg.stagingHost !== '' && h === cfg.stagingHost) return 'staging';
  if (cfg.previewSuffixes.some((s) => h === s || h.endsWith('.' + s))) return 'preview';
  return 'local';
}

/**
 * The Google Drive folder for `env`: one folder in My Drive, named after the app. Local and preview builds
 * use the folder they were built with (`VITE_GOOGLE_FOLDER`), else a Dev one.
 */
export function googleFolderFor(env: AppEnv, buildFolder: string): string {
  if (env === 'production') return BRAND.app;
  if (env === 'staging') return BRAND.stagingApp;
  return buildFolder || `${BRAND.app} Dev`;
}

export type StorageProvider = 'microsoft' | 'google';

/** What the app calls each storage in its texts. */
export const STORAGE_NAMES: Record<StorageProvider, string> = { microsoft: 'OneDrive', google: 'Google Drive' };

/** The sign-in providers this app offers: id in the sign-in helper → its name. The first is the default. */
export const SIGN_IN_NAMES: Record<StorageProvider, string> = { microsoft: 'Microsoft', google: 'Google' };

/** Where the files live: a signed-in account's storage, or a folder picked on this computer. */
export type StorageKind = StorageProvider | 'folder';

/** What the texts call a picked folder. */
export const folderStorageName = (name: string): string => `the folder ${name}`;

/**
 * The offline cache's IndexedDB name: one per storage and folder (a picked folder's is its id), so one adapter
 * never sees another's cached files or version tags.
 */
export function cacheName(kind: StorageKind, folder: string): string {
  return kind === 'microsoft' ? `omark-tasks:${folder}` : `omark-tasks:${kind}:${folder}`;
}

/** The localStorage key for when that cache last synced: one per cache. */
export function syncedAtKey(kind: StorageKind, folder: string): string {
  return kind === 'microsoft' ? `omark-tasks:synced-at:${folder}` : `omark-tasks:synced-at:${kind}:${folder}`;
}

export interface Look {
  /** Page title and home-screen name, or null to keep the built one. */
  title: string | null;
  themeColor: string | null;
  manifest: string | null;
  /** Shown beside the build ID, or null. */
  label: string | null;
}

/** A demo build says DEMO, except on a PR preview (previews are demo builds), which keeps PREVIEW. */
export function lookFor(env: AppEnv, mode: StorageMode = 'onedrive'): Look {
  if (env === 'staging') {
    return { title: BRAND.stagingApp, themeColor: '#F6E7C8', manifest: '/manifest-staging.webmanifest', label: 'STAGING' };
  }
  const label = env === 'preview' ? 'PREVIEW' : mode === 'demo' ? 'DEMO' : null;
  return { title: null, themeColor: null, manifest: null, label };
}

/** Applies `look` to the page before the app mounts, so the home-screen name and colour come from it. */
export function applyLook(look: Look, doc: Document): void {
  if (look.title) {
    doc.title = look.title;
    meta(doc, 'apple-mobile-web-app-title').content = look.title;
  }
  if (look.themeColor) meta(doc, 'theme-color').content = look.themeColor;
  if (look.manifest) {
    let link = doc.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = doc.createElement('link');
      link.rel = 'manifest';
      doc.head.append(link);
    }
    link.href = look.manifest;
  }
}

function meta(doc: Document, name: string): HTMLMetaElement {
  let m = doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!m) {
    m = doc.createElement('meta');
    m.name = name;
    doc.head.append(m);
  }
  return m;
}
