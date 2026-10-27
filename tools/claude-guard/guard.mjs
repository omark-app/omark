#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks pushes to main, force pushes, deleting other remote branches, merging
// PRs and starting Promote, from Bash and from the GitHub MCP tools (doc/factory.md, The guard).
// Exit 2 blocks the call, with the reason on stderr; exit 0 lets it run. Best-effort: it reads the command
// line, not what scripts or aliases do.
import { execFileSync } from 'node:child_process';

const MAIN = 'main';

/**
 * Drops the bodies of here-documents (`<<EOF` … `EOF`), which are text for a program, not commands; a
 * here-document fed to a shell (`bash <<EOF`) is kept, since the shell runs it.
 * @param {string} command
 */
function dropHeredocs(command) {
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  let pending = [];
  for (const line of command.split('\n')) {
    if (pending.length) {
      if (line.trim() === pending[0]) pending = pending.slice(1);
      continue;
    }
    kept.push(line);
    const shell = /(^|[|;&(]\s*)(\S*\/)?(bash|sh|zsh|dash)\b[^|;&]*<</.test(line);
    for (const m of line.matchAll(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g)) if (!shell) pending.push(/** @type {string} */ (m[2]));
  }
  return kept.join('\n');
}

/**
 * Splits a shell command into simple commands (on unquoted `&&`, `||`, `;`, `|`, `&`, brackets and new lines),
 * each a list of words with quotes removed.
 * @param {string} command
 * @returns {string[][]}
 */
function parse(command) {
  /** @type {string[][]} */
  const commands = [];
  /** @type {string[]} */
  let words = [];
  let word = '';
  let inWord = false;
  /** @type {string | null} */
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = /** @type {string} */ (command[i]);
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === '\\' && i + 1 < command.length) {
      const next = command[++i];
      if (next !== '\n') {
        word += next;
        inWord = true;
      }
    } else if (';&|\n(){}'.includes(c)) {
      endCommand();
    } else if (c === ' ' || c === '\t') {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
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
 */
function checkGit(words, cwd) {
  let dir = cwd;
  let i = 0;
  // Global options before the subcommand.
  while (i < words.length && /** @type {string} */ (words[i]).startsWith('-')) {
    const w = /** @type {string} */ (words[i]);
    if (w === '-C') dir = words[i + 1];
    if (w === '-C' || w === '-c' || w === '--git-dir' || w === '--work-tree' || w === '--namespace') i++;
    i++;
  }
  if (words[i] !== 'push') return null;

  let force = false;
  let del = false;
  let mirror = false;
  let prune = false;
  /** @type {string[]} */
  const positional = [];
  for (let j = i + 1; j < words.length; j++) {
    const w = /** @type {string} */ (words[j]);
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
  if (force) return 'force push';
  if (mirror) return 'push with --mirror/--all';
  if (prune) return 'push with --prune (deletes remote branches)';

  const refspecs = positional.slice(1);
  const branch = () => currentBranch(dir);
  if (refspecs.some((r) => r.includes('*'))) return 'push with a wildcard refspec';
  if (del) {
    const own = branch();
    for (const r of refspecs) if (branchName(r) === MAIN) return 'delete of main';
    for (const r of refspecs) if (branchName(r) !== own) return `delete of the remote branch ${r} (only this session's own branch may be deleted)`;
    return null;
  }
  if (refspecs.length === 0) return branch() === MAIN ? 'push to main' : null;
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
    if (dst === MAIN) return 'push to main';
    if ((dst === 'HEAD' || dst === '@') && branch() === MAIN) return 'push to main';
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

const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'xargs', 'nice']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

/**
 * Why a GitHub MCP tool call is blocked, or null.
 * @param {string} tool
 * @param {Record<string, unknown>} input
 */
function checkGitHubTool(tool, input) {
  const name = tool.replace(/^mcp__github__/, '');
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
 * @returns {string | null}
 */
function check(command, cwd) {
  for (const words of parse(dropHeredocs(command))) {
    // Skip `VAR=value` prefixes and wrappers such as `env` or `sudo`.
    let k = 0;
    while (k < words.length) {
      const w = /** @type {string} */ (words[k]);
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w.split('/').pop() ?? '')) k++;
      else break;
    }
    const name = (words[k] ?? '').split('/').pop();
    const rest = words.slice(k + 1);
    // `bash -c "…"` and `eval "…"` run their argument as a command line of its own.
    const inner = SHELLS.has(name ?? '') ? rest[rest.indexOf('-c') + 1] : name === 'eval' ? rest.join(' ') : undefined;
    const reason =
      name === 'git' ? checkGit(rest, cwd)
      : name === 'gh' ? checkGh(rest)
      : inner !== undefined && (name === 'eval' || rest.includes('-c')) ? check(inner, cwd)
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
