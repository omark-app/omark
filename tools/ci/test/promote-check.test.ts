import { describe, expect, it } from 'vitest';
import { promoteCheck, Refused } from '../promote-check.mjs';

const REPO = 'owner/repo';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const OFF = 'c'.repeat(40);

interface Run { id: number; run_number?: number; head_sha: string; status: string; conclusion: string | null; event?: string }
interface FakeGh {
  commits: Record<string, string>; // ref -> sha
  onMain: Set<string>;
  runs: Run[]; // newest first
  artifacts: Record<number, { name: string; expired: boolean }[]>;
}

function fakeFetch(gh: FakeGh): typeof fetch {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const p = url.pathname.replace(`/repos/${REPO}`, '');
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^\/commits\/(.+)$/))) {
      const sha = gh.commits[decodeURIComponent(m[1]!)];
      return sha ? json(200, { sha }) : json(422, { message: 'No commit found' });
    }
    if ((m = p.match(/^\/compare\/([0-9a-f]+)\.\.\.main$/))) {
      return json(200, { status: gh.onMain.has(m[1]!) ? 'ahead' : 'diverged' });
    }
    if (p === '/actions/workflows/ci.yml/runs') {
      expect(url.searchParams.get('branch')).toBe('main');
      let runs = gh.runs.map((r) => ({ event: 'push', run_number: r.id * 10, run_started_at: `2026-10-0${r.id}T14:43:21Z`, ...r }));
      const event = url.searchParams.get('event');
      if (event) runs = runs.filter((r) => r.event === event);
      const sha = url.searchParams.get('head_sha');
      if (sha) runs = runs.filter((r) => r.head_sha === sha);
      if (url.searchParams.get('status') === 'success') runs = runs.filter((r) => r.conclusion === 'success');
      return json(200, { workflow_runs: runs });
    }
    if ((m = p.match(/^\/actions\/runs\/(\d+)\/artifacts$/))) {
      return json(200, { artifacts: gh.artifacts[Number(m[1])] ?? [] });
    }
    return json(404, { message: `no route ${p}` });
  }) as typeof fetch;
}

function world(): FakeGh {
  return {
    commits: { [A]: A, [B]: B, [OFF]: OFF, [A.slice(0, 7)]: A, 'prod-2026-10-01-1': B },
    onMain: new Set([A, B]),
    runs: [
      { id: 2, head_sha: A, status: 'completed', conclusion: 'success' },
      { id: 1, head_sha: B, status: 'completed', conclusion: 'success' },
    ],
    artifacts: { 2: [{ name: 'web-dist', expired: false }], 1: [{ name: 'web-dist', expired: true }] },
  };
}
const check = (gh: FakeGh, input: string) => promoteCheck({ repo: REPO, token: 't', input, fetch: fakeFetch(gh) });

describe('promoteCheck', () => {
  it('defaults to the commit of the last successful staging deploy', async () => {
    expect(await check(world(), '')).toEqual({ sha: A, runId: 2, runNumber: 20, builtAt: '2026-10-02 14:43 UTC', artifact: true });
  });

  it('accepts a CI run started by hand on main', async () => {
    const gh = world();
    gh.runs = [{ id: 7, head_sha: A, status: 'completed', conclusion: 'success', event: 'workflow_dispatch' }];
    expect(await check(gh, '')).toEqual({ sha: A, runId: 7, runNumber: 70, builtAt: '2026-10-07 14:43 UTC', artifact: false });
    expect((await check(gh, A)).runId).toBe(7);
  });

  it('ignores a pull request run from a branch called main', async () => {
    const gh = world();
    gh.onMain.add(OFF);
    gh.runs.unshift({ id: 9, head_sha: OFF, status: 'completed', conclusion: 'success', event: 'pull_request' });
    expect((await check(gh, '')).sha).toBe(A);
    await expect(check(gh, OFF)).rejects.toThrow(/no CI run on main/);
  });

  it('accepts a short SHA', async () => {
    expect((await check(world(), A.slice(0, 7))).sha).toBe(A);
  });

  it('accepts an older prod- tag (rollback), with its artifact expired', async () => {
    expect(await check(world(), 'prod-2026-10-01-1')).toEqual({ sha: B, runId: 1, runNumber: 10, builtAt: '2026-10-01 14:43 UTC', artifact: false });
  });

  it('refuses a commit not on main', async () => {
    const gh = world();
    gh.runs.unshift({ id: 3, head_sha: OFF, status: 'completed', conclusion: 'success' });
    await expect(check(gh, OFF)).rejects.toThrow(Refused);
    await expect(check(gh, OFF)).rejects.toThrow(/not on main/);
  });

  it('refuses a commit whose CI failed', async () => {
    const gh = world();
    gh.runs[0] = { id: 2, head_sha: A, status: 'completed', conclusion: 'failure' };
    await expect(check(gh, A)).rejects.toThrow(/did not pass.*failure/);
  });

  it('refuses a commit whose CI is still running', async () => {
    const gh = world();
    gh.runs[0] = { id: 2, head_sha: A, status: 'in_progress', conclusion: null };
    await expect(check(gh, A)).rejects.toThrow(/still running/);
  });

  it('refuses a commit with no CI run (a doc-only merge)', async () => {
    const gh = world();
    gh.runs = gh.runs.filter((r) => r.head_sha !== A);
    await expect(check(gh, A)).rejects.toThrow(/no CI run/);
  });

  it('refuses a typo with a clear message', async () => {
    await expect(check(world(), 'deadbeefx')).rejects.toThrow(/deadbeefx.*not found/);
  });
});
