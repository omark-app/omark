import { isRealDate, keyOf } from '@omark/time-core';
import type { DateRange, Project } from '@omark/time-core';

export type View = 'hours' | 'charts' | 'fix' | 'projects' | 'report' | 'settings' | 'calendar';

/** The views, in the order the navigation shows them; the hash is `#/<id>`. `short` fits a phone's bottom bar. */
export const VIEWS: readonly { id: View; label: string; short: string }[] = [
  { id: 'hours', label: 'Hours', short: 'Hours' },
  { id: 'charts', label: 'Charts', short: 'Charts' },
  { id: 'fix', label: 'Fix list', short: 'Fix' },
  { id: 'projects', label: 'Projects', short: 'Projects' },
  { id: 'report', label: 'Report', short: 'Report' },
  { id: 'settings', label: 'Settings', short: 'Settings' },
  // The demo only: with no Google Calendar to look at, it shows the colours itself (spec 12).
  { id: 'calendar', label: 'Calendar', short: 'Calendar' },
];

/** The view a `location.hash` names; hours for anything else. */
export function viewOf(hash: string): View {
  const id = /^#\/?(\w+)$/.exec(hash)?.[1];
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

/** Omark Tasks' settings, on the matching host (as Tasks links to Time's: `timeSettingsUrl` in apps/tasks). */
export function tasksSettingsUrl(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith('staging-time.')) return 'https://staging-tasks.omark.app/#settings';
  if (h.startsWith('demo-time.')) return 'https://demo-tasks.omark.app/#settings';
  return 'https://tasks.omark.app/#settings';
}

/** The project form's start: the code given (from the fix list), upper case. */
export function newProject(code = ''): Project {
  return { code: code.toUpperCase(), description: '', client: '', rate: null, currency: '', archived: '', extra: {} };
}
