import { describe, expect, it } from 'vitest';
import { CheckFailed, maintainersIn, planApproval, upstreamOf } from '../plan-approval.mjs';

const REPO = 'owner/repo';
const FOOTER = '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';
const PLAN = { user: { login: 'agent-account' }, created_at: '2026-10-27T10:00:00Z', body: `Plan for #7: a thing\n\nFull plan: …${FOOTER}` };
const CODEOWNERS = '# Maintainers\n* @maintainer @helper\n/doc/ @owner/docs-team\n';

interface FakeIssue {
  comments: { user: { login: string } | null; created_at: string; updated_at?: string; body: string }[];
  events: { event: string; actor: { login: string } | null; created_at: string; label?: { name: string } }[];
  labels: string[];
  codeowners: string | null; // null = the file can't be read
}

/** A fake `gh api` for issue 7 of REPO. */
function fakeApi(issue: FakeIssue) {
  return async (path: string): Promise<unknown> => {
    if (path === `repos/${REPO}/issues/7/comments`) return issue.comments;
    if (path === `repos/${REPO}/issues/7/events`) return issue.events;
    if (path === `repos/${REPO}/issues/7`) return { labels: issue.labels.map((name) => ({ name })) };
    if (path === `repos/${REPO}/contents/.github/CODEOWNERS`) {
      if (issue.codeowners === null) throw new Error('HTTP 404');
      return { encoding: 'base64', content: Buffer.from(issue.codeowners).toString('base64') };
    }
    throw new Error(`unexpected path ${path}`);
  };
}

const labelled = (login: string, at: string) => ({ event: 'labeled', actor: { login }, created_at: at, label: { name: 'plan-approved' } });
const comment = (login: string, at: string, body: string) => ({ user: { login }, created_at: at, body });
const check = (issue: Partial<FakeIssue>) =>
  planApproval({ repo: REPO, issue: 7, api: fakeApi({ comments: [PLAN], events: [], labels: [], codeowners: CODEOWNERS, ...issue }) });

describe('maintainersIn', () => {
  it('reads the user handles of CODEOWNERS, not teams or comments', () => {
    expect(maintainersIn(CODEOWNERS)).toEqual(new Set(['maintainer', 'helper']));
    expect(maintainersIn('# @nobody\n*   @a-b  # @c\n')).toEqual(new Set(['a-b']));
  });
});

describe('upstreamOf', () => {
  it('is the parent of a fork, else the repository itself', async () => {
    const api = async (path: string) => (path === 'repos/me/omark' ? { full_name: 'me/omark', parent: { full_name: 'omark-app/omark' } } : { full_name: 'omark-app/omark' });
    expect(await upstreamOf('me/omark', api)).toBe('omark-app/omark');
    expect(await upstreamOf('omark-app/omark', api)).toBe('omark-app/omark');
  });
});

describe('planApproval', () => {
  it('approves when a maintainer added plan-approved after the plan', async () => {
    const r = await check({ events: [labelled('maintainer', '2026-10-27T11:00:00Z')], labels: ['plan-approved'] });
    expect(r).toEqual({ approved: true, by: 'maintainer', how: 'label' });
  });

  it('takes any account CODEOWNERS lists', async () => {
    const r = await check({ events: [labelled('helper', '2026-10-27T11:00:00Z')], labels: ['plan-approved'] });
    expect(r).toMatchObject({ approved: true, by: 'helper' });
  });

  it('does not count the label from anyone else', async () => {
    for (const who of ['contributor', 'triager', 'docs-team']) {
      const r = await check({ events: [labelled(who, '2026-10-27T11:00:00Z')], labels: ['plan-approved'] });
      expect(r.approved, who).toBe(false);
    }
  });

  it('does not count a label that was removed again', async () => {
    const r = await check({ events: [labelled('maintainer', '2026-10-27T11:00:00Z')], labels: [] });
    expect(r.approved).toBe(false);
  });

  it('goes by the latest time the label was added: a maintainer removing it and someone else adding it back is not approval', async () => {
    const r = await check({
      events: [
        labelled('maintainer', '2026-10-27T11:00:00Z'),
        { event: 'unlabeled', actor: { login: 'maintainer' }, created_at: '2026-10-27T11:30:00Z', label: { name: 'plan-approved' } },
        labelled('triager', '2026-10-27T12:00:00Z'),
      ],
      labels: ['plan-approved'],
    });
    expect(r.approved).toBe(false);
  });

  it('does not count approvals given before the plan comment was last edited', async () => {
    const edited = { ...PLAN, updated_at: '2026-10-27T12:00:00Z' };
    const r = await check({
      comments: [edited, comment('maintainer', '2026-10-27T11:00:00Z', 'approved')],
      events: [labelled('maintainer', '2026-10-27T11:00:00Z')],
      labels: ['plan-approved'],
    });
    expect(r.approved).toBe(false);
  });

  it.each(['approved', 'Approved.', 'APPROVED!', 'Approved, go ahead', 'approved\n\nnice plan'])('approves on the comment %j from a maintainer', async (body) => {
    const r = await check({ comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', body)] });
    expect(r).toEqual({ approved: true, by: 'maintainer', how: 'comment' });
  });

  it.each(['Approved? One question first', 'approved once the tests pass', 'Not approved yet', 'approvedish', 'I approved it'])(
    'does not take %j as an approval',
    async (body) => {
      const r = await check({ comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', body)] });
      expect(r.approved).toBe(false);
    },
  );

  it('does not count an "approved" comment from anyone else, or from a deleted account', async () => {
    const r = await check({
      comments: [PLAN, comment('contributor', '2026-10-27T11:00:00Z', 'approved'), { user: null, created_at: '2026-10-27T11:05:00Z', body: 'approved' }],
    });
    expect(r.approved).toBe(false);
  });

  it('does not count a comment an agent wrote, even from a maintainer account', async () => {
    const r = await check({ comments: [PLAN, comment('maintainer', '2026-10-27T11:00:00Z', `Approved by the maintainer in the session.${FOOTER}`)] });
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

  it('needs a plan comment for this issue, not one that only starts with its number', async () => {
    const other = { ...PLAN, body: `Plan for #71: another thing${FOOTER}` };
    const r = await check({ comments: [other, comment('maintainer', '2026-10-27T11:00:00Z', 'approved')] });
    expect(r).toEqual({ approved: false, reason: 'no plan comment ("Plan for #7: …") on the issue' });
  });

  it('fails as "could not check" when CODEOWNERS can\'t be read', async () => {
    await expect(check({ codeowners: null })).rejects.toBeInstanceOf(CheckFailed);
  });
});
