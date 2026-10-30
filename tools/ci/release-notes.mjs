#!/usr/bin/env node
// Promote to production, last step: the app's next <app>-prod- tag and the release notes (the PRs merged since
// its last release tag; for tasks that includes the prod- tags from before the monorepo move), or its commits when no
// pull request was merged (fast mode commits straight to main). Usage, in a full
// clone: release-notes.mjs <sha> <app>. Writes `tag` to $GITHUB_OUTPUT and the notes to release-notes.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The next tag for `today` (YYYY-MM-DD): <app>-prod-YYYY-MM-DD-n, counting up within a day.
 * @param {string[]} tags
 * @param {string} today
 * @param {string} app
 */
export function nextTag(tags, today, app) {
  const prefix = `${app}-prod-${today}-`;
  let n = 0;
  for (const t of tags) {
    if (!t.startsWith(prefix)) continue;
    const k = Number(t.slice(prefix.length));
    if (Number.isInteger(k) && k > n) n = k;
  }
  return `${prefix}${n + 1}`;
}

/**
 * The git patterns for an app's release tags. Tasks was released as prod-YYYY-MM-DD-n before the monorepo move.
 * @param {string} app
 */
export function tagPatterns(app) {
  return app === 'tasks' ? ['tasks-prod-*', 'prod-*'] : [`${app}-prod-*`];
}

/**
 * @param {{ merges: { subject: string, body: string }[], commits?: { short: string, subject: string }[],
 *   rollback: boolean, sha: string }} opts
 *   merges: the merge commits since the last release, newest first; commits: all of them on main's first parent
 */
export function releaseNotes({ merges, commits = [], rollback, sha }) {
  if (rollback) return `Rollback to ${sha}.\n`;
  const lines = [];
  for (const m of merges) {
    const pr = m.subject.match(/^Merge pull request #(\d+) from (\S+)/);
    if (!pr) continue;
    const title = m.body.split('\n')[0]?.trim() || pr[2];
    lines.push(`- #${pr[1]} ${title}`);
  }
  if (lines.length) return `${lines.join('\n')}\n`;
  if (commits.length) return commits.map((c) => `- ${c.subject} (${c.short})\n`).join('');
  return 'No new pull requests since the last release.\n';
}

/** @param {string[]} args */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function main() {
  const [sha, app] = process.argv.slice(2);
  if (!sha || !app) {
    console.log('::error::usage: release-notes.mjs <sha> <app>');
    return 1;
  }
  const patterns = tagPatterns(app);
  const tags = git('tag', '--list', ...patterns).split('\n').filter(Boolean);
  const match = patterns.flatMap((p) => ['--match', p]);
  const last = tags.length ? tryGit('describe', '--tags', '--abbrev=0', ...match, `${sha}^{commit}`) : '';
  // Promoting a commit the last release already contains (an older one) is a rollback.
  const refs = patterns.map((p) => `refs/tags/${p}`);
  const latest = tags.length ? git('for-each-ref', '--sort=-creatordate', '--count=1', '--format=%(refname:short)', ...refs) : '';
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
  const commits = git('log', '--first-parent', '--format=%h%x1f%s', ...range)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [short = '', subject = ''] = line.split('\x1f');
      return { short, subject };
    });
  const tag = nextTag(tags, new Date().toISOString().slice(0, 10), app);
  writeFileSync('release-notes.md', releaseNotes({ merges, commits, rollback, sha: sha.slice(0, 7) }));
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
