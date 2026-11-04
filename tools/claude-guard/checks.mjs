#!/usr/bin/env node
// Claude Code PreToolUse hook: before an agent's `git push`, runs the typecheck of the packages the branch changed
// and the unit tests those changes reach, and blocks the push when either fails (#133, doc/factory.md, The guard).
// A docs-only branch pushes at once. It acts only in an Omark checkout (one with this file), and only for Claude
// Code: a person pushing from a terminal is not affected. Exit 2 blocks the call, with the reason on stderr.
import { exec, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dropHeredocs, parse } from './command.mjs';

/** Lines of a failing command's output shown to the agent. */
const TAIL = 40;

/**
 * The folder a command line pushes from, or null when it pushes nothing that needs checks: no `git push`, a dry
 * run, or a push that only deletes branches. Follows `git -C <dir>` and a `cd <dir>` earlier in the line.
 * @param {string} command
 * @param {string} cwd
 * @returns {string | null}
 */
export function pushDir(command, cwd) {
  let dir = cwd;
  for (const { words } of parse(dropHeredocs(command))) {
    let k = 0;
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(/** @type {string} */ (words[k]))) k++;
    const name = (words[k] ?? '').split('/').pop();
    const rest = words.slice(k + 1);
    if (name === 'cd') {
      dir = resolve(dir, (rest[0] ?? '~').replace(/^~(?=\/|$)/, homedir()));
      continue;
    }
    if (name !== 'git') continue;
    let at = dir;
    let i = 0;
    while (i < rest.length && /** @type {string} */ (rest[i]).startsWith('-')) {
      const w = /** @type {string} */ (rest[i]);
      if (w === '-C') at = resolve(at, rest[i + 1] ?? '');
      if (w === '-C' || w === '-c' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') i++;
      i++;
    }
    if (rest[i] !== 'push') continue;
    const args = rest.slice(i + 1);
    if (args.some((a) => a === '--dry-run' || a === '-n' || a === '--delete' || a === '-d')) continue;
    const refs = args.filter((a) => !a.startsWith('-')).slice(1);
    if (refs.length > 0 && refs.every((r) => r.startsWith(':'))) continue;
    return at;
  }
  return null;
}

/**
 * Whether every changed file is documentation, which no typecheck or unit test reads.
 * @param {string[]} files
 */
export const onlyDocs = (files) => files.length > 0 && files.every((f) => f.startsWith('doc/') || f.endsWith('.md'));

/**
 * The checks to run for the branch's changed files, or for everything when they are unknown (null).
 * @param {string[] | null} files
 * @returns {string[]}
 */
export function commandsFor(files) {
  if (files === null) return ['pnpm typecheck', 'pnpm test'];
  if (onlyDocs(files)) return [];
  return [
    // Not the root package: its typecheck is every package's, and any doc change marks it changed.
    'pnpm -r --filter "...[origin/main]" --filter "!omark-tasks" --if-present typecheck',
    'pnpm exec vitest run --changed origin/main',
    // tools/ci's tests read workflows and config files, which the import graph behind --changed doesn't reach.
    'pnpm exec vitest run --project ci-scripts',
  ];
}

/**
 * Runs the commands side by side in `dir`; returns each failing one with the end of its output.
 * @param {string[]} commands
 * @param {string} dir
 * @returns {Promise<{ command: string, tail: string }[]>}
 */
export async function runChecks(commands, dir) {
  const results = await Promise.all(
    commands.map(
      (command) =>
        /** @type {Promise<{ command: string, tail: string } | null>} */ (
          new Promise((done) => {
            exec(command, { cwd: dir, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } }, (error, stdout, stderr) => {
              if (!error) return done(null);
              const lines = `${stdout}${stderr}`.trimEnd().split('\n');
              done({ command, tail: lines.slice(-TAIL).join('\n') });
            });
          })
        ),
    ),
  );
  return results.filter((r) => r !== null);
}

/**
 * The files the branch at `dir` changes since it left origin/main, or null when that can't be read.
 * @param {string} dir
 */
function changedFiles(dir) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/** The top of the checkout at `dir`, or null outside one. @param {string} dir */
function topOf(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  /** @type {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} */
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return 0;
  }
  const command = input.tool_input?.command;
  if (input.tool_name !== 'Bash' || typeof command !== 'string') return 0;
  const dir = pushDir(command, input.cwd ?? process.cwd());
  if (dir === null) return 0;
  const top = topOf(dir);
  if (top === null || !existsSync(join(top, 'tools/claude-guard/checks.mjs'))) return 0;

  const commands = commandsFor(changedFiles(top));
  if (commands.length === 0) return 0;
  const failed = await runChecks(commands, top);
  if (failed.length === 0) return 0;
  const report = failed.map((f) => `$ ${f.command}\n${f.tail}`).join('\n\n');
  process.stderr.write(`Push blocked by the Omark pre-push checks: fix these first (doc/factory.md, The guard).\n\n${report}\n`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
