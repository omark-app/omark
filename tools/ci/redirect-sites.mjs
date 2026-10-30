#!/usr/bin/env node
// The old per-app hosts redirect to their part in the one app (one app spec, section 10; roadmap U.7). Each old
// Pages project gets a tiny site: every path answers 301 to the part's path, except /sw.js, which is a service
// worker that removes the old app's one and its caches, so an installed copy reaches the redirect too. Deployed
// once by hand; the projects are retired in roadmap 3.7. Usage: redirect-sites.mjs <out dir>, then for each
// project: pnpm exec wrangler pages deploy <out dir>/<project> --project-name=<project> --branch=main

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REDIRECTS = [
  { project: 'omark-tasks-demo', to: 'https://demo.omark.app/tasks' },
  { project: 'omark-time-demo', to: 'https://demo.omark.app/time' },
  { project: 'omark-time-staging', to: 'https://staging-app.omark.app/time' },
  // The bridge, after the cutover (roadmap 3.6): tasks.alipka.com and its staging.
  { project: 'taskapp', to: 'https://app.omark.app/tasks' },
  { project: 'taskapp-staging', to: 'https://staging-app.omark.app/tasks' },
];

const RETIRE_SW = `// This app has moved. This service worker replaces the old one, deletes its caches and removes itself, then
// reloads the open pages, which now get the redirect.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })(),
  );
});
`;

/**
 * The files of one redirect site. Pages applies `_redirects` before serving files, so /sw.js is rewritten to the
 * retiring worker by a rule above the catch-all.
 * @param {string} to
 * @returns {Record<string, string>}
 */
export function siteFiles(to) {
  return {
    _redirects: `/sw.js /retire-sw.js 200\n/* ${to} 301\n`,
    'retire-sw.js': RETIRE_SW,
  };
}

/** @param {string} outDir */
export function writeSites(outDir) {
  for (const { project, to } of REDIRECTS) {
    const dir = join(outDir, project);
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(siteFiles(to))) writeFileSync(join(dir, name), text);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) {
    console.log('usage: redirect-sites.mjs <out dir>');
    process.exitCode = 1;
  } else {
    writeSites(out);
    for (const { project } of REDIRECTS) {
      console.log(`pnpm exec wrangler pages deploy ${join(out, project)} --project-name=${project} --branch=main`);
    }
  }
}
