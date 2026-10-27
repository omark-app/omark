#!/usr/bin/env node
// Whether a large issue's latest plan is approved by a maintainer (#96, doc/factory.md). An approval counts
// only from an account with the Maintain or Admin role on the repository, checked through the GitHub API:
// the `plan-approved` label (by whoever added it, from the issue's events) or a comment that starts with
// "approved". Only approvals after the latest "Plan for #n" comment count, and comments an agent wrote (with
// the Claude Code footer) never do. Usage: plan-approval.mjs <issue> [owner/repo]; exit 0 = approved.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MAINTAINER_ROLES = new Set(['admin', 'maintain']);
const AGENT_FOOTER = /\[Claude Code\]\(https:\/\/claude\.com\/claude-code\)/;
const APPROVED = /^approved\b/i;

/**
 * @typedef {{ approved: true, by: string, how: 'label' | 'comment' } | { approved: false, reason: string }} Approval
 * @param {{ repo: string, issue: number, api: (path: string) => Promise<any> }} opts
 * @returns {Promise<Approval>}
 */
export async function planApproval({ repo, issue, api }) {
  const base = `repos/${repo}/issues/${issue}`;
  /** @type {{ user: { login: string }, created_at: string, updated_at?: string, body: string | null }[]} */
  const comments = await api(`${base}/comments`);
  const plan = comments.filter((c) => (c.body ?? '').startsWith(`Plan for #${issue}`)).at(-1);
  if (!plan) return { approved: false, reason: `no plan comment ("Plan for #${issue}: …")` };
  // An approval counts for the plan as it stood: editing the plan comment afterwards asks for a new one.
  const planAt = Math.max(Date.parse(plan.created_at), Date.parse(plan.updated_at ?? plan.created_at));
  const after = (/** @type {string} */ at) => Date.parse(at) > planAt;

  /** @type {{ login: string, at: string, how: 'label' | 'comment' }[]} */
  const candidates = [];
  const { labels } = await api(base);
  if (labels.some((/** @type {{ name: string }} */ l) => l.name === 'plan-approved')) {
    /** @type {{ event: string, actor: { login: string } | null, created_at: string, label?: { name: string } }[]} */
    const events = await api(`${base}/events`);
    // Only the latest time the label was added counts, so a maintainer removing it can't be undone by
    // someone else adding it back.
    const added = events.filter((e) => e.event === 'labeled' && e.label?.name === 'plan-approved').at(-1);
    if (added?.actor && after(added.created_at)) candidates.push({ login: added.actor.login, at: added.created_at, how: 'label' });
  }
  for (const c of comments) {
    const body = (c.body ?? '').trim();
    if (after(c.created_at) && APPROVED.test(body) && !AGENT_FOOTER.test(body)) {
      candidates.push({ login: c.user.login, at: c.created_at, how: 'comment' });
    }
  }

  candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const c of candidates) {
    if (await isMaintainer(api, repo, c.login)) return { approved: true, by: c.login, how: c.how };
  }
  return { approved: false, reason: 'no approval from a maintainer after the latest plan' };
}

/** @param {(path: string) => Promise<any>} api @param {string} repo @param {string} login */
async function isMaintainer(api, repo, login) {
  try {
    const { role_name: role } = await api(`repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`);
    return MAINTAINER_ROLES.has(role);
  } catch {
    return false; // not a collaborator (404), or the check failed: not an approval
  }
}

/** `gh api`, all pages of a list joined. @param {string} path */
async function gh(path) {
  const out = execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8' });
  const pages = JSON.parse(out);
  return Array.isArray(pages[0]) ? pages.flat() : pages[0];
}

/** The repository from `origin`, e.g. owner/repo. */
function originRepo() {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`can't read owner/repo from origin (${url}); pass it as the second argument`);
  return /** @type {string} */ (m[1]);
}

async function main() {
  const issue = Number(process.argv[2]);
  if (!Number.isInteger(issue) || issue < 1) {
    console.log('usage: plan-approval.mjs <issue> [owner/repo]');
    return 2;
  }
  const repo = process.argv[3] ?? originRepo();
  const r = await planApproval({ repo, issue, api: gh });
  console.log(r.approved ? `#${issue}: approved by ${r.by} (${r.how})` : `#${issue}: not approved: ${r.reason}`);
  return r.approved ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
