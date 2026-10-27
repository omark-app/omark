import { isRealDate, keyOf } from '@omark/time-core';
import type { DateRange, Project } from '@omark/time-core';

export type View = 'hours' | 'charts' | 'fix' | 'projects' | 'report' | 'settings';

/** The views, in the order the navigation shows them; the hash is `#/<id>`. */
export const VIEWS: readonly { id: View; label: string }[] = [
  { id: 'hours', label: 'Hours' },
  { id: 'charts', label: 'Charts' },
  { id: 'fix', label: 'Fix list' },
  { id: 'projects', label: 'Projects' },
  { id: 'report', label: 'Report' },
  { id: 'settings', label: 'Settings' },
];

/** The view a `location.hash` names; hours for anything else. */
export function viewOf(hash: string): View {
  const id = /^#\/(\w+)$/.exec(hash)?.[1];
  return VIEWS.find((v) => v.id === id)?.id ?? 'hours';
}

/** A range the user typed: two real dates, the first not after the second; else what is wrong. */
export function customRange(from: string, to: string): DateRange | string {
  if (!isRealDate(from) || !isRealDate(to)) return 'Pick two dates';
  if (from > to) return 'The first day must not be after the last';
  return { from, to };
}

/** `omark-time-<what>-<from>-to-<to>.<ext>`: the client or the codes, with anything but letters and digits as `-`. */
export function reportFileName(ext: 'csv' | 'md', range: DateRange, what: { codes?: string[]; client?: string }): string {
  const name = what.client ?? (what.codes ?? []).join('-');
  const slug = name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ['omark-time', ...(slug ? [slug] : []), `${range.from}-to-${range.to}`].join('-') + `.${ext}`;
}

/** The event's page in Google Calendar, from the link the sync kept; only Google's own calendar pages count. */
export function eventLink(links: Record<string, string>, calendar: string, eventId: string): string | null {
  const link = links[keyOf(calendar, eventId)];
  return link && /^https:\/\/(www\.google\.com\/calendar|calendar\.google\.com)\//.test(link) ? link : null;
}

/** The project form's start: the code given (from the fix list), upper case. */
export function newProject(code = ''): Project {
  return { code: code.toUpperCase(), description: '', client: '', rate: null, currency: '', archived: '', extra: {} };
}
