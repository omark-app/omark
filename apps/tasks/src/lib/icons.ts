import type { AppEnv } from './environment.ts';

/** The three icon links in index.html. */
export interface PageIcons {
  favicon: string;
  favicon32: string;
  appleTouch: string;
}

/** Staging has its own icons (beige, so it is not mistaken for production). Null: keep the links in index.html. */
export function iconsFor(env: AppEnv): PageIcons | null {
  if (env !== 'staging') return null;
  return {
    favicon: '/icons/staging/favicon.svg',
    favicon32: '/icons/staging/favicon-32.png',
    appleTouch: '/icons/staging/apple-touch-icon.png',
  };
}

/** Points the icon links of `doc` at `icons`. */
export function applyIcons(icons: PageIcons, doc: Document): void {
  const set = (selector: string, href: string) => doc.head.querySelector(selector)?.setAttribute('href', href);
  set('link[rel="icon"][type="image/svg+xml"]', icons.favicon);
  set('link[rel="icon"][sizes="32x32"]', icons.favicon32);
  set('link[rel="apple-touch-icon"]', icons.appleTouch);
}
