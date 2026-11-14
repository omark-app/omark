import { dayMonth, toISODate, weekCtx, weekdayShort } from '@omark/tasks-core';
import type { SyncStatus } from '@omark/storage';
import { BRAND } from '../brand.ts';

export type Reconnect = 'signin' | 'allow';

/** `syncing` stays quiet (the faint status word) unless it lasts longer than this. */
export const QUIET_SYNC_MS = 4000;

/** `11:02` today, `Sat 11:02` within the past week, `17 Oct 11:02` before that. */
export function sinceText(at: Date, now: Date): string {
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = toISODate(at);
  const ctx = weekCtx(now);
  if (day === ctx.today) return time;
  const days = (new Date(ctx.today).getTime() - new Date(day).getTime()) / 86_400_000;
  if (days > 0 && days < 7) return `${weekdayShort(day)} ${time}`;
  return `${dayMonth(day, ctx)} ${time}`;
}

/**
 * The banner for a sync that is not fine, or null when the faint status word says enough: `saved`, and
 * `syncing` until it has lasted `QUIET_SYNC_MS` (`slow`). `syncedAt` is when this device last had every
 * file in step with the storage (`storageName`); the list on screen is that copy plus edits made since.
 * `reconnect` is how the storage is reached again: `signin` for an account, `allow` for a picked folder.
 * `full`: an `offline` status came from a full storage (#68), which the text says instead. `signInUnreachable`: the
 * failure (or the retry under way) is Omark's sign-in server, not the storage (#157); a folder has none.
 */
export function bannerText(
  status: SyncStatus,
  slow: boolean,
  syncedAt: Date | null,
  now: Date,
  storageName = 'OneDrive',
  reconnect: Reconnect = 'signin',
  full = false,
  signInUnreachable = false,
): string | null {
  const since = syncedAt ? ` since ${sinceText(syncedAt, now)}` : '';
  // An account's token comes from Omark's sign-in server; a picked folder has no such server.
  const place = signInUnreachable && reconnect === 'signin' ? `${BRAND.name}'s sign-in server` : storageName;
  switch (status) {
    case 'saved':
      return null;
    case 'syncing':
      return slow ? `Still reaching ${place} — showing your last saved copy${since ? ` (synced${since})` : ''}` : null;
    case 'offline':
      if (full) {
        const where = reconnect === 'allow' ? `The disk with ${storageName}` : `Your ${storageName}`;
        return `${where} is full — changes are kept on this device until there's room`;
      }
      return `Can't reach ${place}${since} — showing your last saved copy`;
    case 'signin':
      return `${reconnect === 'allow' ? 'Allow access' : 'Sign in'} again to reach ${storageName}${since} — showing your last saved copy`;
  }
}
