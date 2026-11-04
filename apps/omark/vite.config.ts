import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { storageMode } from '../tasks/src/storage-mode.ts';

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

/** The CI run number that made this build (`BUILD_NUMBER`), shown as the version; null outside CI. */
function buildNumber(): number | null {
  const n = (process.env.BUILD_NUMBER ?? '').trim();
  return /^\d+$/.test(n) ? Number(n) : null;
}

/** `version.json`, which Tasks' updates ask for to learn which build is deployed; never precached. */
function versionFile(build: string, number: number | null): Plugin {
  return {
    name: 'omark-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build, number }) });
    },
  };
}

/**
 * The demo world's pictures (src/lib/demo/*.jpg) at `/demo/<name>`, in the demo build only: an `import` of them
 * would emit them in every build, as Vite emits an asset when it loads the module, before tree-shaking drops it.
 */
function demoPictures(on: boolean): Plugin {
  const dir = join(import.meta.dirname, 'src/lib/demo');
  return {
    name: 'omark-demo-pictures',
    apply: 'build',
    generateBundle() {
      if (!on) return;
      for (const name of readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
        this.emitFile({ type: 'asset', fileName: `demo/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}

const BUILD_ID = buildId();
const BUILD_NUMBER = buildNumber();

const storageOf = (mode: string) => storageMode(loadEnv(mode, import.meta.dirname, 'VITE_').VITE_STORAGE);

export default defineConfig(({ mode }) => ({
  // The same build constants as apps/tasks, whose code runs inside this app (Tasks' src/env.ts reads them).
  define: {
    __STORAGE_MODE__: JSON.stringify(storageOf(mode)),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_NUMBER__: JSON.stringify(BUILD_NUMBER),
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME || `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`),
  },
  build: { target: 'es2022' },
  // e2e/environment.spec.ts reaches the preview server under the staging host name (#142).
  preview: { allowedHosts: ['staging-omark.example.test'] },
  plugins: [
    svelte(),
    versionFile(BUILD_ID, BUILD_NUMBER),
    demoPictures(storageOf(mode) === 'demo'),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // As in apps/tasks: the shell is precached with no runtimeCaching, so the storage APIs, the sign-in
      // helper (/api/auth) and version.json always go to the network.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /^[^?]*\/[^/?]+\.[^/?]+(\?.*)?$/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Omark',
        short_name: 'Omark',
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
