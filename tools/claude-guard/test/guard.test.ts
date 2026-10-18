import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const GUARD = fileURLToPath(new URL('../guard.mjs', import.meta.url));
const BRANCH = 'issue-14-fix-thing';
let repo = '';

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'guard-'));
  execFileSync('git', ['init', '-q', '-b', BRANCH], { cwd: repo });
});

/** Runs the hook with `input` as its stdin JSON; returns the exit code and stderr. */
function run(input: unknown): { code: number | null; stderr: string } {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const r = spawnSync(process.execPath, [GUARD], { input: raw, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}
const bash = (command: string) => run({ tool_name: 'Bash', tool_input: { command }, cwd: repo });

const blocked: [string, RegExp][] = [
  ['git push origin main', /main/],
  ['git push origin HEAD:main', /main/],
  ['git push origin +main', /main/],
  ['git push origin issue-14:refs/heads/main', /main/],
  ['git push -u origin main', /main/],
  ['git -C /home/user/TaskApp push origin main', /main/],
  ['git -c push.default=current push origin main', /main/],
  ['git push -f', /force/],
  ['git push --force origin issue-14-fix-thing', /force/],
  ['git push --force-with-lease origin issue-14-fix-thing', /force/],
  ['git push origin +issue-14-fix-thing', /force/],
  ['git push --mirror', /mirror|all/],
  ['git push --all origin', /mirror|all/],
  ['git push origin :other-branch', /delete/],
  ['git push origin --delete other-branch', /delete/],
  ['git push -d origin other-branch', /delete/],
  ['gh pr merge 14', /merge/],
  ['gh pr merge --squash 14', /merge/],
  ['gh api -X PUT repos/alipkagit/TaskApp/pulls/14/merge', /merge/],
  ['gh api repos/alipkagit/TaskApp/merges -f base=main -f head=x', /merge/],
  ['pnpm test && git push origin main', /main/],
  ['echo ok; git push origin HEAD:main', /main/],
  ['true || git push origin main', /main/],
  ['echo x | git push origin main', /main/],
  ['cd /tmp\ngit push origin main', /main/],
];

const allowed = [
  'git push -u origin issue-14-fix-thing',
  'git push origin HEAD',
  'git push',
  'git push origin issue-14-fix-thing:issue-14-fix-thing',
  'git push origin --delete issue-14-fix-thing',
  'git log main',
  'git diff origin/main...HEAD',
  'git checkout main',
  'git fetch origin main',
  'git merge origin/main',
  'echo "git push origin main"',
  'gh api repos/alipkagit/TaskApp/pulls/14',
  'gh api repos/alipkagit/TaskApp/issues/14/comments -f body="please merge later"',
  'pnpm test',
];

describe('guard', () => {
  it.each(blocked)('blocks %j', (command, reason) => {
    const r = bash(command);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(reason);
  });

  it.each(allowed)('allows %j', (command) => {
    const r = bash(command);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
  });

  it.each(['git push', 'git push origin HEAD', 'git push -u origin HEAD'])('blocks %j when on main', (command) => {
    const onMain = mkdtempSync(join(tmpdir(), 'guard-main-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: onMain });
    const r = run({ tool_name: 'Bash', tool_input: { command }, cwd: onMain });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/main/);
  });

  it('lets other tools through', () => {
    expect(run({ tool_name: 'Edit', tool_input: { file_path: 'x' } }).code).toBe(0);
  });

  it('lets unreadable input through with a warning', () => {
    const r = run('not json');
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/guard/i);
  });
});
