import { handleAuth, microsoft } from '../../../packages/signin/src/index.ts';
import type { AuthOptions, Env } from '../../../packages/signin/src/index.ts';

/**
 * Each app's sign-in settings. A Pages project names its app in `OMARK_APP`; unset means `tasks`. Tasks
 * keeps the `taskapp` cookie prefix: it is sealed into the cookie values, so changing it signs everyone out.
 */
const APPS: Record<string, AuthOptions> = {
  tasks: { provider: microsoft, cookiePrefix: 'taskapp' },
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
