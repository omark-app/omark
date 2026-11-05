#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks pushes to main, force pushes, deleting other remote branches, merging
// PRs and starting Promote, from Bash and from the GitHub MCP tools (doc/factory.md, The guard). It guards
// Omark only, and lets pushes to main through in fast mode (CLAUDE.md).
// Exit 2 blocks the call, with the reason on stderr; exit 0 lets it run. Best-effort: it reads the command
// line, not what scripts or aliases do.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { dropHeredocs, parse, SHELLS, WRAPPERS } from './command.mjs';

const MAIN = 'main';

// The repositories the guard protects, by name: Omark and its old name. A repository known to be named
// otherwise (a fork renamed, a private notes repo) is not the guard's business; an unknown one is guarded.
const GUARDED = /^(omark|taskapp)$/i;

/**
 * The repository name in a remote URL, path or `owner/repo`, or null when there is none or it is a
 * placeholder such as `{repo}`.
 * @param {string | null | undefined} url
 */
const repoName = (url) => {
  const name = url?.replace(/\/+$/, '').replace(/\.git$/i, '').split(/[/:]/).pop();
  return name && /^[A-Za-z0-9._-]+$/.test(name) ? name : null;
};

/**
 * Whether a repository is known to be one the guard doesn't protect.
 * @param {string | null | undefined} url
 */
const unguarded = (url) => {
  const name = repoName(url);
  return name !== null && !GUARDED.test(name);
};

/**
 * The URLs a push to `remote` from `dir` may reach: all of its push URLs, or every remote's when none is
 * named, since git's default may be any of them. A URL or path is returned as is. Empty when unreadable.
 * @param {string | undefined} dir
 * @param {string | undefined} remote
 * @returns {string[]}
 */
function pushUrls(dir, remote) {
  if (remote !== undefined && /^([a-z][a-z0-9+.-]*:\/\/|[^/]+@[^/]+:|\.{0,2}\/|~)/i.test(remote)) return [remote];
  /** @param {string[]} args */
  const git = (args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  try {
    return (remote === undefined ? git(['remote']) : [remote]).flatMap((r) => git(['remote', 'get-url', '--push', '--all', r]));
  } catch {
    return [];
  }
}

/**
 * Whether the checkout at `dir` is in fast mode: its CLAUDE.md has the "Fast mode until launch" section
 * (CLAUDE.md). Removing the section turns the push-to-main block back on.
 * @param {string | undefined} dir
 */
function fastMode(dir) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^## Fast mode until launch\b/m.test(readFileSync(join(root, 'CLAUDE.md'), 'utf8'));
  } catch {
    return false;
  }
}

/**
 * The current branch in `dir`, or null when it can't be read.
 * @param {string | undefined} dir
 */
function currentBranch(dir) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** @param {string} ref */
const branchName = (ref) => ref.replace(/^refs\/heads\//, '');

/**
 * Why a `git …` command is blocked, or null.
 * @param {string[]} words the words after `git`
 * @param {string | undefined} cwd
 * @param {boolean} sure whether `cwd` is surely where it runs; if not, no other-repository pass and no fast mode
 */
function checkGit(words, cwd, sure) {
  let dir = cwd;
  let i = 0;
  // Global options before the subcommand.
  while (i < words.length && /** @type {string} */ (words[i]).startsWith('-')) {
    const w = /** @type {string} */ (words[i]);
    if (w === '-C') {
      const to = words[i + 1] ?? '';
      dir = resolve(dir ?? process.cwd(), to);
      if (isAbsolute(to)) sure = true;
    }
    if (w === '-C' || w === '-c' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') i++;
    i++;
  }
  if (words[i] !== 'push') return null;

  let force = false;
  let del = false;
  let mirror = false;
  let prune = false;
  let repoOption = false;
  /** @type {string[]} */
  const positional = [];
  for (let j = i + 1; j < words.length; j++) {
    const w = /** @type {string} */ (words[j]);
    if (w.startsWith('--repo')) repoOption = true;
    if (w === '--force' || w.startsWith('--force-with-lease') || w === '--force-if-includes') force = true;
    else if (w === '--delete') del = true;
    else if (w === '--mirror' || w === '--all' || w === '--branches') mirror = true;
    else if (w === '--prune') prune = true;
    else if (w === '-o' || w === '--push-option' || w === '--repo' || w === '--receive-pack' || w === '--exec') j++;
    else if (/^-[a-zA-Z]+$/.test(w)) {
      if (w.includes('f')) force = true;
      if (w.includes('d')) del = true;
      if (w.includes('o')) j++;
    } else if (!w.startsWith('-')) positional.push(w);
  }
  const urls = sure && !repoOption ? pushUrls(dir, positional[0]) : [];
  if (urls.length > 0 && urls.every(unguarded)) return null;
  if (force) return 'force push';
  if (mirror) return 'push with --mirror/--all';
  if (prune) return 'push with --prune (deletes remote branches)';

  const refspecs = positional.slice(1);
  const branch = () => currentBranch(dir);
  const toMain = () => (sure && fastMode(dir) ? null : 'push to main');
  if (refspecs.some((r) => r.includes('*'))) return 'push with a wildcard refspec';
  if (del) {
    const own = branch();
    for (const r of refspecs) if (branchName(r) === MAIN) return 'delete of main';
    for (const r of refspecs) if (branchName(r) !== own) return `delete of the remote branch ${r} (only this session's own branch may be deleted)`;
    return null;
  }
  if (refspecs.length === 0) return branch() === MAIN ? toMain() : null;
  for (const raw of refspecs) {
    const spec = raw.replace(/^\+/, '');
    if (spec.startsWith(':')) {
      const target = branchName(spec.slice(1));
      if (target === MAIN) return 'push to main';
      if (target !== branch()) return `delete of the remote branch ${target} (only this session's own branch may be deleted)`;
      continue;
    }
    const colon = spec.indexOf(':');
    const dst = branchName(colon === -1 ? spec : spec.slice(colon + 1));
    if ((dst === MAIN || ((dst === 'HEAD' || dst === '@') && branch() === MAIN)) && toMain()) return 'push to main';
    if (raw.startsWith('+')) return 'force push';
  }
  return null;
}

const PROMOTE = 'starting Promote to production (a maintainer starts it)';

const GH_API_VALUE_FLAGS = new Set([
  '-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '-q', '--jq',
  '--input', '-t', '--template', '--hostname', '--cache', '-p', '--preview',
]);

/**
 * Why a `gh …` command is blocked, or null.
 * @param {string[]} words the words after `gh`
 */
function checkGh(words) {
  // Merging and Promote are blocked in any repository: gh has too many ways to name the target to tell.
  if (words[0] === 'pr' && words[1] === 'merge') return 'merging a PR (a maintainer merges)';
  if (words[0] === 'workflow' && words[1] === 'run' && /promote/i.test(words[2] ?? '')) return PROMOTE;
  if (words[0] !== 'api') return null;
  let path = null;
  let method = 'GET';
  /** @type {string[]} */
  const fields = [];
  for (let j = 1; j < words.length; j++) {
    const w = /** @type {string} */ (words[j]);
    if (w === '-X' || w === '--method') method = (words[j + 1] ?? '').toUpperCase();
    if (w === '-f' || w === '-F' || w === '--field' || w === '--raw-field') fields.push(words[j + 1] ?? '');
    if (GH_API_VALUE_FLAGS.has(w)) j++;
    else if (!w.startsWith('-') && path === null) path = w;
  }
  if (path === null) return null;
  const bare = path.split('?')[0] ?? '';
  if (!/\.\.|%/.test(bare) && unguarded(/^\/?repos\/[A-Za-z0-9._-]+\/([A-Za-z0-9._-]+)(\/|$)/.exec(bare)?.[1])) return null;
  if (/\/merges?\/?$/.test(bare)) return 'merging through the API (a maintainer merges)';
  if (/\/dispatches\/?$/.test(bare) && /promote/i.test(bare)) return PROMOTE;
  const writes = method !== 'GET' || fields.length > 0;
  if (writes && /\/git\/refs\b/.test(bare)) return 'changing a branch ref through the API';
  if (writes && /\/contents\//.test(bare) && fields.includes(`branch=${MAIN}`)) return 'writing to main through the API';
  if (bare === 'graphql' && words.some((w) => /mergePullRequest|enablePullRequestAutoMerge/.test(w))) {
    return 'merging through the API (a maintainer merges)';
  }
  return null;
}

/**
 * Why a GitHub MCP tool call is blocked, or null.
 * @param {string} tool
 * @param {Record<string, unknown>} input
 */
function checkGitHubTool(tool, input) {
  const name = tool.replace(/^mcp__github__/, '');
  if (typeof input.repo === 'string' && unguarded(input.repo)) return null;
  if (name === 'merge_pull_request' || name === 'enable_pr_auto_merge') return 'merging a PR (a maintainer merges)';
  if (name === 'actions_run_trigger' && /promote/i.test(String(input.workflow_id ?? ''))) return PROMOTE;
  if (input.branch === MAIN && ['push_files', 'create_or_update_file', 'delete_file'].includes(name)) {
    return 'writing to main through the GitHub tools';
  }
  return null;
}

/**
 * Why `command` is blocked, or null when it may run.
 * @param {string} command
 * @param {string | undefined} cwd
 * @param {boolean} [sure] whether `cwd` is surely where it runs
 * @returns {string | null}
 */
function check(command, cwd, sure = true) {
  let dir = cwd;
  // A `cd` is followed only when it surely runs and holds for what follows: no brackets in the line, every
  // command before it ended with `;` or a new line, and it ends with one of those or `&&`. After a `cd` that
  // isn't followed, the guard can't tell where it is and guards as if in Omark.
  let plain = !/[(){}]/.test(command);
  for (const { words, end } of parse(dropHeredocs(command))) {
    // Skip `VAR=value` prefixes and wrappers such as `env` or `sudo`.
    let k = 0;
    while (k < words.length) {
      const w = /** @type {string} */ (words[k]);
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w.split('/').pop() ?? '')) k++;
      else break;
    }
    const name = (words[k] ?? '').split('/').pop();
    const rest = words.slice(k + 1);
    if (name === 'cd') {
      const target = (rest[0] ?? '~').replace(/^~(?=\/|$)/, homedir());
      if (plain && target !== '-' && ['&&', ';', '\n', ''].includes(end)) dir = resolve(dir ?? process.cwd(), target);
      else sure = false;
    }
    plain = plain && [';', '\n'].includes(end);
    if (name === 'cd') continue;
    // `bash -c "…"` and `eval "…"` run their argument as a command line of its own.
    const inner = SHELLS.has(name ?? '') ? rest[rest.indexOf('-c') + 1] : name === 'eval' ? rest.join(' ') : undefined;
    const reason =
      name === 'git' ? checkGit(rest, dir, sure)
      : name === 'gh' ? checkGh(rest)
      : inner !== undefined && (name === 'eval' || rest.includes('-c')) ? check(inner, dir, sure)
      : null;
    if (reason) return reason;
  }
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  /** @type {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} */
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('Omark guard: could not read the hook input; letting the command through.\n');
    return 0;
  }
  const tool = input.tool_name ?? '';
  const args = input.tool_input ?? {};
  const reason =
    tool === 'Bash' && typeof args.command === 'string' ? check(args.command, input.cwd)
    : tool.startsWith('mcp__github__') ? checkGitHubTool(tool, args)
    : null;
  if (!reason) return 0;
  process.stderr.write(`Blocked by the Omark guard: ${reason}. See AGENTS.md, Hard rules.\n`);
  return 2;
}

process.exitCode = await main();
