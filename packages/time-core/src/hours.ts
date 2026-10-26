/** Round hours to 4 decimals. */
export function roundHours(h: number): number {
  const r = Math.round(h * 10000) / 10000;
  return r === 0 ? 0 : r;
}

/** Hours as plain decimal text: up to 4 decimals, no trailing zeros, no `-0`, no exponent. */
export function formatHours(h: number): string {
  const r = roundHours(h);
  if (r === 0) return '0';
  if (Math.abs(r) >= 1e21) return BigInt(r).toString();
  return r.toFixed(4).replace(/\.?0+$/, '');
}

/** Hours between two instants in epoch milliseconds, rounded to 4 decimals. */
export function hoursBetween(startMs: number, endMs: number): number {
  return roundHours((endMs - startMs) / 3600_000);
}
