import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/brand.ts';

/** The short commit hash shown beside the save status, so it is clear which build a device runs. */
function buildId(): string {
  // BUILD_SHA: Promote rebuilding an older commit (GITHUB_SHA is then main's tip and can't be overridden).
  const sha = process.env.BUILD_SHA || process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'dev';
  }
}

/**
 * Emits `version.json` (`{"build":"<id>"}`), which src/lib/updates.svelte.ts asks for to learn which build
 * is deployed. It is never precached (`globPatterns` has no json) and public/_headers serves it `no-store`.
 */
function versionFile(build: string): Plugin {
  return {
    name: 'taskapp-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) });
    },
  };
}

const BUILD_ID = buildId();

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`),
  },
  // e2e/environment.spec.ts reaches the preview server under the staging host name.
  preview: { allowedHosts: ['staging-tasks.example.test'] },
  plugins: [
    svelte(),
    versionFile(BUILD_ID),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // The app shell, fonts and icons are precached; there is deliberately no runtimeCaching, so Graph,
      // the sign-in helper (/api/auth), OneDrive download URLs and version.json always go straight to the
      // network. Navigations are served from the precache, so a page opened after a deploy starts on the
      // old build. src/lib/updates.svelte.ts therefore asks version.json which build is deployed (on open,
      // on return, on focus or coming online, and every 30 minutes) and, when it is newer, saves the edits
      // and reloads: at once on open or return unless something is in progress, otherwise once the page
      // is idle and nothing is in progress (the footer offers "New version · tap to update" meanwhile).
      // Before that reload it lets the new service worker (skipWaiting + clientsClaim) take control, or, if
      // none does within 10 s (30 s while one is installing), removes the worker so the reload comes from
      // the network. public/_headers serves sw.js `no-cache` and
      // version.json `no-store`. With one bundle the old page never needs files the new worker removed;
      // if code splitting is ever added, switch to `prompt`, as cleanupOutdatedCaches would remove chunks
      // a running page still loads.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        // Asset and file-extension URLs are never the SPA, nor the sign-in helper: /api/auth/login and its
        // return must reach the server (an iOS home-screen app navigates to them inside its own scope).
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /^[^?]*\/[^/?]+\.[^/?]+(\?.*)?$/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: BRAND.app,
        short_name: BRAND.app,
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#F2F4F7',
        background_color: '#F2F4F7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
