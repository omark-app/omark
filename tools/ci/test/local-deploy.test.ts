import { describe, expect, it } from 'vitest';
import { appBuildEnv, checkSite, checkVars, choosePromote, demoBuildEnv, Refused, shellLine, toPrune } from '../local-deploy.mjs';

const VARS = {
  CF_APP_PROJECT: 'omark-app',
  CF_APP_STAGING_PROJECT: 'omark-app-staging',
  CF_DEMO_PROJECT: 'omark-demo',
  CF_SITE_PROJECT: 'omark-site',
  APP_PROD_HOST: 'app.example.test',
  APP_PROD_URL: 'https://app.example.test',
  APP_STAGING_HOST: 'staging-app.example.test',
  APP_STAGING_URL: 'https://staging-app.example.test',
  APP_PREVIEW_HOST_SUFFIXES: 'omark-app-staging.pages.dev',
  DEMO_URL: 'https://demo.example.test',
  REAL_USE_URL: 'https://example.test',
  SITE_URL: 'https://example.test',
};
const SHA = 'abc1234def5678abc1234def5678abc1234def56';
const OLD = '0001111222233334444555566667777888899990';

describe('checkVars', () => {
  it('passes with every variable ship and promote need', () => {
    expect(() => checkVars(VARS, 'ship')).not.toThrow();
    expect(() => checkVars(VARS, 'promote')).not.toThrow();
  });

  it('names the missing variables', () => {
    const { CF_DEMO_PROJECT: _d, SITE_URL: _s, ...rest } = VARS;
    expect(() => checkVars(rest, 'ship')).toThrow(Refused);
    expect(() => checkVars(rest, 'ship')).toThrow(/CF_DEMO_PROJECT, SITE_URL/);
    const { CF_APP_PROJECT: _p, ...noProd } = VARS;
    expect(() => checkVars(noProd, 'promote')).toThrow(/CF_APP_PROJECT/);
  });

  it('refuses a production URL that is not the production host', () => {
    expect(() => checkVars({ ...VARS, APP_PROD_URL: 'https://other.test' }, 'promote')).toThrow(/APP_PROD_URL/);
  });

  it('refuses a staging URL that is not the staging host', () => {
    expect(() => checkVars({ ...VARS, APP_STAGING_URL: 'https://other.test' }, 'ship')).toThrow(/APP_STAGING_URL/);
  });
});

describe('shellLine', () => {
  it('quotes the words with spaces, for the Windows shell', () => {
    expect(shellLine('node', ['C:\\My Projects\\x.mjs', 'abc', '--title', 'a b'])).toBe('node "C:\\My Projects\\x.mjs" abc --title "a b"');
  });
});

describe('build environments', () => {
  it('builds the one app for staging and production with the hosts, commit and number', () => {
    expect(appBuildEnv(VARS, { sha: SHA, number: 556, builtAt: '2026-10-30 09:00 UTC' })).toEqual({
      BUILD_SHA: SHA,
      BUILD_NUMBER: '556',
      BUILD_TIME: '2026-10-30 09:00 UTC',
      VITE_PROD_HOST: 'app.example.test',
      VITE_STAGING_HOST: 'staging-app.example.test',
      VITE_PREVIEW_HOST_SUFFIXES: 'omark-app-staging.pages.dev',
    });
  });

  it('builds the demo with the demo storage and the link to the real app', () => {
    expect(demoBuildEnv(VARS, { sha: SHA, number: 556 })).toEqual({
      BUILD_SHA: SHA,
      BUILD_NUMBER: '556',
      VITE_STORAGE: 'demo',
      VITE_REAL_USE_URL: 'https://example.test',
    });
  });
});

describe('choosePromote', () => {
  const resolve = (ref: string) => ({ main: SHA, [SHA]: SHA, 'omark-prod-2026-10-29-1': OLD, [OLD]: OLD })[ref] ?? null;
  const onMain = () => true;
  const kept = [{ sha: SHA }];

  it('takes what staging runs now when no commit is given', () => {
    expect(choosePromote({ arg: '', stagingBuild: 'abc1234', kept, resolve, onMain })).toEqual({ sha: SHA, rebuild: false });
  });

  it('refuses when staging runs a build this computer did not ship', () => {
    expect(() => choosePromote({ arg: '', stagingBuild: 'fff9999', kept, resolve, onMain })).toThrow(/staging runs fff9999.*pnpm ship/);
    expect(() => choosePromote({ arg: '', stagingBuild: null, kept, resolve, onMain })).toThrow(/version.json/);
  });

  it('takes a commit staging ran', () => {
    expect(choosePromote({ arg: SHA, stagingBuild: 'fff9999', kept, resolve, onMain })).toEqual({ sha: SHA, rebuild: false });
  });

  it('refuses a commit staging never ran, or one that is unknown', () => {
    expect(() => choosePromote({ arg: OLD, stagingBuild: 'abc1234', kept, resolve, onMain })).toThrow(/staging never ran 0001111/);
    expect(() => choosePromote({ arg: 'nope', stagingBuild: 'abc1234', kept, resolve, onMain })).toThrow(/nope is not a commit/);
  });

  it('rolls back to a release tag, rebuilding it when its build is gone', () => {
    expect(choosePromote({ arg: 'omark-prod-2026-10-29-1', stagingBuild: 'abc1234', kept, resolve, onMain })).toEqual({ sha: OLD, rebuild: true });
    expect(choosePromote({ arg: 'omark-prod-2026-10-29-1', stagingBuild: 'abc1234', kept: [{ sha: OLD }], resolve, onMain })).toEqual({
      sha: OLD,
      rebuild: false,
    });
  });

  it('refuses a commit that is not on main', () => {
    expect(() => choosePromote({ arg: SHA, stagingBuild: 'abc1234', kept, resolve, onMain: () => false })).toThrow(/not on main/);
  });
});

describe('checkSite', () => {
  const site = (privacy: string, csp: boolean) =>
    (async (input: string | URL | Request) =>
      String(input).endsWith('/privacy/')
        ? new Response(privacy)
        : new Response('<html>', { headers: csp ? { 'Content-Security-Policy': "default-src 'self'" } : {} })) as typeof fetch;

  it('passes when the privacy policy has Limited Use and the site sends its CSP', async () => {
    expect((await checkSite({ url: 'https://example.test', fetch: site('… Limited Use …', true), sleep: async () => {} })).ok).toBe(true);
  });

  it('fails, after retrying, without either', async () => {
    let calls = 0;
    const counted = (async (input: string | URL | Request) => {
      calls++;
      return site('no', true)(input);
    }) as typeof fetch;
    const r = await checkSite({ url: 'https://example.test', fetch: counted, attempts: 3, sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Limited Use/);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect((await checkSite({ url: 'https://example.test', fetch: site('Limited Use', false), attempts: 1, sleep: async () => {} })).message).toMatch(
      /Content-Security-Policy/,
    );
  });
});

describe('toPrune', () => {
  it('keeps the newest builds and names the rest', () => {
    const records = ['a', 'b', 'c', 'd'].map((sha, i) => ({ sha, builtAt: `2026-10-2${i}T10:00:00Z` }));
    expect(toPrune(records, 2).sort()).toEqual(['a', 'b']);
    expect(toPrune(records, 5)).toEqual([]);
  });
});
