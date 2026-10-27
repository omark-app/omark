#!/usr/bin/env node
// Whether a large issue's latest plan is approved by a maintainer (#96, doc/factory.md). Maintainers are the
// accounts `.github/CODEOWNERS` names on the repository's default branch, which only a maintainer can change
// and anyone who can read the repository can read. An approval counts only from one of them: the
// `plan-approved` label (by whoever added it last, from the issue's events) or a comment whose first line is
// "approved". Only approvals after the latest "Plan for #n" comment (and its last edit) count, and comments
// an agent wrote (with the Claude Code footer) never do. Run from a fork, it checks the fork's parent.
// Usage: plan-approval.mjs <issue> [owner/repo]; exit 0 = approved, 1 = not, 2 = could not check.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const AGENT_FOOTER = /\[Claude Code\]\(https:\/\/claude\.com\/claude-code\)/;
/** "approved", alone or followed by `.`/`!`, or by `,`/`.`/`!` and more words; never a question. */
const APPROVED = /^approved(?:[.!]*|[.!,]\s.*)$/i;

/** The check itself could not run (no access, no CODEOWNERS, GitHub unreachable). */
export class CheckFailed extends Error {}

/**
 * The user handles in a CODEOWNERS file. Team handles (`@org/team`) and comments are left out.
 * @param {string} text
 * @returns {Set<string>}
 */
export function maintainersIn(text) {
  const out = new Set();
  for (const line of text.split('\n')) {
    const code = line.replace(/#.*$/, '');
    for (const m of code.matchAll(/(?:^|\s)@([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)(?=\s|$)/g)) out.add(m[1]);
  }
  return out;
}

/**
 * The repository issues live in: the parent of a fork, else the repository itself.
 * @param {string} repo @param {(path: string) => Promise<any>} api
 */
export async function upstreamOf(repo, api) {
  const info = await api(`repos/${repo}`);
  return info.parent?.full_name ?? info.full_name ?? repo;
}

/**
 * @typedef {{ approved: true, by: string, how: 'label' | 'comment' } | { approved: false, reason: string }} Approval
 * @param {{ repo: string, issue: number, api: (path: string) => Promise<any> }} opts
 * @returns {Promise<Approval>} throws CheckFailed when it can't tell
 */
export async function planApproval({ repo, issue, api }) {
  const maintainers = await maintainersOf(repo, api);
  const base = `repos/${repo}/issues/${issue}`;
  /** @type {{ user: { login: string } | null, created_at: string, updated_at?: string, body: string | null }[]} */
  const comments = await api(`${base}/comments`);
  const isPlan = new RegExp(`^Plan for #${issue}(?!\\d)`);
  const plan = comments.filter((c) => isPlan.test(c.body ?? '')).at(-1);
  if (!plan) return { approved: false, reason: `no plan comment ("Plan for #${issue}: …") on the issue` };
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
    const firstLine = body.split('\n')[0]?.trim() ?? '';
    if (c.user && after(c.created_at) && APPROVED.test(firstLine) && !AGENT_FOOTER.test(body)) {
      candidates.push({ login: c.user.login, at: c.created_at, how: 'comment' });
    }
  }

  candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const ok = candidates.find((c) => maintainers.has(c.login));
  if (ok) return { approved: true, by: ok.login, how: ok.how };
  return { approved: false, reason: 'no approval from a maintainer after the latest plan' };
}

/** @param {string} repo @param {(path: string) => Promise<any>} api */
async function maintainersOf(repo, api) {
  let file;
  try {
    file = await api(`repos/${repo}/contents/.github/CODEOWNERS`);
  } catch (e) {
    throw new CheckFailed(`can't read .github/CODEOWNERS of ${repo}: ${e instanceof Error ? e.message : e}`);
  }
  const maintainers = maintainersIn(Buffer.from(file.content ?? '', file.encoding ?? 'base64').toString('utf8'));
  if (maintainers.size === 0) throw new CheckFailed(`.github/CODEOWNERS of ${repo} names no maintainer`);
  return maintainers;
}

/** `gh api`, all pages of a list joined. @param {string} path */
async function gh(path) {
  const out = execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const pages = JSON.parse(out);
  return Array.isArray(pages[0]) ? pages.flat() : pages[0];
}

/** The repository `origin` points to, e.g. owner/repo. */
function originRepo() {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!m) throw new CheckFailed(`can't read owner/repo from origin (${url}); pass it as the second argument`);
  return /** @type {string} */ (m[1]);
}

async function main() {
  const issue = Number(process.argv[2]);
  if (!Number.isInteger(issue) || issue < 1) {
    console.log('usage: plan-approval.mjs <issue> [owner/repo]');
    return 2;
  }
  try {
    const repo = process.argv[3] ?? (await upstreamOf(originRepo(), gh));
    const r = await planApproval({ repo, issue, api: gh });
    console.log(r.approved ? `${repo}#${issue}: approved by ${r.by} (${r.how})` : `${repo}#${issue}: not approved: ${r.reason}`);
    return r.approved ? 0 : 1;
  } catch (e) {
    console.log(`#${issue}: could not check: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
