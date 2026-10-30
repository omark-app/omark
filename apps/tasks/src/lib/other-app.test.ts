import { describe, expect, it } from 'vitest';
import { TIME_SETTINGS_URL } from './other-app.ts';

describe('TIME_SETTINGS_URL', () => {
  it('is the one Omark app’s Settings, which has Time’s', () => {
    expect(TIME_SETTINGS_URL).toBe('https://app.omark.app/settings');
  });
});
