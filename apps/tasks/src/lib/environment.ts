import { BRAND } from '../brand.ts';

/**
 * Which environment this page runs in, from its host name (doc/TaskApp factory spec.md, 6.1). The hosts and
 * folders come from build variables (VITE_PROD_HOST and so on); with none set, every host is local. Staging
 * and production run the same build, so the host, not a build variable, picks the OneDrive folder and the look.
 */
export type AppEnv = 'production' | 'staging' | 'preview' | 'local';

/** An empty string means unset. */
export interface HostConfig {
  prodHost: string;
  stagingHost: string;
  /** A host is a preview when it is one of these or a subdomain of one. */
  previewSuffixes: string[];
  prodFolder: string;
  stagingFolder: string;
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Reads the host and folder build variables. Takes `import.meta.env` directly, so non-strings count as unset. */
export function hostConfig(vars: { readonly [key: string]: unknown }): HostConfig {
  return {
    prodHost: text(vars.VITE_PROD_HOST).toLowerCase(),
    stagingHost: text(vars.VITE_STAGING_HOST).toLowerCase(),
    previewSuffixes: text(vars.VITE_PREVIEW_HOST_SUFFIXES)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== ''),
    prodFolder: text(vars.VITE_PROD_FOLDER),
    stagingFolder: text(vars.VITE_STAGING_FOLDER),
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
 * The OneDrive folder for `env`. Local and preview builds keep the folder they were built with, except that
 * a preview never gets the production folder or an empty one: the staging build is also served on its preview hosts.
 */
export function folderFor(env: AppEnv, buildFolder: string, cfg: HostConfig): string {
  if (env === 'production') return cfg.prodFolder;
  if (env === 'staging') return cfg.stagingFolder;
  if (env === 'preview' && cfg.stagingFolder !== '' && (buildFolder === '' || buildFolder === cfg.prodFolder)) {
    return cfg.stagingFolder;
  }
  return buildFolder;
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

/**
 * The offline cache's IndexedDB name. OneDrive keeps the name it has always had; Google Drive gets its own,
 * so one adapter never sees the other's cached files or version tags.
 */
export function cacheName(provider: StorageProvider, folder: string): string {
  return provider === 'google' ? `taskapp:google:${folder}` : `taskapp:${folder}`;
}

/** The old offline copy was made for the production folder only, so only that folder migrates it. */
export function legacyCacheApplies(folder: string, cfg: HostConfig): boolean {
  return cfg.prodFolder !== '' && folder === cfg.prodFolder;
}

export interface Look {
  /** Page title and home-screen name, or null to keep the built one. */
  title: string | null;
  themeColor: string | null;
  manifest: string | null;
  /** Shown beside the build ID, or null. */
  label: string | null;
}

export function lookFor(env: AppEnv): Look {
  if (env === 'staging') {
    return { title: BRAND.stagingApp, themeColor: '#F6E7C8', manifest: '/manifest-staging.webmanifest', label: 'STAGING' };
  }
  return { title: null, themeColor: null, manifest: null, label: env === 'preview' ? 'PREVIEW' : null };
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
