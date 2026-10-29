/** The accesses Time adds to a Google sign-in, so a failed sign-in about them is Time's to show. */
const CALENDAR_ACCESSES = ['calendar', 'edit'];

/**
 * Whose a sign-in redirect's error is (`?signin_error=`), by the session it names: `time` for the calendar's
 * (`googlecal`, or an access Time adds), else the storage's provider (Microsoft when none is named); null when the
 * page is no failed sign-in's return.
 */
export function redirectFor(href: string): 'time' | 'microsoft' | 'google' | null {
  const q = new URL(href).searchParams;
  if (q.get('signin_error') === null) return null;
  if (q.get('provider') === 'googlecal' || CALENDAR_ACCESSES.includes(q.get('add') ?? '')) return 'time';
  return q.get('provider') === 'google' ? 'google' : 'microsoft';
}
