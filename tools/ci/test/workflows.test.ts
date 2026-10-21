import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const FILES = ['ci.yml', 'promote.yml'];
const path = (f: string) => new URL(`../../../.github/workflows/${f}`, import.meta.url);
const text = (f: string) => readFileSync(path(f), 'utf8');

interface Step { uses?: string; with?: unknown; env?: unknown; run?: string }
interface Job { if?: string; permissions?: Record<string, string>; steps?: Step[] }
const runsOnPr = (f: string) => 'pull_request' in ((parse(text(f)) as { on: object }).on ?? {});
const jobsOf = (f: string): [string, Job][] => Object.entries((parse(text(f)) as { jobs: Record<string, Job> }).jobs);
const allSteps = () => FILES.flatMap((f) => jobsOf(f).flatMap(([, j]) => j.steps ?? []));

describe('workflows', () => {
  it('runs no secret-using step for forks', () => {
    for (const f of FILES) {
      for (const [name, job] of jobsOf(f)) {
        const usesSecrets = (job.steps ?? []).some((s) => JSON.stringify({ with: s.with, env: s.env }).includes('secrets.'));
        const cond = job.if ?? '';
        if (usesSecrets) expect(cond, `${f} ${name}`).toContain("vars.DEPLOY_ENABLED == 'true'");
        // A job that can run on pull_request must not run for a fork's PR.
        if (runsOnPr(f) && !/github\.event_name == 'push'/.test(cond)) {
          if (usesSecrets || cond.includes('pull_request')) {
            expect(cond, `${f} ${name}`).toContain('github.event.pull_request.head.repo.full_name == github.repository');
          }
        }
      }
    }
  });

  it('gives the e2e job no write permission', () => {
    const e2e = jobsOf('ci.yml').find(([n]) => n === 'e2e')![1];
    expect(e2e.permissions).toEqual({ contents: 'read' });
  });

  it('never uses pull_request_target', () => {
    for (const f of FILES) expect(text(f)).not.toContain('pull_request_target');
  });

  it('pins third-party actions to a commit', () => {
    const uses = allSteps().flatMap((s) => (s.uses ? [s.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      if (u.startsWith('actions/')) continue;
      expect(u, u).toMatch(u.startsWith('docker://') ? /@sha256:[0-9a-f]{64}$/ : /@[0-9a-f]{40}$/);
    }
  });

  it('names no project, host or folder', () => {
    for (const f of FILES) {
      expect(text(f)).not.toMatch(/--project-name=(?!\$\{\{ vars\.)/);
      expect(text(f)).not.toMatch(/alipka|ALAI/i);
    }
  });
});
