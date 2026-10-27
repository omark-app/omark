import { formatLocal } from '@omark/time-core';

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The zone's offset from UTC at an instant, in ms (read from formatLocal). */
function offsetMs(ms: number, tz: string): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(formatLocal(ms, tz))!;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * MINUTE;
}

/**
 * A local wall time as an RFC 3339 instant with the zone's offset at that
 * instant (not exported from the package). Same rule in every zone:
 * a repeated hour (clocks go back) gives the later instant, the standard-time
 * one; a skipped time (clocks go forward) moves forward to the first valid
 * instant, so 02:30 becomes 03:30.
 */
export function local(date: string, minutes: number, tz: string): { dateTime: string } {
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
  const wallText = new Date(wall).toISOString().slice(0, 16);
  const before = offsetMs(wall - DAY, tz);
  const after = offsetMs(wall + DAY, tz);
  const fits = [wall - before, wall - after].filter((ms) => formatLocal(ms, tz).slice(0, 16) === wallText);
  const ms = fits.length > 0 ? Math.max(...fits) : wall - before;
  return { dateTime: formatLocal(ms, tz).replace(/(T\d\d:\d\d)([+-])/, '$1:00$2') };
}
