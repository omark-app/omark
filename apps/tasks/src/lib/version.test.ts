import { describe, expect, it } from 'vitest';
import { versionLabel } from './version.ts';

describe('versionLabel', () => {
  it('shows the build number and the day it was built', () => {
    expect(versionLabel(143, 'abc1234', '2026-10-22 14:43 UTC')).toBe('v143 · 22 Oct');
  });

  it('uses English month names whatever the locale, and no leading zero', () => {
    expect(versionLabel(1, 'abc1234', '2027-01-05 00:10 UTC')).toBe('v1 · 5 Jan');
    expect(versionLabel(9, 'abc1234', '2026-12-31 23:59 UTC')).toBe('v9 · 31 Dec');
  });

  it('falls back to the commit hash (or dev) without a build number', () => {
    expect(versionLabel(null, 'abc1234', '2026-10-22 14:43 UTC')).toBe('abc1234');
    expect(versionLabel(null, 'dev', 'unknown time')).toBe('dev');
  });

  it('leaves out the date when the build time is unknown', () => {
    expect(versionLabel(5, 'abc1234', 'unknown time')).toBe('v5');
  });
});
