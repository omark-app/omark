// Reading shell command lines, shared by the guard and the pre-push checks (#133).

/** Commands that run the command after them: `env git push` is a push. */
export const WRAPPERS = new Set(['env', 'command', 'sudo', 'time', 'nohup', 'exec', 'xargs', 'nice']);

/** Shells, whose `-c` argument is a command line of its own. */
export const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

/**
 * Drops the bodies of here-documents (`<<EOF` … `EOF`), which are text for a program, not commands; a
 * here-document fed to a shell (`bash <<EOF`) is kept, since the shell runs it.
 * @param {string} command
 */
export function dropHeredocs(command) {
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
 * each a list of words with quotes removed and the operator that ends it.
 * @param {string} command
 * @returns {{ words: string[], end: string }[]}
 */
export function parse(command) {
  /** @type {{ words: string[], end: string }[]} */
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
  /** @param {string} end */
  const endCommand = (end) => {
    endWord();
    if (words.length) commands.push({ words, end });
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
      const end = (c === '&' || c === '|') && command[i + 1] === c ? c + command[++i] : c;
      endCommand(end);
    } else if (c === ' ' || c === '\t') {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand('');
  return commands;
}
