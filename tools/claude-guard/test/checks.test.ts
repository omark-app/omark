import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { commandsFor, commitsFirst, hook, nativePath, onlyDocs, pushDir, runChecks } from '../checks.mjs';

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
    'env git push',
    'nohup git push origin x',
    'bash -c "git push"',
    'sh -c "git status; git push -u origin x"',
    'eval git push',
  ])('%s is a push from cwd', (command) => {
    expect(pushDir(command, cwd)).toBe(cwd);
  });

  it('follows -C and a cd before it', () => {
    expect(pushDir('git -C sub push', cwd)).toBe(join(cwd, 'sub'));
    expect(pushDir('cd sub && git push', cwd)).toBe(join(cwd, 'sub'));
  });

  it('reads Git Bash paths on Windows (#133 review)', () => {
    expect(nativePath('/c/Projects/TaskApp', 'win32')).toBe('C:/Projects/TaskApp');
    expect(nativePath('/d', 'win32')).toBe('D:/');
    expect(nativePath('/c/Projects/TaskApp', 'linux')).toBe('/c/Projects/TaskApp');
    expect(nativePath('sub/dir', 'win32')).toBe('sub/dir');
  });

  it.each([
    'git status',
    'git push --dry-run',
    'git push -n origin x',
    'git push -nu origin x',
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

describe('commitsFirst (#146)', () => {
  it.each([
    'git add x && git commit -m y && git push',
    'git commit -am y; git push',
    'git -C sub commit -m y && git -C sub push',
    'cd sub && git commit -m y && git push -u origin x',
    'bash -c "git commit -m y && git push"',
    'env git commit -m y && git push',
  ])('%s commits before it pushes', (command) => {
    expect(commitsFirst(command)).toBe(true);
  });

  it.each([
    'git push',
    'git status && git push',
    'echo git commit && git push',
    'git push && git commit -m y',
    'git log --grep commit && git push',
    "cat <<EOF\ngit commit\nEOF\ngit push",
  ])('%s does not', (command) => {
    expect(commitsFirst(command)).toBe(false);
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
    expect(commandsFor(['doc/a.md'], 'abc123')).toEqual([]);
  });

  it("runs the changed packages' typecheck, the tests their changes reach, and the repository's own checks", () => {
    // Compared with where the branch left main, so commits main got since then don't count.
    // tools/ci's tests read workflows and config files, which no import graph reaches.
    expect(commandsFor(['packages/tasks-core/src/parse.ts'], 'abc123')).toEqual([
      'pnpm -r --filter "...[abc123]" --filter "!omark-tasks" --if-present typecheck',
      'pnpm exec vitest run --changed abc123',
      'pnpm exec vitest run --project ci-scripts',
    ]);
  });

  it.each(['tsconfig.base.json', 'package.json', 'pnpm-lock.yaml', 'functions/api/auth/[[path]].ts'])(
    'typechecks everything when %s, outside every package, changes (#133 review)',
    (file) => {
      expect(commandsFor(['apps/tasks/src/a.ts', file], 'abc123')[0]).toBe('pnpm typecheck');
    },
  );

  it('needs no typecheck for workflows and Claude settings, only the repository checks', () => {
    expect(commandsFor(['.github/workflows/ci.yml', '.claude/settings.json'], 'abc123')).toEqual([
      'pnpm exec vitest run --changed abc123',
      'pnpm exec vitest run --project ci-scripts',
    ]);
  });

  it('runs everything when the changed files are unknown', () => {
    expect(commandsFor(null, null)).toEqual(['pnpm typecheck', 'pnpm test']);
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

  // The rest calls the hook's logic with the checks themselves stubbed out: the real ones are pnpm commands.
  const push = (cwd: string) => ({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd });
  const code = (files: string[] | null) => {
    const ran: string[][] = [];
    const deps = {
      changed: () => ({ files, base: files === null ? null : 'abc123' }),
      installed: () => true,
      run: async (commands: string[]) => {
        ran.push(commands);
        return [{ command: commands[0]!, tail: 'src/a.ts(1,1): error TS2322' }];
      },
    };
    return { deps, ran };
  };

  it('blocks a push whose checks fail, with each failing command and the end of its output', async () => {
    const { deps } = code(['apps/tasks/src/a.ts']);
    const r = await hook(push(repo), deps);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Push blocked by the Omark pre-push checks');
    expect(r.stderr).toContain('$ pnpm -r --filter "...[abc123]"');
    expect(r.stderr).toContain('error TS2322');
  });

  it('runs the full checks when the changed files cannot be read', async () => {
    const { deps, ran } = code(null);
    await hook(push(repo), deps);
    expect(ran).toEqual([['pnpm typecheck', 'pnpm test']]);
  });

  it('works from a folder inside the checkout', async () => {
    mkdirSync(join(repo, 'apps/x'), { recursive: true });
    const { deps, ran } = code(['apps/tasks/src/a.ts']);
    expect((await hook(push(join(repo, 'apps/x')), deps)).code).toBe(2);
    expect(ran).toHaveLength(1);
  });

  it('checks from where the session is when the pushed folder cannot be found', async () => {
    const { deps, ran } = code(['apps/tasks/src/a.ts']);
    const r = await hook({ tool_name: 'Bash', tool_input: { command: 'cd /no/such/folder && git push' }, cwd: repo }, deps);
    expect(r.code).toBe(2);
    expect(ran).toHaveLength(1);
  });

  describe('a line that commits and pushes (#146)', () => {
    /** A branch with nothing committed yet, at origin/main, and `file` new in the working tree. */
    const freshBranch = (file: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'checks-fresh-'));
      const g = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
      g('init', '-q', '-b', 'main');
      mkdirSync(join(dir, 'tools/claude-guard'), { recursive: true });
      writeFileSync(join(dir, 'tools/claude-guard/checks.mjs'), '');
      g('add', '.');
      g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
      g('update-ref', 'refs/remotes/origin/main', 'HEAD');
      g('checkout', '-qb', 'issue-1-x');
      mkdirSync(join(dir, dirname(file)), { recursive: true });
      writeFileSync(join(dir, file), 'new\n');
      return dir;
    };
    const line = (file: string) => `git add ${file} && git commit -m x && git push -u origin issue-1-x`;
    const stubs = () => {
      const ran: string[][] = [];
      return {
        ran,
        deps: {
          installed: () => true,
          run: async (commands: string[]) => {
            ran.push(commands);
            return [];
          },
        },
      };
    };

    it('lets a docs-only commit push without checks', () => {
      const r = run({ tool_name: 'Bash', tool_input: { command: line('doc/b.md') }, cwd: freshBranch('doc/b.md') });
      expect(r.stderr).toBe('');
      expect(r.code).toBe(0);
    });

    it('runs the checks for a commit with code in it', async () => {
      const { deps, ran } = stubs();
      const file = 'apps/x/a.ts';
      await hook({ tool_name: 'Bash', tool_input: { command: line(file) }, cwd: freshBranch(file) }, deps);
      expect(ran).toHaveLength(1);
      expect(ran[0]!.join(' ')).toContain('vitest');
    });

    it('counts a changed tracked file too', async () => {
      const { deps, ran } = stubs();
      const dir = freshBranch('doc/b.md');
      writeFileSync(join(dir, 'tools/claude-guard/checks.mjs'), '// changed\n');
      await hook({ tool_name: 'Bash', tool_input: { command: 'git commit -am x && git push' }, cwd: dir }, deps);
      expect(ran).toHaveLength(1);
    });

    it('judges a push with no commit in the line by the branch alone', async () => {
      const { deps, ran } = stubs();
      const dir = freshBranch('apps/x/a.ts');
      const g = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
      mkdirSync(join(dir, 'doc'));
      writeFileSync(join(dir, 'doc/c.md'), 'docs\n');
      g('add', 'doc/c.md');
      g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'docs');
      const r = await hook(push(dir), deps);
      expect(r.code).toBe(0);
      expect(ran).toEqual([]);
    });
  });

  describe('a checkout with nothing installed (#146)', () => {
    it('blocks with the install message and runs no check', async () => {
      const { deps, ran } = code(['apps/tasks/src/a.ts']);
      const r = await hook(push(repo), { ...deps, installed: () => false });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("dependencies aren't installed");
      expect(r.stderr).toContain('pnpm install');
      expect(ran).toEqual([]);
    });

    it('still lets a docs-only push through', async () => {
      const { deps, ran } = code(['doc/a.md']);
      const r = await hook(push(repo), { ...deps, installed: () => false });
      expect(r.code).toBe(0);
      expect(ran).toEqual([]);
    });
  });
});
