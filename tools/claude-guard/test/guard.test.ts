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
  ["git push origin 'refs/heads/*:refs/heads/*'", /wildcard/],
  ['git push --prune origin', /prune/],
  ['git push origin --delete main', /main/],
  ['bash -c "git push origin main"', /main/],
  ["sh -c 'git push origin main'", /main/],
  ['eval "git push origin main"', /main/],
  ['env git push origin main', /main/],
  ['command git push origin main', /main/],
  ['sudo git push origin main', /main/],
  ['time git push origin main', /main/],
  ['nohup git push origin main', /main/],
  ['(git push origin main)', /main/],
  ['{ git push origin main; }', /main/],
  ['gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc', /ref/],
  ['gh api -X DELETE repos/o/r/git/refs/heads/other', /ref/],
  ['gh api -X PUT repos/o/r/contents/README.md -f branch=main -f message=x', /main/],
  ['gh workflow run promote.yml', /Promote/],
  ["cat <<'EOF' > x\nhello\nEOF\ngit push origin main", /main/],
  ["bash <<'EOF'\ngit push origin main\nEOF", /main/],
  ["echo hi | sh <<EOF\ngit push origin main\nEOF", /main/],
  ['gh workflow run "Promote to production" --ref x', /Promote/],
  ['gh api -X POST repos/o/r/actions/workflows/promote.yml/dispatches -f ref=main', /Promote/],
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
  'gh api repos/o/r/git/refs/heads/main',
  'gh api -X PUT repos/o/r/contents/f -f branch=issue-14-fix-thing -f message=x',
  'gh workflow run ci.yml',
  'bash -c "pnpm test"',
  "python3 - <<'EOF'\ns = 'git push origin main'\nEOF\npnpm test",
  'cat > notes.md <<EOF\ngh workflow run promote.yml\nEOF',
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

  it.each(['git push', 'git push origin HEAD', 'git push -u origin HEAD', 'git push origin @'])('blocks %j when on main', (command) => {
    const onMain = mkdtempSync(join(tmpdir(), 'guard-main-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: onMain });
    const r = run({ tool_name: 'Bash', tool_input: { command }, cwd: onMain });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/main/);
  });

  it.each([
    ['mcp__github__merge_pull_request', { pullNumber: 15 }, /merge/],
    ['mcp__github__enable_pr_auto_merge', { pullNumber: 15 }, /merge/],
    ['mcp__github__actions_run_trigger', { method: 'run_workflow', workflow_id: 'promote.yml' }, /Promote/],
    ['mcp__github__push_files', { branch: 'main', files: [] }, /main/],
    ['mcp__github__create_or_update_file', { branch: 'main', path: 'x' }, /main/],
    ['mcp__github__delete_file', { branch: 'main', path: 'x' }, /main/],
  ] as const)('blocks the GitHub tool %s', (tool_name, tool_input, reason) => {
    const r = run({ tool_name, tool_input, cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(reason);
  });

  it.each([
    ['mcp__github__push_files', { branch: BRANCH, files: [] }],
    ['mcp__github__actions_run_trigger', { method: 'rerun_failed_jobs', run_id: 1 }],
    ['mcp__github__actions_run_trigger', { method: 'run_workflow', workflow_id: 'ci.yml' }],
    ['mcp__github__create_pull_request', { base: 'main', head: BRANCH }],
  ] as const)('allows the GitHub tool %s', (tool_name, tool_input) => {
    expect(run({ tool_name, tool_input, cwd: repo }).code).toBe(0);
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
