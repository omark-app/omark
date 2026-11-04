import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { commandsFor, onlyDocs, pushDir, runChecks } from '../checks.mjs';

const HOOK = fileURLToPath(new URL('../checks.mjs', import.meta.url));
const node = (code: string) => `"${process.execPath}" -e "${code}"`;

describe('pushDir', () => {
  const cwd = join(tmpdir(), 'here');

  it.each([
    'git push',
    'git push -u origin issue-1-x',
    'git push origin HEAD',
    'git status && git push',
    'FOO=1 git push',
  ])('%s is a push from cwd', (command) => {
    expect(pushDir(command, cwd)).toBe(cwd);
  });

  it('follows -C and a cd before it', () => {
    expect(pushDir('git -C sub push', cwd)).toBe(join(cwd, 'sub'));
    expect(pushDir('cd sub && git push', cwd)).toBe(join(cwd, 'sub'));
  });

  it.each([
    'git status',
    'git push --dry-run',
    'git push -n origin x',
    'git push origin --delete issue-1-x',
    'git push -d origin issue-1-x',
    'git push origin :issue-1-x',
    'echo git push',
    'git commit -m "git push later"',
    "cat <<EOF\ngit push\nEOF",
  ])('%s is not a push that needs checks', (command) => {
    expect(pushDir(command, cwd)).toBeNull();
  });
});

describe('onlyDocs', () => {
  it('is true for docs and Markdown only', () => {
    expect(onlyDocs(['doc/a.md', 'README.md', 'apps/site/README.md', 'doc/plans/x.md'])).toBe(true);
  });

  it('is false once one file is code, config or a workflow', () => {
    expect(onlyDocs(['doc/a.md', 'apps/tasks/src/App.svelte'])).toBe(false);
    expect(onlyDocs(['.github/workflows/ci.yml'])).toBe(false);
  });

  it('is false for no files: nothing to compare means nothing is known', () => {
    expect(onlyDocs([])).toBe(false);
  });
});

describe('commandsFor', () => {
  it('runs nothing for docs only', () => {
    expect(commandsFor(['doc/a.md'])).toEqual([]);
  });

  it("runs the changed packages' typecheck, the tests their changes reach, and the repository's own checks", () => {
    // tools/ci's tests read workflows and config files, which no import graph reaches.
    expect(commandsFor(['packages/tasks-core/src/parse.ts'])).toEqual([
      'pnpm -r --filter "...[origin/main]" --if-present typecheck',
      'pnpm exec vitest run --changed origin/main',
      'pnpm exec vitest run --project ci-scripts',
    ]);
  });

  it('runs everything when the changed files are unknown', () => {
    expect(commandsFor(null)).toEqual(['pnpm typecheck', 'pnpm test']);
  });
});

describe('runChecks', () => {
  it('passes when every command does', async () => {
    expect(await runChecks([node('process.exit(0)'), node('process.exit(0)')], process.cwd())).toEqual([]);
  });

  it("names each failing command with the end of its output", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\\n');
    const failed = await runChecks([node(`console.log('${lines}'); process.exit(1)`), node('process.exit(0)')], process.cwd());
    expect(failed).toHaveLength(1);
    expect(failed[0]!.command).toContain('process.exit(1)');
    expect(failed[0]!.tail).toContain('line 59');
    expect(failed[0]!.tail).not.toContain('line 10\n');
  });
});

describe('the hook', () => {
  let repo = '';

  /** Runs the hook with `input` as its stdin JSON; returns the exit code and stderr. */
  const run = (input: unknown) => {
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
    return { code: r.status, stderr: r.stderr };
  };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });

  beforeAll(() => {
    // An Omark checkout in miniature: the hook only acts where tools/claude-guard/checks.mjs exists.
    repo = mkdtempSync(join(tmpdir(), 'checks-'));
    git('init', '-q', '-b', 'main');
    mkdirSync(join(repo, 'tools/claude-guard'), { recursive: true });
    writeFileSync(join(repo, 'tools/claude-guard/checks.mjs'), '');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-qb', 'issue-1-docs');
    mkdirSync(join(repo, 'doc'));
    writeFileSync(join(repo, 'doc/a.md'), 'docs\n');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'docs');
  });

  it('lets a command that is not a push through at once', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: repo }).code).toBe(0);
  });

  it('lets a docs-only branch push without checks', () => {
    const r = run({ tool_name: 'Bash', tool_input: { command: 'git push -u origin issue-1-docs' }, cwd: repo });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('leaves a push outside an Omark checkout alone', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: tmpdir() }).code).toBe(0);
  });

  it('lets unreadable input through', () => {
    const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
