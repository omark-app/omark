import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // The app shell, fonts and icons are precached; there is deliberately no runtimeCaching, so Graph,
      // the sign-in helper (/api/auth) and OneDrive download URLs always go straight to the network. A new
      // version installs in the background and, with skipWaiting + clientsClaim, its service worker takes
      // control of the open page at once; the page keeps running the JS it loaded and runs the new JS on
      // the next open (no reload mid-session). With one bundle that is safe; if code splitting is ever
      // added, switch to `prompt`, as cleanupOutdatedCaches would remove chunks a running page still loads.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        // Asset and file-extension URLs are never the SPA, nor the sign-in helper: /api/auth/login and its
        // return must reach the server (an iOS home-screen app navigates to them inside its own scope).
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /^[^?]*\/[^/?]+\.[^/?]+(\?.*)?$/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'TaskApp',
        short_name: 'TaskApp',
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
