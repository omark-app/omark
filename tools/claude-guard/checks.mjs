#!/usr/bin/env node
// Claude Code PreToolUse hook: before an agent's `git push`, runs the typecheck of the packages the branch changed
// and the unit tests those changes reach, and blocks the push when either fails (#133, doc/factory.md, Checks before
// a push). A docs-only branch pushes at once. It acts only in an Omark checkout (one with this file), and only for
// Claude Code: a person pushing from a terminal is not affected. Exit 2 blocks the call, with the reason on stderr.
import { exec, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dropHeredocs, parse, SHELLS, WRAPPERS } from './command.mjs';

/** Lines of a failing command's output shown to the agent. */
const TAIL = 40;

/**
 * A Git Bash path (`/c/Projects/…`) as Windows reads it (`C:/Projects/…`); anything else as it is.
 * @param {string} path
 * @param {string} [platform]
 */
export function nativePath(path, platform = process.platform) {
  const m = platform === 'win32' ? path.match(/^\/([a-zA-Z])(\/.*)?$/) : null;
  return m ? `${(/** @type {string} */ (m[1])).toUpperCase()}:${m[2] ?? '/'}` : path;
}

/**
 * One parsed command without its leading variables and wrappers (`env`, `nohup`, …): the program and its arguments.
 * @param {string[]} words
 */
function unwrap(words) {
  let k = 0;
  while (k < words.length) {
    const w = /** @type {string} */ (words[k]);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w.split('/').pop() ?? '')) k++;
    else break;
  }
  return { name: (words[k] ?? '').split('/').pop() ?? '', rest: words.slice(k + 1) };
}

/**
 * The command line inside `bash -c` or `eval`, or undefined for any other program.
 * @param {string} name
 * @param {string[]} rest
 */
function innerLine(name, rest) {
  if (name === 'eval') return rest.join(' ');
  return SHELLS.has(name) && rest.includes('-c') ? rest[rest.indexOf('-c') + 1] : undefined;
}

/**
 * Git's arguments read past the global options: the subcommand, what follows it, and the `-C` folders.
 * @param {string[]} rest
 */
function readGit(rest) {
  /** @type {string[]} */
  const dirs = [];
  let i = 0;
  while (i < rest.length && /** @type {string} */ (rest[i]).startsWith('-')) {
    const w = /** @type {string} */ (rest[i]);
    if (w === '-C') dirs.push(rest[i + 1] ?? '');
    if (w === '-C' || w === '-c' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') i++;
    i++;
  }
  return { sub: rest[i], args: rest.slice(i + 1), dirs };
}

/**
 * Whether `git push` with these arguments sends something to check: not a dry run or a push that only deletes.
 * @param {string[]} args
 */
function sendsCommits(args) {
  const flag = (/** @type {string} */ a) => a === '--dry-run' || a === '--delete' || /^-[A-Za-z]*[nd][A-Za-z]*$/.test(a);
  if (args.some(flag)) return false;
  const refs = args.filter((a) => !a.startsWith('-')).slice(1);
  return !(refs.length > 0 && refs.every((r) => r.startsWith(':')));
}

/**
 * The folder a command line pushes from, or null when it pushes nothing that needs checks: no `git push`, a dry
 * run, or a push that only deletes branches. Follows `git -C <dir>`, a `cd <dir>` earlier in the line, wrappers
 * (`env`, `nohup`, …) and `bash -c` / `eval`, as the guard does.
 * @param {string} command
 * @param {string} cwd
 * @returns {string | null}
 */
export function pushDir(command, cwd) {
  let dir = cwd;
  for (const { words } of parse(dropHeredocs(command))) {
    const { name, rest } = unwrap(words);
    if (name === 'cd') {
      dir = resolve(dir, nativePath((rest[0] ?? '~').replace(/^~(?=\/|$)/, homedir())));
      continue;
    }
    const inner = innerLine(name, rest);
    if (inner !== undefined) {
      const found = pushDir(inner, dir);
      if (found !== null) return found;
      continue;
    }
    if (name !== 'git') continue;
    const { sub, args, dirs } = readGit(rest);
    if (sub !== 'push' || !sendsCommits(args)) continue;
    return dirs.reduce((at, d) => resolve(at, nativePath(d)), dir);
  }
  return null;
}

/** Programs that change no file, as long as nothing is redirected. */
const HARMLESS = new Set(['cd', 'pwd', 'echo', 'printf', 'true', 'ls', 'cat', 'wc', 'head', 'tail', 'grep', 'sleep']);

/** Git subcommands that neither commit nor change the files. `add` is here too, unless forced. */
const GIT_HARMLESS = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'remote', 'fetch', 'ls-files', 'branch', 'push', 'add']);

/**
 * Every simple command of a line, with those inside `bash -c` and `eval` in their place.
 * @param {string} command
 * @returns {{ name: string, rest: string[], words: string[] }[]}
 */
function steps(command) {
  return parse(dropHeredocs(command)).flatMap(({ words }) => {
    const { name, rest } = unwrap(words);
    const inner = innerLine(name, rest);
    return inner !== undefined ? steps(inner) : [{ name, rest, words }];
  });
}

/**
 * What a command line does before its last `git push` that sends commits. The hook runs before the line does, so
 * neither that work nor a commit it makes exists yet when the hook reads the branch (#146).
 * `commits`: it may add commits to what is pushed. `plain`: it changes no file itself, so the tree as it is now
 * shows all that a commit can take. Anything the hook can't vouch for counts as not plain.
 * @param {string} command
 * @returns {{ commits: boolean, plain: boolean }}
 */
export function readLine(command) {
  const all = steps(command);
  const pushes = all.flatMap((s, i) => {
    const git = s.name === 'git' ? readGit(s.rest) : null;
    return git?.sub === 'push' && sendsCommits(git.args) ? [i] : [];
  });
  let commits = false;
  let plain = true;
  for (const { name, rest, words } of all.slice(0, pushes.at(-1) ?? 0)) {
    if (name === 'git') {
      const { sub, args } = readGit(rest);
      if (sub === 'commit') {
        commits = true;
      } else if (sub === undefined || !GIT_HARMLESS.has(sub)) {
        // cherry-pick, merge, pull, stash, mv, an alias…
        commits = true;
        plain = false;
      } else if (sub === 'add' && args.some((a) => a === '--force' || /^-[A-Za-z]*f[A-Za-z]*$/.test(a))) {
        plain = false; // takes files git ignores, which the tree doesn't show
      }
    } else if (!HARMLESS.has(name) || words.some((w) => /[<>]/.test(w))) {
      plain = false;
      if (words.includes('git')) commits = true; // `nice -n 5 git commit`: a wrapper with options of its own
    }
  }
  return { commits, plain };
}

/**
 * Whether a command line may add commits before its `git push`.
 * @param {string} command
 */
export const commitsFirst = (command) => readLine(command).commits;

/**
 * Whether every changed file is documentation, which no typecheck or unit test reads.
 * @param {string[]} files
 */
export const onlyDocs = (files) => files.length > 0 && files.every((f) => f.startsWith('doc/') || f.endsWith('.md'));

/** Whether a file belongs to a workspace package (pnpm-workspace.yaml). @param {string} f */
const inPackage = (f) => /^(apps|packages|tools)\/[^/]+\//.test(f) || f.startsWith('brand/');

/** Whether a file outside every package is one no typecheck reads. @param {string} f */
const untyped = (f) => f.startsWith('doc/') || f.endsWith('.md') || f.startsWith('.github/') || f.startsWith('.claude/');

/**
 * The checks to run for the branch's changed files since `base` (where it left main), or for everything when
 * they are unknown (null).
 * @param {string[] | null} files
 * @param {string | null} base
 * @param {string[]} [untracked] those of `files` git doesn't track yet
 * @returns {string[]}
 */
export function commandsFor(files, base, untracked = []) {
  if (files === null || base === null) return ['pnpm typecheck', 'pnpm test'];
  if (onlyDocs(files)) return [];
  /** @type {string[]} */
  const commands = [];
  // A root file (tsconfig.base.json, package.json, the lockfile, functions/) can change how every package
  // typechecks. Otherwise the changed packages and those that depend on them, but not the root package: its
  // typecheck is every package's, and any root file marks it changed. pnpm's filter doesn't see untracked files,
  // so a new file in a package needs them all too.
  if (files.some((f) => !inPackage(f) && !untyped(f)) || untracked.some(inPackage)) commands.push('pnpm typecheck');
  else if (files.some(inPackage)) commands.push(`pnpm -r --filter "...[${base}]" --filter "!omark-tasks" --if-present typecheck`);
  commands.push(`pnpm exec vitest run --changed ${base}`);
  // tools/ci's tests read workflows and config files, which the import graph behind --changed doesn't reach.
  commands.push('pnpm exec vitest run --project ci-scripts');
  return commands;
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

/** @param {string[]} args @param {string} dir */
const git = (args, dir) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The files the branch at `dir` changes since it left origin/main, and that commit, or nulls when they can't be
 * read (no origin/main, a shallow clone). With `uncommitted`, also every changed tracked file and every new file
 * git doesn't ignore: all that a commit in the same line could take, and maybe more, so a check is never missed.
 * A rename counts as both names: the old one may be code. Non-ASCII names come as they are, not quoted.
 * @param {string} dir
 * @param {boolean} [uncommitted]
 * @returns {{ files: string[] | null, base: string | null, untracked?: string[] }}
 */
function changed(dir, uncommitted = false) {
  /** @param {string[]} args */
  const names = (args) => git(['-c', 'core.quotepath=off', ...args], dir).split('\n').filter(Boolean);
  try {
    const base = git(['merge-base', 'origin/main', 'HEAD'], dir);
    const files = names(['diff', '--name-only', '--no-renames', base, 'HEAD']);
    if (!uncommitted) return { files, base };
    const untracked = names(['ls-files', '--others', '--exclude-standard']);
    return { files: [...new Set([...files, ...names(['diff', '--name-only', '--no-renames', 'HEAD']), ...untracked])], base, untracked };
  } catch {
    return { files: null, base: null };
  }
}

/** The top of the checkout at `dir`, or null outside one. @param {string} dir */
function topOf(dir) {
  try {
    return git(['rev-parse', '--show-toplevel'], dir);
  } catch {
    return null;
  }
}

/**
 * The hook's decision for one tool call: exit code 2 with a report blocks it.
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} input
 * @param {{ changed?: typeof changed, run?: typeof runChecks, installed?: (top: string) => boolean }} [deps] stand-ins for tests
 * @returns {Promise<{ code: number, stderr: string }>}
 */
export async function hook(input, deps = {}) {
  const pass = { code: 0, stderr: '' };
  const command = input.tool_input?.command;
  if (input.tool_name !== 'Bash' || typeof command !== 'string') return pass;
  const cwd = input.cwd ?? process.cwd();
  const dir = pushDir(command, cwd);
  if (dir === null) return pass;
  // A folder that can't be read (a path written another way) falls back to where the session is.
  const top = topOf(dir) ?? topOf(cwd);
  if (top === null || !existsSync(join(top, 'tools/claude-guard/checks.mjs'))) return pass;

  const { commits, plain } = readLine(command);
  // A line that changes files itself can't be read in advance: the full checks.
  const { files, base, untracked } = commits && !plain ? { files: null, base: null, untracked: [] } : (deps.changed ?? changed)(top, commits);
  const commands = commandsFor(files, base, untracked);
  if (commands.length === 0) return pass;
  // A new worktree has no node_modules: every check would fail with "not found", which says nothing useful.
  if (!(deps.installed ?? ((t) => existsSync(join(t, 'node_modules'))))(top)) {
    return { code: 2, stderr: `Push blocked by the Omark pre-push checks: dependencies aren't installed in ${top}. Run \`pnpm install\` there and push again.\n` };
  }
  const failed = await (deps.run ?? runChecks)(commands, top);
  if (failed.length === 0) return pass;
  const report = failed.map((f) => `$ ${f.command}\n${f.tail}`).join('\n\n');
  return { code: 2, stderr: `Push blocked by the Omark pre-push checks: fix these first (doc/factory.md, Checks before a push).\n\n${report}\n` };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return 0;
  }
  const { code, stderr } = await hook(input);
  if (stderr) process.stderr.write(stderr);
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
