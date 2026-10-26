import { dayMonth, toISODate, weekCtx, weekdayShort } from '@omark/tasks-core';
import type { SyncStatus } from '@omark/storage';

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
 * file in step with OneDrive; the list on screen is that copy plus edits made since.
 */
export function bannerText(status: SyncStatus, slow: boolean, syncedAt: Date | null, now: Date): string | null {
  const since = syncedAt ? ` since ${sinceText(syncedAt, now)}` : '';
  switch (status) {
    case 'saved':
      return null;
    case 'syncing':
      return slow ? `Still reaching OneDrive — showing your last saved copy${since ? ` (synced${since})` : ''}` : null;
    case 'offline':
      return `Can't reach OneDrive${since} — showing your last saved copy`;
    case 'signin':
      return `Sign in again to reach OneDrive${since} — showing your last saved copy`;
  }
}
