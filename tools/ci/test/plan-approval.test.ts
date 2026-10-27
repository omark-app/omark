import { describe, expect, it } from 'vitest';
import { planApproval } from '../plan-approval.mjs';

const REPO = 'owner/repo';
const FOOTER = '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';
const PLAN = { user: { login: 'agent-account' }, created_at: '2026-10-27T10:00:00Z', body: `Plan for #7: a thing\n\nFull plan: …${FOOTER}` };

interface FakeIssue {
  comments: { user: { login: string }; created_at: string; body: string }[];
  events: { event: string; actor: { login: string }; created_at: string; label?: { name: string } }[];
  labels: string[];
  roles: Record<string, string>; // login -> role_name; missing = not a collaborator (404)
}

/** A fake `gh api` for issue 7 of REPO. */
function fakeApi(issue: FakeIssue) {
  return async (path: string): Promise<unknown> => {
    if (path === `repos/${REPO}/issues/7/comments`) return issue.comments;
    if (path === `repos/${REPO}/issues/7/events`) return issue.events;
    if (path === `repos/${REPO}/issues/7`) return { labels: issue.labels.map((name) => ({ name })) };
    const m = path.match(new RegExp(`^repos/${REPO}/collaborators/([^/]+)/permission$`));
    if (m) {
      const role = issue.roles[m[1]!];
      if (!role) throw new Error('HTTP 404');
      return { role_name: role };
    }
    throw new Error(`unexpected path ${path}`);
  };
}

const labelled = (login: string, at: string) => ({ event: 'labeled', actor: { login }, created_at: at, label: { name: 'plan-approved' } });
const comment = (login: string, at: string, body: string) => ({ user: { login }, created_at: at, body });
const roles = { maintainer: 'admin', helper: 'maintain', contributor: 'read', triager: 'triage' };
const check = (issue: Partial<FakeIssue>) =>
  planApproval({ repo: REPO, issue: 7, api: fakeApi({ comments: [PLAN], events: [], labels: [], roles, ...issue }) });

describe('planApproval', () => {
  it('approves when a maintainer added plan-approved after the plan', async () => {
    const r = await check({ events: [labelled('maintainer', '2026-10-27T11:00:00Z')], labels: ['plan-approved'] });
    expect(r).toEqual({ approved: true, by: 'maintainer', how: 'label' });
  });

  it('takes the Maintain role as a maintainer too', async () => {
    const r = await check({ events: [labelled('helper', '2026-10-27T11:00:00Z')], labels: ['plan-approved'] });
    expect(r).toMatchObject({ approved: true, by: 'helper' });
  });

  it('does not count the label from a contributor or a triager', async () => {
    for (const who of ['contributor', 'triager', 'stranger']) {
      const r = await check({ events: [labelled(who, '2026-10-27T11:00:00Z')], labels: ['plan-approved'] });
      expect(r.approved, who).toBe(false);
    }
  });

  it('does not count a label that was removed again', async () => {
    const r = await check({ events: [labelled('maintainer', '2026-10-27T11:00:00Z')], labels: [] });
    expect(r.approved).toBe(false);
  });

  it('approves on an "approved" comment from a maintainer', async () => {
    const r = await check({ comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', 'Approved, go ahead')] });
    expect(r).toEqual({ approved: true, by: 'maintainer', how: 'comment' });
  });

  it('does not count an "approved" comment from a contributor', async () => {
    const r = await check({ comments: [PLAN, comment('contributor', '2026-10-27T11:00:00Z', 'approved')] });
    expect(r.approved).toBe(false);
  });

  it('does not count a comment an agent wrote, even from a maintainer account', async () => {
    const r = await check({ comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', `Approved by the maintainer in the session.${FOOTER}`)] });
    expect(r.approved).toBe(false);
  });

  it('does not count a comment that only mentions approval', async () => {
    const r = await check({ comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', 'Not approved yet: see below')] });
    expect(r.approved).toBe(false);
  });

  it('does not count approvals given before the latest plan', async () => {
    const newer = { ...PLAN, created_at: '2026-10-27T12:00:00Z', body: `Plan for #7 (updated): …${FOOTER}` };
    const r = await check({
      comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', 'approved'), newer],
      events: [labelled('maintainer', '2026-10-27T11:00:00Z')],
      labels: ['plan-approved'],
    });
    expect(r).toEqual({ approved: false, reason: 'no approval from a maintainer after the latest plan' });
  });

  it('needs a plan comment', async () => {
    const r = await check({ comments: [comment('maintainer', '2026-10-27T11:00:00Z', 'approved')] });
    expect(r).toEqual({ approved: false, reason: 'no plan comment ("Plan for #7: …")' });
  });
});
