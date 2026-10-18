/**
 * Which environment this page runs in, from its host name (doc/TaskApp factory spec.md, 6.1). Staging and
 * production run the same build, so the host, not a build variable, picks the OneDrive folder and the look.
 */
export type AppEnv = 'production' | 'staging' | 'preview' | 'local';

export const PRODUCTION_FOLDER = 'ALAI/TaskApp';
export const STAGING_FOLDER = 'ALAI/TaskApp-staging';

export function envForHost(host: string): AppEnv {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'tasks.alipka.com') return 'production';
  if (h === 'tasks-staging.alipka.com') return 'staging';
  if (h.endsWith('.pages.dev')) return 'preview';
  return 'local';
}

/**
 * The OneDrive folder for `env`. Local and preview builds keep the folder they were built with, except that
 * a preview never gets the production folder: the staging build is also served on its pages.dev hosts.
 */
export function folderFor(env: AppEnv, buildFolder: string): string {
  if (env === 'production') return PRODUCTION_FOLDER;
  if (env === 'staging') return STAGING_FOLDER;
  if (env === 'preview' && buildFolder === PRODUCTION_FOLDER) return STAGING_FOLDER;
  return buildFolder;
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
    return { title: 'TaskApp Staging', themeColor: '#F6E7C8', manifest: '/manifest-staging.webmanifest', label: 'STAGING' };
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
