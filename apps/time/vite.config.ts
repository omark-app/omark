import { execFileSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { storageMode } from './src/storage-mode.ts';

/** The short commit hash shown in the footer, so it is clear which build a device runs. */
function buildId(): string {
  const sha = process.env.BUILD_SHA || process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'dev';
  }
}

/** The CI run number that made this build (`BUILD_NUMBER`); null outside CI. */
function buildNumber(): number | null {
  const n = (process.env.BUILD_NUMBER ?? '').trim();
  return /^\d+$/.test(n) ? Number(n) : null;
}

/** `version.json` (`{"build":"<id>","number":<n>}`), never precached; public/_headers serves it `no-store`. */
function versionFile(build: string, number: number | null): Plugin {
  return {
    name: 'omark-time-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build, number }) });
    },
  };
}

const BUILD_ID = buildId();
const BUILD_NUMBER = buildNumber();

export default defineConfig(({ mode }) => ({
  define: {
    // A literal, so each build keeps only its own mode's code (src/env.ts).
    __STORAGE_MODE__: JSON.stringify(storageMode(loadEnv(mode, import.meta.dirname, 'VITE_').VITE_STORAGE)),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_NUMBER__: JSON.stringify(BUILD_NUMBER),
  },
  build: { target: 'es2022' },
  plugins: [
    svelte(),
    versionFile(BUILD_ID, BUILD_NUMBER),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // As in apps/tasks: the shell is precached and there is no runtimeCaching, so Google's APIs, the
      // sign-in helper (/api/auth) and version.json always go to the network.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /^[^?]*\/[^/?]+\.[^/?]+(\?.*)?$/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Omark Time',
        short_name: 'Omark Time',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#F2F4F7',
        background_color: '#F2F4F7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
}));
