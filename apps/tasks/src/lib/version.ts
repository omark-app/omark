const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The version shown in the footer: `v143 · 22 Oct` (the CI run number and the UTC day it was built), or
 * the commit hash (`dev` when unknown) for a build made outside CI. English month names, so it reads the
 * same on every device.
 */
export function versionLabel(number: number | null, id: string, builtAt: string): string {
  if (number === null) return id;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(builtAt);
  return m ? `v${number} · ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : `v${number}`;
}
