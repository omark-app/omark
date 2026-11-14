import { describe, expect, it } from 'vitest';
import { bannerText, sinceText } from './sync-banner.ts';

const now = new Date(2026, 9, 18, 12, 30); // Sun 18 Oct

describe('sync banner', () => {
  it('says nothing while saved, or while a sync is still quick', () => {
    expect(bannerText('saved', false, null, now)).toBeNull();
    expect(bannerText('syncing', false, new Date(2026, 9, 18, 11, 2), now)).toBeNull();
  });

  it('names the problem and since when, and that the list is the last saved copy', () => {
    const at = new Date(2026, 9, 18, 11, 2);
    expect(bannerText('offline', false, at, now)).toBe("Can't reach OneDrive since 11:02 — showing your last saved copy");
    expect(bannerText('signin', false, at, now)).toBe('Sign in again to reach OneDrive since 11:02 — showing your last saved copy');
    expect(bannerText('syncing', true, at, now)).toBe('Still reaching OneDrive — showing your last saved copy (synced since 11:02)');
    expect(bannerText('offline', false, null, now)).toBe("Can't reach OneDrive — showing your last saved copy");
  });

  it('names the storage in use', () => {
    const at = new Date(2026, 9, 18, 11, 2);
    expect(bannerText('offline', false, at, now, 'Google Drive')).toBe(
      "Can't reach Google Drive since 11:02 — showing your last saved copy",
    );
    expect(bannerText('signin', false, at, now, 'Google Drive')).toBe(
      'Sign in again to reach Google Drive since 11:02 — showing your last saved copy',
    );
    expect(bannerText('syncing', true, at, now, 'Google Drive')).toBe(
      'Still reaching Google Drive — showing your last saved copy (synced since 11:02)',
    );
  });

  it('asks to allow access again to a folder instead of signing in', () => {
    const at = new Date(2026, 9, 18, 11, 2);
    expect(bannerText('signin', false, at, now, 'the folder Tasks', 'allow')).toBe(
      'Allow access again to reach the folder Tasks since 11:02 — showing your last saved copy',
    );
    expect(bannerText('offline', false, at, now, 'the folder Tasks', 'allow')).toBe(
      "Can't reach the folder Tasks since 11:02 — showing your last saved copy",
    );
  });

  it("names Omark's sign-in server when that is what can't be reached (#157)", () => {
    const at = new Date(2026, 9, 18, 11, 2);
    expect(bannerText('offline', false, at, now, 'OneDrive', 'signin', false, true)).toBe(
      "Can't reach Omark's sign-in server since 11:02 — showing your last saved copy",
    );
    expect(bannerText('offline', false, null, now, 'Google Drive', 'signin', false, true)).toBe(
      "Can't reach Omark's sign-in server — showing your last saved copy",
    );
    expect(bannerText('syncing', true, at, now, 'OneDrive', 'signin', false, true)).toBe(
      "Still reaching Omark's sign-in server — showing your last saved copy (synced since 11:02)",
    );
    expect(bannerText('syncing', false, at, now, 'OneDrive', 'signin', false, true)).toBeNull();
    // A sign-in that is needed keeps its own text, and a folder, which has no sign-in server, its own.
    expect(bannerText('signin', false, at, now, 'OneDrive', 'signin', false, true)).toBe(
      'Sign in again to reach OneDrive since 11:02 — showing your last saved copy',
    );
    expect(bannerText('offline', false, at, now, 'the folder Tasks', 'allow', false, true)).toBe(
      "Can't reach the folder Tasks since 11:02 — showing your last saved copy",
    );
  });

  it('says when the storage is full, for an account and for a folder (#68)', () => {
    const at = new Date(2026, 9, 18, 11, 2);
    expect(bannerText('offline', false, at, now, 'Google Drive', 'signin', true)).toBe(
      "Your Google Drive is full — changes are kept on this device until there's room",
    );
    expect(bannerText('offline', false, at, now, 'OneDrive', 'signin', true)).toBe(
      "Your OneDrive is full — changes are kept on this device until there's room",
    );
    expect(bannerText('offline', false, at, now, 'the folder Tasks', 'allow', true)).toBe(
      "The disk with the folder Tasks is full — changes are kept on this device until there's room",
    );
    // Only an `offline` status reads as full; a sign-in or a quiet sync keep their own texts.
    expect(bannerText('signin', false, at, now, 'OneDrive', 'signin', true)).toBe(
      'Sign in again to reach OneDrive since 11:02 — showing your last saved copy',
    );
    expect(bannerText('saved', false, at, now, 'OneDrive', 'signin', true)).toBeNull();
  });

  it('gives the day when the last sync was not today', () => {
    expect(sinceText(new Date(2026, 9, 18, 9, 5), now)).toBe('09:05');
    expect(sinceText(new Date(2026, 9, 17, 23, 59), now)).toBe('Sat 23:59');
    expect(sinceText(new Date(2026, 9, 12, 8, 0), now)).toBe('Mon 08:00');
    expect(sinceText(new Date(2026, 9, 10, 8, 0), now)).toBe('10 Oct 08:00');
  });
});
