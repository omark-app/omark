#!/usr/bin/env node
// Promote to production, last step: the next prod- tag and the release notes (the PRs merged since the last
// prod- tag). Usage, in a full clone: release-notes.mjs <sha>. Writes `tag` to $GITHUB_OUTPUT and the notes
// to release-notes.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

/**
 * The next tag for `today` (YYYY-MM-DD): prod-YYYY-MM-DD-n, counting up within a day.
 * @param {string[]} tags
 * @param {string} today
 */
export function nextTag(tags, today) {
  const prefix = `prod-${today}-`;
  let n = 0;
  for (const t of tags) {
    if (!t.startsWith(prefix)) continue;
    const k = Number(t.slice(prefix.length));
    if (Number.isInteger(k) && k > n) n = k;
  }
  return `${prefix}${n + 1}`;
}

/**
 * @param {{ merges: { subject: string, body: string }[], rollback: boolean, sha: string }} opts
 *   merges: the merge commits since the last release, newest first
 */
export function releaseNotes({ merges, rollback, sha }) {
  if (rollback) return `Rollback to ${sha}.\n`;
  const lines = [];
  for (const m of merges) {
    const pr = m.subject.match(/^Merge pull request #(\d+) from (\S+)/);
    if (!pr) continue;
    const title = m.body.split('\n')[0]?.trim() || pr[2];
    lines.push(`- #${pr[1]} ${title}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : 'No new pull requests since the last release.\n';
}

/** @param {string[]} args */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function main() {
  const sha = process.argv[2];
  if (!sha) {
    console.log('::error::usage: release-notes.mjs <sha>');
    return 1;
  }
  const tags = git('tag', '--list', 'prod-*').split('\n').filter(Boolean);
  const last = tags.length ? tryGit('describe', '--tags', '--abbrev=0', '--match', 'prod-*', `${sha}^{commit}`) : '';
  // Promoting a commit the last release already contains (an older one) is a rollback.
  const latest = tags.length ? git('for-each-ref', '--sort=-creatordate', '--count=1', '--format=%(refname:short)', 'refs/tags/prod-*') : '';
  const rollback = latest !== '' && git('rev-parse', `${latest}^{commit}`) !== sha && isAncestor(sha, latest);
  const range = last ? [`${last}..${sha}`] : [sha, '-n', '20'];
  const log = git('log', '--merges', '--first-parent', '--format=%s%x1f%b%x1e', ...range);
  const merges = log
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [subject = '', body = ''] = r.split('\x1f');
      return { subject, body };
    });
  const tag = nextTag(tags, new Date().toISOString().slice(0, 10));
  writeFileSync('release-notes.md', releaseNotes({ merges, rollback, sha: sha.slice(0, 7) }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  console.log(`Tag ${tag}`);
  return 0;
}

/** @param {string[]} args */
function tryGit(...args) {
  try {
    return git(...args);
  } catch {
    return '';
  }
}

/** @param {string} a @param {string} b */
function isAncestor(a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b]);
    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
