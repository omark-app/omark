#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks pushes to main, force pushes, deleting other remote branches and
// merging PRs (doc/TaskApp factory spec.md, section 8). Exit 2 blocks the command, with the reason on
// stderr; exit 0 lets it run. Best-effort: the real safety net is that main only reaches staging.
import { execFileSync } from 'node:child_process';

const MAIN = 'main';

/**
 * Splits a shell command into simple commands (on unquoted `&&`, `||`, `;`, `|`, `&` and new lines),
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
    } else if (c === ';' || c === '&' || c === '|' || c === '\n') {
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
  /** @type {string[]} */
  const positional = [];
  for (let j = i + 1; j < words.length; j++) {
    const w = /** @type {string} */ (words[j]);
    if (w === '--force' || w.startsWith('--force-with-lease') || w === '--force-if-includes') force = true;
    else if (w === '--delete') del = true;
    else if (w === '--mirror' || w === '--all' || w === '--branches') mirror = true;
    else if (w === '-o' || w === '--push-option' || w === '--repo' || w === '--receive-pack' || w === '--exec') j++;
    else if (/^-[a-zA-Z]+$/.test(w)) {
      if (w.includes('f')) force = true;
      if (w.includes('d')) del = true;
      if (w.includes('o')) j++;
    } else if (!w.startsWith('-')) positional.push(w);
  }
  if (force) return 'force push';
  if (mirror) return 'push with --mirror/--all';

  const refspecs = positional.slice(1);
  const branch = () => currentBranch(dir);
  if (del) {
    const own = branch();
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
    if (dst === 'HEAD' && branch() === MAIN) return 'push to main';
    if (raw.startsWith('+')) return 'force push';
  }
  return null;
}

const GH_API_VALUE_FLAGS = new Set([
  '-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '-q', '--jq',
  '--input', '-t', '--template', '--hostname', '--cache', '-p', '--preview',
]);

/**
 * Why a `gh …` command is blocked, or null.
 * @param {string[]} words the words after `gh`
 */
function checkGh(words) {
  if (words[0] === 'pr' && words[1] === 'merge') return 'merging a PR (only AL merges)';
  if (words[0] !== 'api') return null;
  let path = null;
  for (let j = 1; j < words.length; j++) {
    const w = /** @type {string} */ (words[j]);
    if (GH_API_VALUE_FLAGS.has(w)) j++;
    else if (!w.startsWith('-') && path === null) path = w;
  }
  if (path === null) return null;
  const bare = path.split('?')[0] ?? '';
  if (/\/merges?\/?$/.test(bare)) return 'merging through the API (only AL merges)';
  if (bare === 'graphql' && words.some((w) => /mergePullRequest|enablePullRequestAutoMerge/.test(w))) {
    return 'merging through the API (only AL merges)';
  }
  return null;
}

/**
 * Why `command` is blocked, or null when it may run.
 * @param {string} command
 * @param {string | undefined} cwd
 */
function check(command, cwd) {
  for (const words of parse(command)) {
    // Skip `VAR=value` prefixes.
    let k = 0;
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(/** @type {string} */ (words[k]))) k++;
    const name = (words[k] ?? '').split('/').pop();
    const rest = words.slice(k + 1);
    const reason = name === 'git' ? checkGit(rest, cwd) : name === 'gh' ? checkGh(rest) : null;
    if (reason) return reason;
  }
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  /** @type {{ tool_name?: string, tool_input?: { command?: unknown }, cwd?: string }} */
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('TaskApp guard: could not read the hook input; letting the command through.\n');
    return 0;
  }
  if (input.tool_name !== 'Bash' || typeof input.tool_input?.command !== 'string') return 0;
  const reason = check(input.tool_input.command, input.cwd);
  if (!reason) return 0;
  process.stderr.write(`Blocked by the TaskApp guard: ${reason}. See CLAUDE.md, Hard rules.\n`);
  return 2;
}

process.exitCode = await main();
