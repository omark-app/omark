import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTag, releaseNotes, tagPatterns } from '../release-notes.mjs';

describe('nextTag', () => {
  it('starts at 1 each day', () => {
    expect(nextTag(['tasks-prod-2026-10-17-1', 'tasks-prod-2026-10-17-2'], '2026-10-18', 'tasks')).toBe('tasks-prod-2026-10-18-1');
  });
  it('counts up within a day, past 9', () => {
    expect(nextTag(['tasks-prod-2026-10-18-1', 'tasks-prod-2026-10-18-10', 'tasks-prod-2026-10-18-2'], '2026-10-18', 'tasks')).toBe('tasks-prod-2026-10-18-11');
  });
  it('ignores other tags', () => {
    expect(nextTag(['v1', 'tasks-prod-2026-10-18-x', 'time-prod-2026-10-18-4'], '2026-10-18', 'tasks')).toBe('tasks-prod-2026-10-18-1');
  });
  it('names the app, starting at 1 after the legacy prod- tags', () => {
    expect(nextTag(['prod-2026-10-22-1'], '2026-11-02', 'tasks')).toBe('tasks-prod-2026-11-02-1');
    expect(nextTag(['prod-2026-11-02-1'], '2026-11-02', 'tasks')).toBe('tasks-prod-2026-11-02-1');
    expect(nextTag(['tasks-prod-2026-11-02-1'], '2026-11-02', 'tasks')).toBe('tasks-prod-2026-11-02-2');
  });
});

describe('tagPatterns', () => {
  it('includes the legacy prod- tags for tasks only', () => {
    expect(tagPatterns('tasks')).toEqual(['tasks-prod-*', 'prod-*']);
    expect(tagPatterns('time')).toEqual(['time-prod-*']);
  });
});

// These spawn git and node many times: well past Vitest's default 5 s on a busy machine or a CI runner.
describe('release-notes.mjs in a repository', { timeout: 30_000 }, () => {
  const script = fileURLToPath(new URL('../release-notes.mjs', import.meta.url));
  let dir = '';
  let day = 0;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });
  /** Each commit a day later, so tags sort by date the way they would in real life. */
  const git = (...args: string[]) => {
    const date = `2026-10-${String(10 + day).padStart(2, '0')}T12:00:00Z`;
    return execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).trim();
  };
  /** A PR's commit and its merge into main, as GitHub makes them; built with plumbing, without touching files. */
  const merge = (n: number, title: string) => {
    day++;
    const work = git('commit-tree', 'main^{tree}', '-p', 'main', '-m', `Work for #${n}`);
    const merged = git('commit-tree', 'main^{tree}', '-p', 'main', '-p', work, '-m', `Merge pull request #${n} from owner/pr-${n}`, '-m', title);
    git('update-ref', 'refs/heads/main', merged);
    return merged;
  };
  const run = (sha: string, app: string) => {
    const out = join(dir, 'github-output');
    execFileSync(process.execPath, [script, sha, app], { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: out } });
    return { notes: readFileSync(join(dir, 'release-notes.md'), 'utf8'), output: readFileSync(out, 'utf8') };
  };
  const repo = () => {
    dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
    day = 0;
    git('init', '-q', '-b', 'main');
    git('commit', '-q', '--allow-empty', '-m', 'Start');
  };

  it('lists the PRs since the last legacy prod- tag in the first tasks-prod- release', () => {
    repo();
    git('tag', 'prod-2026-10-11-1', merge(1, 'Old work'));
    const head = merge(2, 'New work');
    const { notes, output } = run(head, 'tasks');
    expect(notes).toBe('- #2 New work\n');
    expect(output).toMatch(/^tag=tasks-prod-\d{4}-\d{2}-\d{2}-1\n$/);
  });

  it('takes a legacy prod- tag older than the last tasks-prod- tag as a rollback', () => {
    repo();
    const old = merge(1, 'Old work');
    git('tag', 'prod-2026-10-11-1', old);
    git('tag', 'tasks-prod-2026-10-12-1', merge(2, 'New work'));
    expect(run(old, 'tasks').notes).toBe(`Rollback to ${old.slice(0, 7)}.\n`);
  });

  it('lists the PRs since the last tasks-prod- tag', () => {
    repo();
    git('tag', 'prod-2026-10-11-1', merge(1, 'Old work'));
    git('tag', 'tasks-prod-2026-10-12-1', merge(2, 'New work'));
    expect(run(merge(3, 'Newer work'), 'tasks').notes).toBe('- #3 Newer work\n');
  });
});

describe('releaseNotes', () => {
  const merges = [
    { subject: 'Merge pull request #16 from owner/issue-16-x', body: 'Fix the toast on iPhone\n' },
    { subject: 'Merge pull request #15 from owner/factory-spec', body: '' },
    { subject: 'Merge main into issue-16-x', body: '' },
  ];

  it('lists the merged PRs with their titles', () => {
    expect(releaseNotes({ merges, rollback: false, sha: 'abc1234' })).toBe(
      '- #16 Fix the toast on iPhone\n- #15 owner/factory-spec\n',
    );
  });

  it('says so when nothing was merged', () => {
    expect(releaseNotes({ merges: [], rollback: false, sha: 'abc1234' })).toBe('No new pull requests since the last release.\n');
  });

  it('marks a rollback', () => {
    expect(releaseNotes({ merges: [], rollback: true, sha: 'abc1234' })).toBe('Rollback to abc1234.\n');
  });

  it('lists the commits when no pull requests were merged (commits straight to main)', () => {
    const commits = [
      { short: 'bbb2222', subject: 'Fix the U.7 review findings' },
      { short: 'aaa1111', subject: 'Deploy the one app (U.7)' },
    ];
    expect(releaseNotes({ merges: [], commits, rollback: false, sha: 'abc1234' })).toBe(
      '- Fix the U.7 review findings (bbb2222)\n- Deploy the one app (U.7) (aaa1111)\n',
    );
    // Pull requests win when there are any.
    expect(releaseNotes({ merges, commits, rollback: false, sha: 'abc1234' })).toContain('- #16 ');
  });
});
