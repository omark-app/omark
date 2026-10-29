import { google, handleAuth, microsoft } from '@omark/signin';
import type { AuthOptions, Env } from '@omark/signin';

const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
/** Asked for only when Time is turned on (one app spec, section 5); `edit` only when colouring is. */
const CALENDAR_READ = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
];
const CALENDAR_EDIT = ['https://www.googleapis.com/auth/calendar.events.owned'];

/**
 * The one Omark app's sign-in: Microsoft for OneDrive, Google for Google Drive, and the calendar added to the
 * Google sign-in when Time is on. Deployed from `apps/omark`, so it needs no `OMARK_APP`; the root
 * `functions/` serves the bridge (`tasks.alipka.com`) until roadmap 3.7.
 */
const OMARK: AuthOptions = {
  providers: {
    microsoft,
    google: google({ scopes: [DRIVE_FILE], extra: { calendar: CALENDAR_READ, edit: CALENDAR_EDIT } }),
  },
  cookiePrefix: 'omark',
  returnPaths: ['/tasks', '/time', '/goals'],
};

/** Cloudflare Pages Function for every `/api/auth/*` request; the sign-in helper itself is `packages/signin`. */
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handleAuth(context.request, context.env, OMARK);
