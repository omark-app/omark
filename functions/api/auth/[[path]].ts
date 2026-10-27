import { google, handleAuth, microsoft } from '../../../packages/signin/src/index.ts';
import type { AuthOptions, Env } from '../../../packages/signin/src/index.ts';

/**
 * Each app's sign-in settings; the first provider is the default. A Pages project names its app in `OMARK_APP`; unset means `tasks`. Tasks
 * keeps the `taskapp` cookie prefix: it is sealed into the cookie values, so changing it signs everyone out.
 */
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
/** Omark Time's first sign-in only reads (Time spec 10.1); Drive and edit access are asked for later. */
const CALENDAR_READ = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
];
const APPS: Record<string, AuthOptions> = {
  tasks: { providers: { microsoft, google: google({ scopes: [DRIVE_FILE] }) }, cookiePrefix: 'taskapp' },
  time: { providers: { google: google({ scopes: CALENDAR_READ }) }, cookiePrefix: 'omarktime' },
};

/** Cloudflare Pages Function for every `/api/auth/*` request; the sign-in helper itself is `packages/signin`. */
export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const app = context.env.OMARK_APP || 'tasks';
  // hasOwn, so `constructor` or `toString` are not apps.
  if (!Object.hasOwn(APPS, app)) {
    console.error(`Omark sign-in: OMARK_APP "${app}" is not an app`);
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return handleAuth(context.request, context.env, APPS[app]!);
};
