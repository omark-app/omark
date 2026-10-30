import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
  ['gh api -X PUT repos/omark-app/omark/pulls/14/merge', /merge/],
  ['gh api repos/omark-app/omark/merges -f base=main -f head=x', /merge/],
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
  ['gh api -X PATCH repos/omark-app/omark/git/refs/heads/main -f sha=abc', /ref/],
  ['gh api -X DELETE repos/omark-app/omark/git/refs/heads/other', /ref/],
  ['gh api -X PUT repos/omark-app/omark/contents/README.md -f branch=main -f message=x', /main/],
  ['gh workflow run promote.yml', /Promote/],
  ["cat <<'EOF' > x\nhello\nEOF\ngit push origin main", /main/],
  ["bash <<'EOF'\ngit push origin main\nEOF", /main/],
  ["echo hi | sh <<EOF\ngit push origin main\nEOF", /main/],
  ['gh workflow run "Promote to production" --ref x', /Promote/],
  ['gh api -X POST repos/omark-app/omark/actions/workflows/promote.yml/dispatches -f ref=main', /Promote/],
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
  'gh api repos/owner/repo/pulls/14',
  'gh api repos/owner/repo/issues/14/comments -f body="please merge later"',
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

  // The guard blocks every agent, maintainer's or contributor's, so its messages name a role, never a person (#96).
  it.each([
    ...blocked.map(([command]) => ({ tool_name: 'Bash', tool_input: { command } })),
    { tool_name: 'mcp__github__merge_pull_request', tool_input: { pullNumber: 15 } },
    { tool_name: 'mcp__github__actions_run_trigger', tool_input: { method: 'run_workflow', workflow_id: 'promote.yml' } },
  ])('says why in role-neutral words: %j', (input) => {
    const r = run({ ...input, cwd: repo });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^Blocked by the Omark guard: .+\. See AGENTS\.md, Hard rules\.\n$/);
    expect(r.stderr).not.toMatch(/\bAL\b|TaskApp/);
  });

  /** A new repository on `branch` with `origin` at `url`, and a CLAUDE.md holding `claudeMd` when given. */
  function checkout(url: string, branch = 'main', claudeMd?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'guard-remote-'));
    execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
    execFileSync('git', ['remote', 'add', 'origin', url], { cwd: dir });
    if (claudeMd !== undefined) writeFileSync(join(dir, 'CLAUDE.md'), claudeMd);
    return dir;
  }
  const FAST = '# Claude Code notes\n\n## Fast mode until launch (2026-10-28)\n\nPush straight to main.\n';

  // The guard protects Omark (and its old name, TaskApp); another repository, such as a private one, is not its business.
  it.each(['git push origin main', 'git push', 'git push -f origin main', 'git push origin --delete other'])(
    'lets %j through in another repository',
    (command) => {
      const other = checkout('https://github.com/someone/Notes.git');
      expect(run({ tool_name: 'Bash', tool_input: { command }, cwd: other }).code).toBe(0);
    },
  );

  it('follows cd into another repository', () => {
    const other = checkout('git@github.com:someone/notes.git');
    expect(bash(`cd ${other} && git push -u origin main`).code).toBe(0);
    expect(bash(`git -C ${other} push origin main`).code).toBe(0);
  });

  it.each(['https://github.com/omark-app/omark.git', 'https://github.com/someone/TaskApp', 'git@github.com:someone/omark.git'])(
    'still guards a checkout of %s',
    (url) => {
      const r = run({ tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: checkout(url) });
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/main/);
    },
  );

  it.each([
    'gh api -X PUT repos/someone/notes/pulls/1/merge',
    'gh api -X PUT repos/someone/notes/contents/f -f branch=main -f message=x',
  ])('lets %j through for another repository', (command) => {
    expect(bash(command).code).toBe(0);
  });

  // Fail closed: a target the guard can't pin down is guarded.
  it.each([
    ["gh api -X PUT 'repos/{owner}/{repo}/pulls/14/merge'", /merge/],
    ["gh api -X PATCH 'repos/:owner/:repo/git/refs/heads/main' -f sha=x", /ref/],
    ['gh pr merge 1 -R someone/notes', /merge/],
    ['gh pr merge 14 --repo=omark-app/omark', /merge/],
    ['gh workflow run promote.yml -Romark-app/omark', /Promote/],
    ['gh pr merge https://github.com/omark-app/omark/pull/14', /merge/],
    ['GH_REPO=omark-app/omark gh pr merge 14', /merge/],
    ['git push https://github.com/omark-app/omark.GIT main', /main/],
  ])('blocks %j from another repository', (command, reason) => {
    const other = checkout('https://github.com/someone/notes.git');
    const r = run({ tool_name: 'Bash', tool_input: { command }, cwd: other });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(reason);
  });

  it('reads a remote named with a slash, by its push URL', () => {
    const dir = checkout('https://github.com/someone/notes.git');
    execFileSync('git', ['remote', 'add', 'up/stream', 'https://github.com/omark-app/omark.git'], { cwd: dir });
    execFileSync('git', ['remote', 'add', 'fork', 'https://github.com/someone/notes.git'], { cwd: dir });
    execFileSync('git', ['remote', 'set-url', '--push', 'fork', 'https://github.com/omark-app/omark.git'], { cwd: dir });
    for (const command of ['git push up/stream main', 'git push fork main']) {
      expect(run({ tool_name: 'Bash', tool_input: { command }, cwd: dir }).code).toBe(2);
    }
  });

  it('reads every push URL, and every remote when none is named', () => {
    const dir = checkout('https://github.com/someone/notes.git');
    execFileSync('git', ['remote', 'add', 'real', 'https://github.com/omark-app/omark.git'], { cwd: dir });
    execFileSync('git', ['config', 'remote.pushDefault', 'real'], { cwd: dir });
    execFileSync('git', ['remote', 'add', 'two', 'https://github.com/someone/notes.git'], { cwd: dir });
    execFileSync('git', ['remote', 'set-url', '--add', '--push', 'two', 'https://github.com/someone/notes.git'], { cwd: dir });
    execFileSync('git', ['remote', 'set-url', '--add', '--push', 'two', 'https://github.com/omark-app/omark.git'], { cwd: dir });
    for (const command of ['git push', 'git push -f', 'git push two main', 'git push --repo=real main']) {
      expect(run({ tool_name: 'Bash', tool_input: { command }, cwd: dir }).code, command).toBe(2);
    }
  });

  it('blocks a gh api path that climbs out with .. or %', () => {
    expect(bash('gh api -X PUT repos/someone/notes/../../omark-app/omark/pulls/1/merge').code).toBe(2);
    expect(bash('gh api -X PUT repos/someone/notes%2F..%2F..%2Fomark-app/omark/pulls/1/merge').code).toBe(2);
  });

  it.each([
    '(cd OTHER); git push origin main',
    'cd OTHER || git push origin main',
    'cd OTHER | git push origin main',
    '(cd OTHER && git push origin main)',
    'true || cd OTHER; git push origin main',
    'false && cd OTHER; git push origin main',
    '(echo a}; cd OTHER; true); git push origin main',
    'cd OTHER && cd OMARK && git push origin main',
  ])(
    'does not follow the cd in %j',
    (command) => {
      const other = checkout('https://github.com/someone/notes.git');
      const omark = checkout('https://github.com/omark-app/omark.git');
      const r = run({ tool_name: 'Bash', tool_input: { command: command.replace('OTHER', other).replace('OMARK', omark) }, cwd: omark });
      expect(r.code).toBe(2);
    },
  );

  it.each([
    ['mcp__github__push_files', { owner: 'someone', repo: 'notes', branch: 'main', files: [] }],
    ['mcp__github__merge_pull_request', { owner: 'someone', repo: 'notes', pullNumber: 1 }],
  ] as const)('lets the GitHub tool %s through for another repository', (tool_name, tool_input) => {
    expect(run({ tool_name, tool_input, cwd: repo }).code).toBe(0);
  });

  it('still guards the GitHub tools on Omark', () => {
    const r = run({ tool_name: 'mcp__github__push_files', tool_input: { owner: 'omark-app', repo: 'omark', branch: 'main', files: [] }, cwd: repo });
    expect(r.code).toBe(2);
  });

  // Fast mode (CLAUDE.md): while the checkout's CLAUDE.md has the section, pushes to main pass; nothing else changes.
  it.each(['git push origin main', 'git push', 'git push -u origin HEAD', 'git push origin HEAD:main'])(
    'lets %j through in fast mode',
    (command) => {
      const fast = checkout('https://github.com/omark-app/omark.git', 'main', FAST);
      const r = run({ tool_name: 'Bash', tool_input: { command }, cwd: fast });
      expect(r.stderr).toBe('');
      expect(r.code).toBe(0);
    },
  );

  it.each([
    ['git push -f origin main', /force/],
    ['git push origin +main', /force/],
    ['git push origin --delete main', /main/],
    ['gh pr merge 14', /merge/],
    ['gh workflow run promote.yml', /Promote/],
  ])('still blocks %j in fast mode', (command, reason) => {
    const fast = checkout('https://github.com/omark-app/omark.git', 'main', FAST);
    const r = run({ tool_name: 'Bash', tool_input: { command }, cwd: fast });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(reason);
  });

  it('blocks pushes to main once the fast-mode section is gone', () => {
    const slow = checkout('https://github.com/omark-app/omark.git', 'main', '# Claude Code notes\n\n## Skills\n');
    expect(run({ tool_name: 'Bash', tool_input: { command: 'git push origin main' }, cwd: slow }).code).toBe(2);
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
