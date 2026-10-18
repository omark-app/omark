import { handleAuth } from '../../../packages/signin/src/index.ts';
import type { Env } from '../../../packages/signin/src/index.ts';

/** Cloudflare Pages Function for every `/api/auth/*` request; the sign-in helper itself is `packages/signin`. */
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handleAuth(context.request, context.env);
