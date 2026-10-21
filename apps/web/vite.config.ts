import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
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

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`),
  },
  // e2e/environment.spec.ts reaches the preview server under the staging host name.
  preview: { allowedHosts: ['staging-tasks.example.test'] },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // The app shell, fonts and icons are precached; there is deliberately no runtimeCaching, so Graph,
      // the sign-in helper (/api/auth) and OneDrive download URLs always go straight to the network. A new
      // version installs in the background and, with skipWaiting + clientsClaim, its service worker takes
      // control of the open page at once; the page keeps running the JS it loaded and runs the new JS on
      // the next open (no reload mid-session). An iOS home-screen app is resumed rather than reopened, so
      // src/lib/updates.ts checks for a new build on every return and reloads on the return after one took
      // over. With one bundle that is safe; if code splitting is ever added, switch to `prompt`, as
      // cleanupOutdatedCaches would remove chunks a running page still loads.
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
