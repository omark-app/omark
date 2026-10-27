import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// A plain multi-page build: hand-written HTML and one stylesheet, no JavaScript shipped.
export default defineConfig({
  // 'mpa': an unknown path is a 404, as on Cloudflare Pages, not the home page.
  appType: 'mpa',
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Fonts and images stay files, never data: URLs (the CSP allows only 'self').
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        home: page('index.html'),
        privacy: page('privacy/index.html'),
        terms: page('terms/index.html'),
        notFound: page('404.html'),
      },
    },
  },
});
