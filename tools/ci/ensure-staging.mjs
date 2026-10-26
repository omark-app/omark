#!/usr/bin/env node
// Makes sure the Cloudflare Pages project exists and, when a domain is given, that its custom domain and DNS
// record do too. Idempotent: it only creates what is missing and never changes what is there. Run by CI with
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and CF_STAGING_PROJECT (required), STAGING_DOMAIN and
// CF_ZONE_ID (both or neither); prints the project's pages.dev subdomain to $GITHUB_OUTPUT as `subdomain`.
import { appendFileSync } from 'node:fs';

const API = 'https://api.cloudflare.com/client/v4';

/** Something the token may not do: a person has to do it in the dashboard. */
export class NeedsHuman extends Error {}

/**
 * @param {{ token: string, accountId: string, project: string, domain?: string, zone?: string, fetch?: typeof fetch, log?: (line: string) => void }} opts
 * @returns {Promise<{ subdomain: string, warnings: string[] }>}
 */
export async function ensureStaging({ token, accountId, project: PROJECT, domain: DOMAIN, zone: ZONE, fetch: f = fetch, log = console.log }) {
  if (DOMAIN && !ZONE) throw new Error('A custom domain needs the Cloudflare zone ID (set CF_TASKS_ZONE_ID and TASKS_STAGING_DOMAIN together).');
  if (ZONE && !DOMAIN) throw new Error('A Cloudflare zone ID needs the custom domain (set CF_TASKS_ZONE_ID and TASKS_STAGING_DOMAIN together).');
  const PROJECT_STEPS = `Create it by hand in the Cloudflare dashboard:
1. Workers & Pages → Create → Pages → Upload assets. Name it ${PROJECT}, production branch main (upload any small file).
2. Re-run this CI job.`;
  const DOMAIN_STEPS = `Add it by hand in the Cloudflare dashboard:
1. Workers & Pages → ${PROJECT} → Custom domains → Set up a custom domain → ${DOMAIN}.
2. Let Cloudflare add the DNS record, then re-run this CI job.`;
  /** @type {string[]} */
  const warnings = [];
  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @param {string} [steps] what a person does if the token may not do this
   */
  const call = async (method, path, body, steps) => {
    const res = await f(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    /** @type {{ success?: boolean, result?: any, errors?: { code: number, message: string }[] }} */
    const data = await res.json().catch(() => ({}));
    const errors = (data.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ');
    if (res.status === 403 || res.status === 401) {
      throw new NeedsHuman(`The Cloudflare token may not ${method} ${path} (${errors || res.status}).\n${steps ?? ''}`);
    }
    return { status: res.status, ok: res.ok && data.success !== false, result: data.result, errors };
  };
  /**
   * @template {{ ok: boolean, status: number, errors: string }} T
   * @param {T} r
   * @param {string} what
   * @returns {T}
   */
  const must = (r, what) => {
    if (!r.ok) throw new Error(`Cloudflare: ${what} failed (${r.status} ${r.errors})`);
    return r;
  };

  const projects = `/accounts/${accountId}/pages/projects`;
  let projectInfo = await call('GET', `${projects}/${PROJECT}`, undefined, PROJECT_STEPS);
  if (projectInfo.status === 404) {
    log(`Creating the Pages project ${PROJECT}`);
    projectInfo = must(await call('POST', projects, { name: PROJECT, production_branch: 'main' }, PROJECT_STEPS), 'creating the project');
  }
  must(projectInfo, 'reading the project');
  const subdomain = String(projectInfo.result.subdomain);
  if (!DOMAIN || !ZONE) return { subdomain, warnings };

  const domains = must(await call('GET', `${projects}/${PROJECT}/domains`, undefined, DOMAIN_STEPS), 'listing domains');
  if (!domains.result.some((/** @type {{ name: string }} */ d) => d.name === DOMAIN)) {
    log(`Adding the custom domain ${DOMAIN}`);
    must(await call('POST', `${projects}/${PROJECT}/domains`, { name: DOMAIN }, DOMAIN_STEPS), 'adding the domain');
  }

  const records = must(await call('GET', `/zones/${ZONE}/dns_records?name=${DOMAIN}`, undefined, DOMAIN_STEPS), 'reading DNS');
  const existing = records.result[0];
  if (!existing) {
    log(`Adding the DNS record ${DOMAIN} → ${subdomain}`);
    must(
      await call('POST', `/zones/${ZONE}/dns_records`, { type: 'CNAME', name: DOMAIN, content: subdomain, proxied: true }, DOMAIN_STEPS),
      'adding the DNS record',
    );
  } else if (existing.type !== 'CNAME' || existing.content !== subdomain) {
    warnings.push(`DNS: ${DOMAIN} already points at ${existing.type} ${existing.content}, not ${subdomain}; left as is.`);
  }
  return { subdomain, warnings };
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const project = process.env.CF_STAGING_PROJECT;
  if (!token || !accountId || !project) {
    console.log('::error::CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and the CF_STAGING_PROJECT variable must be set.');
    return 1;
  }
  try {
    const { subdomain, warnings } = await ensureStaging({
      token,
      accountId,
      project,
      domain: process.env.STAGING_DOMAIN || undefined,
      zone: process.env.CF_ZONE_ID || undefined,
    });
    for (const w of warnings) console.log(`::warning::${w}`);
    console.log(`Staging project ready: ${subdomain}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `subdomain=${subdomain}\n`);
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // GitHub shows only the first line of ::error::, so the steps follow as plain lines.
    const [first, ...rest] = message.split('\n');
    console.log(`::error::${e instanceof NeedsHuman ? 'needs-human: ' : ''}${first}`);
    for (const line of rest) console.log(line);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
