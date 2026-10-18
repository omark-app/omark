import { describe, expect, it } from 'vitest';
import { nextTag, releaseNotes } from '../release-notes.mjs';

describe('nextTag', () => {
  it('starts at 1 each day', () => {
    expect(nextTag(['prod-2026-10-17-1', 'prod-2026-10-17-2'], '2026-10-18')).toBe('prod-2026-10-18-1');
  });
  it('counts up within a day, past 9', () => {
    expect(nextTag(['prod-2026-10-18-1', 'prod-2026-10-18-10', 'prod-2026-10-18-2'], '2026-10-18')).toBe('prod-2026-10-18-11');
  });
  it('ignores other tags', () => {
    expect(nextTag(['v1', 'prod-2026-10-18-x'], '2026-10-18')).toBe('prod-2026-10-18-1');
  });
});

describe('releaseNotes', () => {
  const merges = [
    { subject: 'Merge pull request #16 from alipkagit/issue-16-x', body: 'Fix the toast on iPhone\n' },
    { subject: 'Merge pull request #15 from alipkagit/factory-spec', body: '' },
    { subject: 'Merge main into issue-16-x', body: '' },
  ];

  it('lists the merged PRs with their titles', () => {
    expect(releaseNotes({ merges, rollback: false, sha: 'abc1234' })).toBe(
      '- #16 Fix the toast on iPhone\n- #15 alipkagit/factory-spec\n',
    );
  });

  it('says so when nothing was merged', () => {
    expect(releaseNotes({ merges: [], rollback: false, sha: 'abc1234' })).toBe('No new pull requests since the last release.\n');
  });

  it('marks a rollback', () => {
    expect(releaseNotes({ merges: [], rollback: true, sha: 'abc1234' })).toBe('Rollback to abc1234.\n');
  });
});
