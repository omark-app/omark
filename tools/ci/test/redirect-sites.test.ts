import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REDIRECTS, siteFiles, writeSites } from '../redirect-sites.mjs';

describe('redirect sites', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('sends each old host to its part in the one app', () => {
    expect(REDIRECTS).toEqual([
      { project: 'omark-tasks-demo', to: 'https://demo.omark.app/tasks' },
      { project: 'omark-time-demo', to: 'https://demo.omark.app/time' },
      { project: 'omark-time-staging', to: 'https://staging-app.omark.app/time' },
      // The bridge, after the cutover (roadmap 3.6): tasks.alipka.com and its staging.
      { project: 'taskapp', to: 'https://app.omark.app/tasks' },
      { project: 'taskapp-staging', to: 'https://staging-app.omark.app/tasks' },
    ]);
  });

  it('redirects every path with a 301, but serves /sw.js as the retiring service worker first', () => {
    const files = siteFiles('https://demo.omark.app/time');
    // Pages applies redirects before files, so /sw.js needs a rule of its own above the catch-all.
    expect(files._redirects).toBe('/sw.js /retire-sw.js 200\n/* https://demo.omark.app/time 301\n');
    // No _headers: Pages doesn't apply them to a rewritten file, and browsers fetch the worker script past
    // their HTTP cache anyway.
    expect(Object.keys(files).sort()).toEqual(['_redirects', 'retire-sw.js']);
  });

  it('has a service worker that removes itself and its caches, then reloads the open pages', () => {
    const sw = siteFiles('https://x.test/tasks')['retire-sw.js'];
    expect(sw).toContain('skipWaiting()');
    expect(sw).toContain('caches.delete(');
    expect(sw).toContain('registration.unregister()');
    expect(sw).toContain('.navigate(');
    expect(sw).not.toContain('fetch');
  });

  it('writes one folder per project', () => {
    dir = mkdtempSync(join(tmpdir(), 'redirects-'));
    writeSites(dir);
    expect(readdirSync(dir).sort()).toEqual(REDIRECTS.map((r) => r.project).sort());
    for (const r of REDIRECTS) {
      expect(readdirSync(join(dir, r.project)).sort()).toEqual(['_redirects', 'retire-sw.js']);
      expect(readFileSync(join(dir, r.project, '_redirects'), 'utf8')).toContain(` ${r.to} 301`);
    }
  });
});
