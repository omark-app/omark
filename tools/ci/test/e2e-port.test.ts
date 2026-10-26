import { describe, expect, it } from 'vitest';
import { demoPort, e2ePort } from '../../../apps/tasks/e2e/port.ts';

describe('e2ePort', () => {
  it('uses TASKS_E2E_PORT when set', () => {
    expect(e2ePort('C:/Projects/TaskApp/apps/tasks', { TASKS_E2E_PORT: '4999', CI: 'true' })).toBe(4999);
  });

  it('keeps 4173 on CI', () => {
    expect(e2ePort('/home/runner/work/omark/apps/tasks', { CI: 'true' })).toBe(4173);
  });

  it('gives each local checkout its own port, the same on every run', () => {
    const main = e2ePort('C:/Projects/TaskApp/apps/tasks', {});
    const worktree = e2ePort('C:/Projects/TaskApp/.claude/worktrees/habits-1a2b3c/apps/tasks', {});
    expect(main).not.toBe(worktree);
    expect(e2ePort('C:/Projects/TaskApp/apps/tasks', {})).toBe(main);
    for (const port of [main, worktree]) {
      expect(port).toBeGreaterThanOrEqual(4200);
      expect(port).toBeLessThan(4900);
    }
  });

  it('ignores the case of Windows paths', () => {
    expect(e2ePort('C:/Projects/TaskApp/apps/tasks', {})).toBe(e2ePort('c:/projects/taskapp/apps/tasks', {}));
  });
});

describe('demoPort', () => {
  it('is the port after the e2e port, so each checkout gets its own pair', () => {
    expect(demoPort('/home/runner/work/omark/apps/tasks', { CI: 'true' })).toBe(4174);
    expect(demoPort('C:/Projects/TaskApp/apps/tasks', { TASKS_E2E_PORT: '4999' })).toBe(5000);
    expect(demoPort('C:/Projects/TaskApp/apps/tasks', {})).toBe(e2ePort('C:/Projects/TaskApp/apps/tasks', {}) + 1);
  });
});
