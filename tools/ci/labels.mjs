#!/usr/bin/env node
// Makes the repository's labels match `.github/labels.yml` (#96, doc/factory.md). Without `--apply` it only
// prints what it would create and update. It never deletes a label. Usage: labels.mjs [--apply] [owner/repo]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

/** @typedef {{ name: string, color: string, description: string }} Label */

/**
 * What to create and what to update so that every wanted label exists as written. GitHub matches label
 * names ignoring case, and colours too.
 * @param {Label[]} wanted @param {Label[]} existing
 * @returns {{ create: Label[], update: Label[] }}
 */
export function planLabels(wanted, existing) {
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
  /** @type {Label[]} */
  const create = [];
  /** @type {Label[]} */
  const update = [];
  for (const w of wanted) {
    const e = byName.get(w.name.toLowerCase());
    if (!e) create.push(w);
    else if (e.name !== w.name || e.color.toLowerCase() !== w.color.toLowerCase() || (e.description ?? '') !== w.description) update.push(w);
  }
  return { create, update };
}

/** The repository from `origin`, e.g. owner/repo. */
function originRepo() {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`can't read owner/repo from origin (${url}); pass it as an argument`);
  return /** @type {string} */ (m[1]);
}

function main() {
  const apply = process.argv.includes('--apply');
  const repo = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? originRepo();
  /** @type {Label[]} */
  const wanted = parse(readFileSync(new URL('../../.github/labels.yml', import.meta.url), 'utf8'));
  /** @type {Label[]} */
  const existing = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repo}/labels`], { encoding: 'utf8' })).flat();
  const { create, update } = planLabels(wanted, existing);
  if (create.length + update.length === 0) {
    console.log(`${repo}: every label is up to date.`);
    return 0;
  }
  const current = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
  // gh's own error text reaches the terminal if a call fails.
  /** @type {import('node:child_process').ExecFileSyncOptions} */
  const quiet = { stdio: ['ignore', 'ignore', 'inherit'] };
  for (const l of create) {
    console.log(`create ${l.name} (#${l.color}): ${l.description}`);
    if (apply) execFileSync('gh', ['api', `repos/${repo}/labels`, '-f', `name=${l.name}`, '-f', `color=${l.color}`, '-f', `description=${l.description}`], quiet);
  }
  for (const l of update) {
    const old = /** @type {Label} */ (current.get(l.name.toLowerCase()));
    console.log(`update ${l.name}`);
    if (old.name !== l.name) console.log(`  name: ${old.name} -> ${l.name}`);
    if (old.color.toLowerCase() !== l.color.toLowerCase()) console.log(`  colour: #${old.color} -> #${l.color}`);
    if ((old.description ?? '') !== l.description) console.log(`  description: "${old.description ?? ''}" -> "${l.description}"`);
    if (apply) {
      execFileSync('gh', ['api', '-X', 'PATCH', `repos/${repo}/labels/${encodeURIComponent(old.name)}`, '-f', `new_name=${l.name}`, '-f', `color=${l.color}`, '-f', `description=${l.description}`], quiet);
    }
  }
  if (!apply) console.log('Nothing changed. Run again with --apply to make these changes.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
