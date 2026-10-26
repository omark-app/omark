import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..', '..');

/** Every file under `dir` (relative to the repo root) whose name passes `keep`, skipping node_modules. */
function files(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules') continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...files(rel, keep));
    else if (keep(name)) out.push(rel);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/** All matches of `re` (capture group 1) over the files. */
function scan(rels: string[], re: RegExp): Set<string> {
  const found = new Set<string>();
  for (const rel of rels) for (const m of read(rel).matchAll(re)) found.add(m[1]!);
  return found;
}

const isSource = (name: string) => /\.(ts|svelte|mjs)$/.test(name) && !/\.(test|spec)\./.test(name);

/** Where the variables are read, and the pattern that finds them. */
const sources: Record<string, { files: string[]; re: RegExp }> = {
  'build (VITE_*)': { files: [...files('apps/tasks/src', isSource), 'apps/tasks/vite.config.ts', 'apps/tasks/playwright.config.ts'], re: /\b(VITE_[A-Z0-9_]+)\b/g },
  'build (BUILD_*)': { files: ['apps/tasks/vite.config.ts'], re: /process\.env\.(BUILD_[A-Z0-9_]+)/g },
  'sign-in helper': { files: [...files('functions', isSource), ...files('packages/signin/src', isSource)], re: /\benv\.([A-Z][A-Z0-9_]+)/g },
  'e2e-real and Todoist import': {
    files: [...files('apps/tasks/e2e-real', isSource), ...files('tools/todoist-import', isSource)],
    re: /process\.env\.(TASKAPP_E2E_[A-Z]+|TODOIST_[A-Z_]+)/g,
  },
  // Only vars.* and secrets.* are listed. Names that just pass a value between CI steps (PREVIEW_URL, SIGNIN_URL,
  // DEMO_URL, CF_PROJECT, PAGES_DOMAIN, CF_ZONE_ID and so on, set in a step's `env:` from vars or secrets) stay out.
  'workflows (secrets.*)': { files: files('.github/workflows', (n) => /\.ya?ml$/.test(n)), re: /\bsecrets\.((?!GITHUB_TOKEN\b)[A-Z][A-Z0-9_]+)/g },
  'workflows (vars.*)': { files: files('.github/workflows', (n) => /\.ya?ml$/.test(n)), re: /\bvars\.([A-Z][A-Z0-9_]+)/g },
};

describe('.env.example', () => {
  it('exists at the repo root', () => {
    expect(existsSync(join(root, '.env.example'))).toBe(true);
  });

  it('lists every variable the build, the sign-in helper and the workflows read', () => {
    const listed = existsSync(join(root, '.env.example')) ? scan(['.env.example'], /^#?\s*([A-Z][A-Z0-9_]+)=/gm) : new Set<string>();
    const missing: string[] = [];
    for (const [where, { files: rels, re }] of Object.entries(sources)) {
      const names = scan(rels, re);
      expect(names.size, `found no variables in ${where}`).toBeGreaterThan(0);
      for (const name of names) if (!listed.has(name)) missing.push(`${name} (${where})`);
    }
    expect(missing, 'missing from .env.example').toEqual([]);
  });
});
