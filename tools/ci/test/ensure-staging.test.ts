import { describe, expect, it } from 'vitest';
import { ensureStaging, NeedsHuman } from '../ensure-staging.mjs';

const ACCOUNT = 'acc1';
const ZONE = '00596fbc87cfb99f68372f59fbd4e55c';
const TOKEN = 'secret-token-value';

interface FakeCf {
  project: { subdomain: string } | null;
  domains: string[];
  records: { name: string; type: string; content: string; proxied: boolean }[];
  forbid?: RegExp;
  calls: string[];
}

/** A tiny in-memory Cloudflare API: just the calls ensureStaging makes. */
function fakeFetch(cf: FakeCf): typeof fetch {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const ok = (result: unknown) => json(200, { success: true, errors: [], result });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/client\/v4/, '');
    cf.calls.push(`${method} ${path}`);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    if (cf.forbid?.test(`${method} ${path}`)) {
      return json(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const projects = `/accounts/${ACCOUNT}/pages/projects`;
    if (method === 'GET' && path === `${projects}/taskapp-staging`) {
      return cf.project ? ok({ name: 'taskapp-staging', ...cf.project }) : json(404, { success: false, errors: [{ code: 8000007, message: 'Project not found' }] });
    }
    if (method === 'POST' && path === projects) {
      expect(body).toEqual({ name: 'taskapp-staging', production_branch: 'main' });
      cf.project = { subdomain: 'taskapp-staging-x1y.pages.dev' };
      return ok({ name: 'taskapp-staging', ...cf.project });
    }
    if (method === 'GET' && path === `${projects}/taskapp-staging/domains`) return ok(cf.domains.map((name) => ({ name })));
    if (method === 'POST' && path === `${projects}/taskapp-staging/domains`) {
      cf.domains.push(body.name);
      return ok({ name: body.name });
    }
    if (method === 'GET' && path === `/zones/${ZONE}/dns_records`) {
      return ok(cf.records.filter((r) => r.name === url.searchParams.get('name')));
    }
    if (method === 'POST' && path === `/zones/${ZONE}/dns_records`) {
      cf.records.push(body);
      return ok(body);
    }
    return json(404, { success: false, errors: [{ code: 7003, message: `no route ${method} ${path}` }] });
  }) as typeof fetch;
}

function setup(cf: Partial<FakeCf> = {}) {
  const state: FakeCf = { project: null, domains: [], records: [], calls: [], ...cf };
  const lines: string[] = [];
  const run = () => ensureStaging({ token: TOKEN, accountId: ACCOUNT, fetch: fakeFetch(state), log: (l: string) => lines.push(l) });
  return { state, lines, run };
}
const writes = (calls: string[]) => calls.filter((c) => c.startsWith('POST'));

describe('ensureStaging', () => {
  it('creates the project, custom domain and DNS record on a fresh account', async () => {
    const { state, run } = setup();
    const result = await run();
    expect(result).toEqual({ subdomain: 'taskapp-staging-x1y.pages.dev', warnings: [] });
    expect(writes(state.calls)).toHaveLength(3);
    expect(state.domains).toEqual(['tasks-staging.alipka.com']);
    expect(state.records).toEqual([
      { type: 'CNAME', name: 'tasks-staging.alipka.com', content: 'taskapp-staging-x1y.pages.dev', proxied: true },
    ]);
  });

  it('changes nothing when everything is set up', async () => {
    const { state, run } = setup();
    await run();
    state.calls.length = 0;
    await run();
    expect(writes(state.calls)).toEqual([]);
  });

  it('leaves an existing DNS record with another target alone and warns', async () => {
    const { state, run } = setup({
      project: { subdomain: 'taskapp-staging-x1y.pages.dev' },
      domains: ['tasks-staging.alipka.com'],
      records: [{ type: 'A', name: 'tasks-staging.alipka.com', content: '1.2.3.4', proxied: false }],
    });
    const result = await run();
    expect(writes(state.calls)).toEqual([]);
    expect(state.records[0]!.content).toBe('1.2.3.4');
    expect(result.warnings.join('\n')).toMatch(/tasks-staging\.alipka\.com.*1\.2\.3\.4/);
  });

  it('stops with the dashboard steps when the token may not create the project', async () => {
    const { run } = setup({ forbid: /^POST .*pages\/projects$/ });
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NeedsHuman);
    expect(String((err as Error).message)).toMatch(/Workers & Pages/);
    expect(String((err as Error).message)).toMatch(/taskapp-staging/);
  });

  it('stops with the DNS steps when the token may not add the record', async () => {
    const { run } = setup({ forbid: /^POST \/zones/ });
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NeedsHuman);
    expect(String((err as Error).message)).toMatch(/tasks-staging\.alipka\.com/);
  });

  it('never prints the token', async () => {
    const { lines, run } = setup({ forbid: /^POST .*domains$/ });
    const err = await run().catch((e: unknown) => e);
    expect([...lines, String((err as Error).message)].join('\n')).not.toContain(TOKEN);
  });
});
