import { describe, expect, it } from 'vitest';
import { timeSettingsUrl } from './other-app.ts';

describe('timeSettingsUrl', () => {
  it('sends staging to staging', () => {
    expect(timeSettingsUrl('staging-tasks.omark.app')).toBe('https://staging-time.omark.app/#settings');
  });

  it('sends the demo to the demo', () => {
    expect(timeSettingsUrl('demo-tasks.omark.app')).toBe('https://demo-time.omark.app/#settings');
  });

  it('sends everything else to production', () => {
    expect(timeSettingsUrl('tasks.omark.app')).toBe('https://time.omark.app/#settings');
    expect(timeSettingsUrl('localhost:5173')).toBe('https://time.omark.app/#settings');
  });
});
