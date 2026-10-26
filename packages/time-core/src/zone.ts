// Time zones only through Intl.DateTimeFormat. The process zone is never used.

const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The zone's offset from UTC at an instant, in ms. */
function offsetMs(ms: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(ms)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** An RFC 3339 instant to epoch milliseconds. */
export function parseInstant(rfc3339: string): number {
  const ms = Date.parse(rfc3339);
  if (Number.isNaN(ms)) throw new Error(`Not an RFC 3339 instant: ${rfc3339}`);
  return ms;
}

/** The local date (YYYY-MM-DD) of an instant in a zone. */
export function localDate(ms: number, tz: string): string {
  const d = new Date(ms + offsetMs(ms, tz));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local time with offset, `2026-10-22T09:00+02:00`; `:ss` only when seconds are not zero. */
export function formatLocal(ms: number, tz: string): string {
  const off = offsetMs(ms, tz);
  const d = new Date(ms + off);
  const seconds = d.getUTCSeconds();
  const offMin = Math.round(off / 60_000);
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  return (
    `${localDate(ms, tz)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` +
    `${seconds === 0 ? '' : ':' + pad(seconds)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** The first instant of a local date. If midnight does not exist, the first local instant. */
export function startOfDay(date: string, tz: string): number {
  const base = Date.parse(`${date}T00:00:00Z`);
  const before = offsetMs(base, tz);
  const guess = base - before;
  const after = offsetMs(guess, tz);
  const result = base - after;
  if (localDate(result, tz) < date) return result + (after - before);
  return result;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}
